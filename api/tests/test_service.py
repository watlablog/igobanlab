import pytest

from app.models import AnalysisRequest, MoveAnalysisRequest
from app.service import AnalysisService, SlidingWindowRateLimiter


class DummyEngine:
    def __init__(self, payload: dict[str, object]) -> None:
        self._payload = payload

    async def analyze(self, _request: AnalysisRequest) -> dict[str, object]:
        return self._payload


@pytest.mark.asyncio
async def test_analyze_score_maps_ownership() -> None:
    ownership = [
        0.9,
        -0.8,
        0.1,
        0.8,
        -0.9,
        -0.1,
        0.0,
        0.3,
        -0.3,
    ]
    raw = {
        "rootInfo": {"scoreLead": 2.5, "winrate": 0.61, "visits": 240},
        "ownership": ownership,
    }
    service = AnalysisService(
        engine=DummyEngine(raw), rate_limiter=SlidingWindowRateLimiter(10, 60)
    )

    request = AnalysisRequest.model_validate(
        {
            "boardSize": 3,
            "komi": 6.5,
            "handicap": 0,
            "rules": "japanese",
            "moves": [],
            "maxVisits": 240,
            "includeOwnership": True,
        }
    )
    result = await service.analyze_score(request, requester_key="uid:test")

    assert result.scoreLead == 2.5
    assert result.winrate == 0.61
    assert result.visits == 240
    assert result.ownership == [
        [1, -1, 0],
        [1, -1, 0],
        [0, 1, -1],
    ]


@pytest.mark.asyncio
async def test_analyze_move_maps_candidates() -> None:
    raw = {
        "rootInfo": {"scoreLead": -1.5, "winrate": 0.44, "visits": 150},
        "moveInfos": [
            {"move": "D4", "winrate": 0.52, "scoreLead": 1.2, "visits": 70},
            {"move": "pass", "winrate": 0.4, "scoreLead": -2.0, "visits": 30},
        ],
    }
    service = AnalysisService(
        engine=DummyEngine(raw), rate_limiter=SlidingWindowRateLimiter(10, 60)
    )

    request = MoveAnalysisRequest.model_validate(
        {
            "boardSize": 19,
            "komi": 6.5,
            "handicap": 0,
            "rules": "japanese",
            "moves": [],
            "maxVisits": 150,
            "topN": 2,
        }
    )
    result = await service.analyze_move(request, requester_key="uid:test")

    assert result.bestMove is not None
    assert result.bestMove.x == 3
    assert result.bestMove.y == 15
    assert len(result.candidates) == 2
    assert result.candidates[1].move.is_pass is True
