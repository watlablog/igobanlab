from typing import Any

from fastapi.testclient import TestClient

from app.errors import ApiError
from app.main import app, get_analysis_service
from app.models import AnalysisRequest, MoveAnalysisRequest


class FakeService:
    def __init__(self, should_fail: ApiError | None = None) -> None:
        self._should_fail = should_fail

    async def analyze_score(
        self, _request: AnalysisRequest, requester_key: str
    ) -> dict[str, Any]:
        assert requester_key.startswith(("uid:", "ip:", "anonymous"))
        if self._should_fail:
            raise self._should_fail
        return {
            "scoreLead": 1.0,
            "winrate": 0.55,
            "visits": 100,
            "ownership": None,
            "engine": "KataGo",
        }

    async def analyze_move(
        self, _request: MoveAnalysisRequest, requester_key: str
    ) -> dict[str, Any]:
        assert requester_key.startswith(("uid:", "ip:", "anonymous"))
        if self._should_fail:
            raise self._should_fail
        return {
            "bestMove": {"x": 3, "y": 3, "pass": False},
            "candidates": [],
            "scoreLead": 1.0,
            "winrate": 0.55,
            "visits": 100,
            "engine": "KataGo",
        }


def test_score_endpoint_success() -> None:
    app.dependency_overrides[get_analysis_service] = lambda: FakeService()
    client = TestClient(app)

    response = client.post(
        "/v1/analyze/score",
        json={
            "boardSize": 19,
            "komi": 6.5,
            "handicap": 0,
            "rules": "japanese",
            "moves": [],
            "maxVisits": 200,
            "includeOwnership": True,
        },
        headers={"x-user-id": "abc"},
    )
    app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json()["engine"] == "KataGo"


def test_invalid_request_returns_400() -> None:
    app.dependency_overrides[get_analysis_service] = lambda: FakeService()
    client = TestClient(app)

    response = client.post(
        "/v1/analyze/score",
        json={
            "boardSize": 0,
            "komi": 6.5,
            "handicap": 0,
            "rules": "japanese",
            "moves": [],
            "maxVisits": 200,
            "includeOwnership": True,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 400
    assert response.json()["code"] == "INVALID_REQUEST"


def test_engine_timeout_returns_504() -> None:
    app.dependency_overrides[get_analysis_service] = lambda: FakeService(
        should_fail=ApiError(
            status_code=504,
            code="ENGINE_TIMEOUT",
            message="timed out",
        )
    )
    client = TestClient(app)

    response = client.post(
        "/v1/analyze/move",
        json={
            "boardSize": 19,
            "komi": 6.5,
            "handicap": 0,
            "rules": "japanese",
            "moves": [],
            "maxVisits": 200,
            "topN": 5,
        },
    )
    app.dependency_overrides.clear()

    assert response.status_code == 504
    assert response.json()["code"] == "ENGINE_TIMEOUT"


def test_selfplay_placeholder_returns_501() -> None:
    client = TestClient(app)
    response = client.post("/v1/selfplay/jobs", json={"boardSize": 19, "rules": "japanese"})
    assert response.status_code == 501
    assert response.json()["code"] == "NOT_IMPLEMENTED"
