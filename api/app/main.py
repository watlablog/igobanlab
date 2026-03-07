from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import os
import re

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from .errors import ApiError
from .katago import KataGoEngine, KataGoSettings
from .models import (
    AnalysisRequest,
    ErrorResponse,
    MoveAnalysisRequest,
    MoveAnalysisResponse,
    ScoreAnalysisResponse,
    SelfPlayJobRequest,
)
from .service import AnalysisService, SlidingWindowRateLimiter

settings = KataGoSettings.from_env()
engine = KataGoEngine(settings)
rate_limiter = SlidingWindowRateLimiter(
    max_requests=settings.max_requests_per_minute,
    window_seconds=60.0,
)
analysis_service = AnalysisService(engine=engine, rate_limiter=rate_limiter)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.close()


app = FastAPI(title="iGobanLab API", version="0.2.0", lifespan=lifespan)

cors_raw = os.getenv("CORS_ALLOW_ORIGINS", "*").strip()
cors_origins = [origin.strip() for origin in re.split(r"[;,]", cors_raw) if origin.strip()]
if not cors_origins:
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers_for(origin: str | None) -> dict[str, str]:
    allow_origin = "*"
    if origin:
        if "*" in cors_origins:
            allow_origin = "*"
        elif origin in cors_origins:
            allow_origin = origin
        else:
            allow_origin = cors_origins[0]

    return {
        "Access-Control-Allow-Origin": allow_origin,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-User-Id",
        "Access-Control-Max-Age": "3600",
    }


def get_analysis_service() -> AnalysisService:
    return analysis_service


@app.exception_handler(ApiError)
async def api_error_handler(_request: Request, exc: ApiError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(code=exc.code, message=exc.message).model_dump(),
    )


@app.exception_handler(RequestValidationError)
async def request_validation_error_handler(
    _request: Request, exc: RequestValidationError
) -> JSONResponse:
    first_error = exc.errors()[0] if exc.errors() else None
    message = "Invalid request payload."
    if first_error and "msg" in first_error:
        message = str(first_error["msg"])
    return JSONResponse(
        status_code=400,
        content=ErrorResponse(code="INVALID_REQUEST", message=message).model_dump(),
    )


def get_requester_key(request: Request) -> str:
    uid = request.headers.get("x-user-id")
    if uid and uid.strip():
        return f"uid:{uid.strip()}"

    host = request.client.host if request.client else ""
    if host:
        return f"ip:{host}"
    return "anonymous"


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/analyze/score", response_model=ScoreAnalysisResponse)
async def analyze_score(
    payload: AnalysisRequest,
    request: Request,
    service: AnalysisService = Depends(get_analysis_service),
) -> ScoreAnalysisResponse:
    requester_key = get_requester_key(request)
    return await service.analyze_score(payload, requester_key=requester_key)


@app.options("/v1/analyze/score")
async def analyze_score_preflight(request: Request) -> Response:
    return Response(status_code=204, headers=_cors_headers_for(request.headers.get("origin")))


@app.post("/v1/analyze/move", response_model=MoveAnalysisResponse)
async def analyze_move(
    payload: MoveAnalysisRequest,
    request: Request,
    service: AnalysisService = Depends(get_analysis_service),
) -> MoveAnalysisResponse:
    requester_key = get_requester_key(request)
    return await service.analyze_move(payload, requester_key=requester_key)


@app.options("/v1/analyze/move")
async def analyze_move_preflight(request: Request) -> Response:
    return Response(status_code=204, headers=_cors_headers_for(request.headers.get("origin")))


@app.post(
    "/v1/selfplay/jobs",
    response_model=ErrorResponse,
    status_code=501,
)
async def create_selfplay_job(_payload: SelfPlayJobRequest) -> ErrorResponse:
    raise ApiError(
        status_code=501,
        code="NOT_IMPLEMENTED",
        message="Self-play jobs are planned for Phase 2.",
    )
