import time
from collections import defaultdict, deque

from .errors import ApiError
from .katago import KataGoEngine, gtp_to_vertex
from .models import (
    AnalysisRequest,
    MoveAnalysisRequest,
    MoveAnalysisResponse,
    MoveCandidateResponse,
    MoveResponse,
    ScoreAnalysisResponse,
)


def _to_float(value: object, fallback: float | None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _to_int(value: object, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _root_value(raw: dict[str, object], key: str, fallback: object) -> object:
    root = raw.get("rootInfo")
    if isinstance(root, dict) and key in root:
        return root[key]
    if key in raw:
        return raw[key]
    return fallback


def _normalize_ownership(
    raw_ownership: object, board_size: int
) -> list[list[int]] | None:
    if not isinstance(raw_ownership, list):
        return None
    if len(raw_ownership) != board_size * board_size:
        return None

    def to_cell(value: object) -> int:
        numeric = _to_float(value, 0.0) or 0.0
        if numeric > 0.2:
            return 1
        if numeric < -0.2:
            return -1
        return 0

    result: list[list[int]] = []
    for y in range(board_size):
        row = []
        for x in range(board_size):
            row.append(to_cell(raw_ownership[y * board_size + x]))
        result.append(row)
    return result


def _decode_move(token: object, board_size: int) -> MoveResponse | None:
    if not isinstance(token, str):
        return None
    vertex = gtp_to_vertex(token, board_size)
    if vertex is None:
        if token.strip().lower() == "pass":
            return MoveResponse(is_pass=True)
        return None
    x, y = vertex
    return MoveResponse(x=x, y=y, is_pass=False)


class SlidingWindowRateLimiter:
    def __init__(self, max_requests: int, window_seconds: float) -> None:
        self._max_requests = max(1, max_requests)
        self._window_seconds = max(1.0, window_seconds)
        self._events = defaultdict(deque)

    def allow(self, key: str) -> bool:
        now = time.monotonic()
        queue = self._events[key]
        boundary = now - self._window_seconds

        while queue and queue[0] < boundary:
            queue.popleft()

        if len(queue) >= self._max_requests:
            return False

        queue.append(now)
        return True


class AnalysisService:
    def __init__(self, engine: KataGoEngine, rate_limiter: SlidingWindowRateLimiter) -> None:
        self._engine = engine
        self._rate_limiter = rate_limiter

    async def analyze_score(
        self, request: AnalysisRequest, requester_key: str
    ) -> ScoreAnalysisResponse:
        self._guard_rate_limit(requester_key)
        raw = await self._engine.analyze(request)

        score_lead = _to_float(_root_value(raw, "scoreLead", 0.0), 0.0) or 0.0
        winrate = _to_float(_root_value(raw, "winrate", 0.5), 0.5) or 0.5
        visits = _to_int(_root_value(raw, "visits", request.maxVisits), request.maxVisits)

        ownership = None
        if request.includeOwnership:
            ownership = _normalize_ownership(raw.get("ownership"), request.boardSize)

        return ScoreAnalysisResponse(
            scoreLead=score_lead,
            winrate=winrate,
            visits=visits,
            ownership=ownership,
            engine="KataGo",
        )

    async def analyze_move(
        self, request: MoveAnalysisRequest, requester_key: str
    ) -> MoveAnalysisResponse:
        self._guard_rate_limit(requester_key)
        raw = await self._engine.analyze(request)

        score_lead = _to_float(_root_value(raw, "scoreLead", 0.0), 0.0) or 0.0
        winrate = _to_float(_root_value(raw, "winrate", 0.5), 0.5) or 0.5
        visits = _to_int(_root_value(raw, "visits", request.maxVisits), request.maxVisits)

        candidates: list[MoveCandidateResponse] = []
        raw_candidates = raw.get("moveInfos")
        if isinstance(raw_candidates, list):
            for item in raw_candidates[: request.topN]:
                if not isinstance(item, dict):
                    continue
                move = _decode_move(item.get("move"), request.boardSize)
                if move is None:
                    continue
                candidates.append(
                    MoveCandidateResponse(
                        move=move,
                        winrate=_to_float(item.get("winrate"), None),
                        scoreLead=_to_float(item.get("scoreLead"), None),
                        visits=_to_int(item.get("visits"), 0) or None,
                    )
                )

        best_move = candidates[0].move if candidates else None
        return MoveAnalysisResponse(
            bestMove=best_move,
            candidates=candidates,
            scoreLead=score_lead,
            winrate=winrate,
            visits=visits,
            engine="KataGo",
        )

    def _guard_rate_limit(self, requester_key: str) -> None:
        if self._rate_limiter.allow(requester_key):
            return
        raise ApiError(
            status_code=429,
            code="RATE_LIMITED",
            message="Too many analysis requests. Please try again later.",
        )
