from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Ruleset = Literal["japanese", "chinese", "aga", "korean"]
OwnershipCell = Literal[-1, 0, 1]


class MovePayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    x: int | None = None
    y: int | None = None
    is_pass: bool = Field(default=False, alias="pass")

    @model_validator(mode="after")
    def validate_shape(self) -> "MovePayload":
        if self.is_pass:
            if self.x is not None or self.y is not None:
                raise ValueError("Pass move must not have x/y.")
            return self

        if self.x is None or self.y is None:
            raise ValueError("Move requires x and y when pass=false.")
        return self


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    boardSize: int = Field(ge=5, le=25)
    komi: float = Field(ge=-50, le=50)
    handicap: int = Field(default=0, ge=0, le=9)
    rules: Ruleset = "japanese"
    moves: list[MovePayload] = Field(default_factory=list, max_length=1000)
    maxVisits: int = Field(default=200, ge=1, le=1000)
    includeOwnership: bool = True

    @model_validator(mode="after")
    def validate_moves(self) -> "AnalysisRequest":
        for move in self.moves:
            if move.is_pass:
                continue
            assert move.x is not None
            assert move.y is not None
            if move.x < 0 or move.x >= self.boardSize or move.y < 0 or move.y >= self.boardSize:
                raise ValueError("Move coordinates are out of bounds for boardSize.")
        return self


class MoveAnalysisRequest(AnalysisRequest):
    topN: int = Field(default=5, ge=1, le=10)
    includeOwnership: bool = False


class MoveResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    x: int | None = None
    y: int | None = None
    is_pass: bool = Field(default=False, alias="pass")


class MoveCandidateResponse(BaseModel):
    move: MoveResponse
    winrate: float | None = None
    scoreLead: float | None = None
    visits: int | None = None


class ScoreAnalysisResponse(BaseModel):
    scoreLead: float
    winrate: float
    visits: int
    ownership: list[list[OwnershipCell]] | None = None
    engine: str


class MoveAnalysisResponse(BaseModel):
    bestMove: MoveResponse | None = None
    candidates: list[MoveCandidateResponse]
    scoreLead: float
    winrate: float
    visits: int
    engine: str


class SelfPlayJobRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    boardSize: int = Field(default=19, ge=5, le=25)
    rules: Ruleset = "japanese"
    games: int = Field(default=1, ge=1, le=1000)


class ErrorResponse(BaseModel):
    code: str
    message: str
