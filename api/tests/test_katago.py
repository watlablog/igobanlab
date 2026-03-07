from app.katago import build_analysis_query, gtp_to_vertex, vertex_to_gtp
from app.models import AnalysisRequest


def test_gtp_coordinate_conversion_roundtrip() -> None:
    token = vertex_to_gtp(15, 3, 19)
    assert token == "Q16"
    assert gtp_to_vertex(token, 19) == (15, 3)
    assert gtp_to_vertex("pass", 19) is None


def test_build_analysis_query_includes_handicap_sequence() -> None:
    request = AnalysisRequest.model_validate(
        {
            "boardSize": 19,
            "komi": 6.5,
            "handicap": 2,
            "rules": "japanese",
            "moves": [{"x": 3, "y": 3}],
            "maxVisits": 120,
            "includeOwnership": True,
        }
    )

    query = build_analysis_query(request, request_id="req-1")
    assert query["id"] == "req-1"
    assert query["boardXSize"] == 19
    assert query["rules"] == "japanese"
    assert query["maxVisits"] == 120

    moves = query["moves"]
    assert moves == [
        ["B", "Q16"],  # handicap 1
        ["W", "pass"],  # free-placement adjustment
        ["B", "D4"],  # handicap 2
        ["W", "D16"],  # first user move (toPlay=W after handicap)
    ]
