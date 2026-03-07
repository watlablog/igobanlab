import asyncio
import json
import logging
import os
from collections import deque
from dataclasses import dataclass

from .errors import ApiError
from .models import AnalysisRequest, MovePayload

LOGGER = logging.getLogger(__name__)
GTP_COLUMNS = "ABCDEFGHJKLMNOPQRSTUVWXYZ"


@dataclass(frozen=True)
class KataGoSettings:
    enabled: bool
    binary: str
    config_path: str | None
    model_path: str | None
    override_config: str
    timeout_sec: float
    max_requests_per_minute: int
    appimage_extract_and_run: bool

    @classmethod
    def from_env(cls) -> "KataGoSettings":
        enabled = os.getenv("KATAGO_ENABLED", "false").lower() == "true"
        binary = os.getenv("KATAGO_BINARY", "katago")
        config_path = os.getenv("KATAGO_CONFIG")
        model_path = os.getenv("KATAGO_MODEL")
        override_config = os.getenv(
            "KATAGO_OVERRIDE_CONFIG", "logToStderr=true,logFile=/tmp/katago.log"
        ).strip()
        timeout_raw = os.getenv("KATAGO_TIMEOUT_SEC", "20")
        max_requests_raw = os.getenv("KATAGO_MAX_REQUESTS_PER_MINUTE", "30")
        appimage_extract_raw = os.getenv("KATAGO_APPIMAGE_EXTRACT_AND_RUN", "true").lower()

        try:
            timeout_sec = max(1.0, float(timeout_raw))
        except ValueError:
            timeout_sec = 20.0

        try:
            max_requests = max(1, int(max_requests_raw))
        except ValueError:
            max_requests = 30

        appimage_extract_and_run = appimage_extract_raw not in {"0", "false", "no"}

        return cls(
            enabled=enabled,
            binary=binary,
            config_path=config_path,
            model_path=model_path,
            override_config=override_config,
            timeout_sec=timeout_sec,
            max_requests_per_minute=max_requests,
            appimage_extract_and_run=appimage_extract_and_run,
        )


def vertex_to_gtp(x: int, y: int, board_size: int) -> str:
    if x < 0 or y < 0 or x >= board_size or y >= board_size:
        raise ApiError(
            status_code=400,
            code="INVALID_REQUEST",
            message="Move coordinates are out of range.",
        )

    if board_size > len(GTP_COLUMNS):
        raise ApiError(
            status_code=400,
            code="INVALID_REQUEST",
            message="Unsupported board size for GTP conversion.",
        )

    column = GTP_COLUMNS[x]
    row = board_size - y
    return f"{column}{row}"


def gtp_to_vertex(move: str, board_size: int) -> tuple[int, int] | None:
    token = move.strip().upper()
    if token in {"PASS", "RESIGN"}:
        return None
    if len(token) < 2:
        return None

    column = token[0]
    row_part = token[1:]
    if column not in GTP_COLUMNS or not row_part.isdigit():
        return None

    x = GTP_COLUMNS.index(column)
    row = int(row_part)
    y = board_size - row
    if x < 0 or y < 0 or x >= board_size or y >= board_size:
        return None
    return (x, y)


def _handicap_vertices(board_size: int, handicap: int) -> list[tuple[int, int]]:
    if handicap <= 0:
        return []

    star = 2 if board_size == 9 else 3
    middle = board_size // 2
    end = board_size - 1 - star

    points = [
        (end, star),  # upper-right
        (star, end),  # lower-left
        (end, end),  # lower-right
        (star, star),  # upper-left
        (end, middle),  # right-middle
        (star, middle),  # left-middle
        (middle, star),  # top-middle
        (middle, end),  # bottom-middle
        (middle, middle),  # center
    ]
    return points[:handicap]


def _to_engine_moves(
    moves: list[MovePayload], board_size: int, handicap: int
) -> list[list[str]]:
    serialized: list[list[str]] = []
    to_play = "B"

    # Analysis mode accepts plain move list. Handicap is represented by free-placement
    # equivalent sequence: B placement + optional W pass between placements.
    handicap_vertices = _handicap_vertices(board_size, handicap)
    for idx, (x, y) in enumerate(handicap_vertices):
        serialized.append(["B", vertex_to_gtp(x, y, board_size)])
        to_play = "W"
        if idx != len(handicap_vertices) - 1:
            serialized.append(["W", "pass"])
            to_play = "B"

    for move in moves:
        if move.is_pass:
            serialized.append([to_play, "pass"])
        else:
            assert move.x is not None
            assert move.y is not None
            serialized.append([to_play, vertex_to_gtp(move.x, move.y, board_size)])
        to_play = "W" if to_play == "B" else "B"

    return serialized


def build_analysis_query(request: AnalysisRequest, request_id: str) -> dict[str, object]:
    return {
        "id": request_id,
        "boardXSize": request.boardSize,
        "boardYSize": request.boardSize,
        "rules": request.rules,
        "komi": request.komi,
        "moves": _to_engine_moves(request.moves, request.boardSize, request.handicap),
        "maxVisits": request.maxVisits,
        "includeOwnership": request.includeOwnership,
        "includePolicy": True,
    }


class KataGoEngine:
    def __init__(self, settings: KataGoSettings) -> None:
        self._settings = settings
        self._lock = asyncio.Lock()
        self._process: asyncio.subprocess.Process | None = None
        self._stderr_task: asyncio.Task[None] | None = None
        self._stderr_ring: deque[str] = deque(maxlen=30)
        self._next_id = 0

    async def close(self) -> None:
        if self._stderr_task:
            self._stderr_task.cancel()
            self._stderr_task = None

        if self._process and self._process.returncode is None:
            self._process.terminate()
            try:
                await asyncio.wait_for(self._process.wait(), timeout=3.0)
            except asyncio.TimeoutError:
                self._process.kill()
        self._process = None

    async def analyze(self, request: AnalysisRequest) -> dict[str, object]:
        async with self._lock:
            process = await self._ensure_process()
            self._next_id += 1
            request_id = str(self._next_id)
            payload = build_analysis_query(request, request_id)
            line = json.dumps(payload, separators=(",", ":")) + "\n"

            try:
                assert process.stdin is not None
                process.stdin.write(line.encode("utf-8"))
                await process.stdin.drain()
                return await self._read_response(process, request_id)
            except ApiError:
                await self._recover_after_failure()
                raise
            except Exception as exc:  # pragma: no cover - defensive
                await self._recover_after_failure()
                raise ApiError(
                    status_code=503,
                    code="ENGINE_UNAVAILABLE",
                    message=f"KataGo engine failure: {exc}",
                ) from exc

    async def _ensure_process(self) -> asyncio.subprocess.Process:
        if not self._settings.enabled:
            raise ApiError(
                status_code=503,
                code="ENGINE_DISABLED",
                message="KataGo is disabled. Set KATAGO_ENABLED=true.",
            )

        if not self._settings.config_path or not self._settings.model_path:
            raise ApiError(
                status_code=503,
                code="ENGINE_NOT_CONFIGURED",
                message="Set KATAGO_CONFIG and KATAGO_MODEL.",
            )

        if not os.path.isfile(self._settings.config_path):
            raise ApiError(
                status_code=503,
                code="ENGINE_NOT_CONFIGURED",
                message=f"KATAGO_CONFIG file not found: {self._settings.config_path}",
            )

        if not os.path.isfile(self._settings.model_path):
            raise ApiError(
                status_code=503,
                code="ENGINE_NOT_CONFIGURED",
                message=f"KATAGO_MODEL file not found: {self._settings.model_path}",
            )

        if not os.path.isfile(self._settings.binary):
            raise ApiError(
                status_code=503,
                code="ENGINE_UNAVAILABLE",
                message=f"KATAGO_BINARY file not found: {self._settings.binary}",
            )

        if not os.access(self._settings.binary, os.X_OK):
            raise ApiError(
                status_code=503,
                code="ENGINE_UNAVAILABLE",
                message=f"KATAGO_BINARY is not executable: {self._settings.binary}",
            )

        process = self._process
        if process and process.returncode is None:
            return process

        command = [
            self._settings.binary,
            "analysis",
            "-config",
            self._settings.config_path,
            "-model",
            self._settings.model_path,
        ]
        if self._settings.override_config:
            command.extend(["-override-config", self._settings.override_config])
        self._stderr_ring.clear()

        try:
            child_env = os.environ.copy()
            if self._settings.appimage_extract_and_run:
                child_env["APPIMAGE_EXTRACT_AND_RUN"] = "1"
            child_env.setdefault("TMPDIR", "/tmp")

            process = await asyncio.create_subprocess_exec(
                *command,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=child_env,
            )
        except FileNotFoundError as exc:
            raise ApiError(
                status_code=503,
                code="ENGINE_UNAVAILABLE",
                message=f"KataGo binary not found: {self._settings.binary}",
            ) from exc
        except Exception as exc:  # pragma: no cover - defensive
            raise ApiError(
                status_code=503,
                code="ENGINE_UNAVAILABLE",
                message=f"Failed to start KataGo: {exc}",
            ) from exc

        self._process = process
        self._stderr_task = asyncio.create_task(self._drain_stderr(process))
        return process

    async def _read_response(
        self, process: asyncio.subprocess.Process, request_id: str
    ) -> dict[str, object]:
        while True:
            try:
                assert process.stdout is not None
                raw = await asyncio.wait_for(
                    process.stdout.readline(), timeout=self._settings.timeout_sec
                )
            except asyncio.TimeoutError as exc:
                raise ApiError(
                    status_code=504,
                    code="ENGINE_TIMEOUT",
                    message="KataGo analysis timed out.",
                ) from exc

            if not raw:
                returncode = process.returncode
                stderr_tail = " | ".join(list(self._stderr_ring)[-6:])
                raise ApiError(
                    status_code=503,
                    code="ENGINE_UNAVAILABLE",
                    message=(
                        f"KataGo process closed unexpectedly (returncode={returncode}). "
                        f"stderr_tail={stderr_tail or '(empty)'}"
                    ),
                )

            try:
                payload = json.loads(raw.decode("utf-8").strip())
            except json.JSONDecodeError:
                continue

            if str(payload.get("id", "")) != request_id:
                continue

            error = payload.get("error")
            if error:
                raise ApiError(
                    status_code=503,
                    code="ENGINE_ERROR",
                    message=str(error),
                )

            if payload.get("isDuringSearch", False):
                continue

            if isinstance(payload, dict):
                return payload

            raise ApiError(
                status_code=503,
                code="ENGINE_PROTOCOL_ERROR",
                message="Invalid response type from KataGo.",
            )

    async def _recover_after_failure(self) -> None:
        await self.close()

    async def _drain_stderr(self, process: asyncio.subprocess.Process) -> None:
        if process.stderr is None:
            return
        try:
            while True:
                raw = await process.stderr.readline()
                if not raw:
                    return
                line = raw.decode("utf-8", errors="replace").rstrip()
                self._stderr_ring.append(line)
                LOGGER.warning("katago stderr: %s", line)
        except asyncio.CancelledError:  # pragma: no cover - cancellation path
            return
