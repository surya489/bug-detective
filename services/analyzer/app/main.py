import asyncio
import json
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.schemas import (
    AnalysisResponse,
    AnalyzeRequest,
    FixtureDescriptor,
    FixtureListResponse,
)
from app.services.discovery import DiscoveryError
from app.services.scanner import FIXTURE_IDS, analyze_fixture, fixture_path

app = FastAPI(title="Bug Detective Analyzer")
logger = logging.getLogger(__name__)
MAX_REQUEST_BYTES = 4 * 1024


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/fixtures", response_model=FixtureListResponse)
async def list_fixtures() -> FixtureListResponse:
    available: list[FixtureDescriptor] = []
    for fixture_id in FIXTURE_IDS:
        try:
            fixture_path(fixture_id)
        except (DiscoveryError, OSError, ValueError):
            continue
        available.append(
            FixtureDescriptor(
                id=fixture_id,
                name=fixture_id.replace("-", " ").title(),
                description=(
                    "Intentionally includes deterministic TypeScript diagnostics."
                    if fixture_id == "buggy-react-app"
                    else "Minimal React and TypeScript source expected to pass checks."
                ),
            )
        )
    return FixtureListResponse(fixtures=available)


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze(request: Request) -> AnalysisResponse | JSONResponse:
    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_REQUEST_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Analysis request exceeds the 4 KiB limit."},
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid Content-Length header."},
            )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_REQUEST_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Analysis request exceeds the 4 KiB limit."},
            )
        body.extend(chunk)

    try:
        payload = AnalyzeRequest.model_validate_json(bytes(body))
    except (ValidationError, ValueError, json.JSONDecodeError):
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Provide a valid fixtureId from the server's fixture registry."
            },
        )

    try:
        result = await asyncio.to_thread(analyze_fixture, payload.fixture_id)
    except Exception as exc:
        logger.error("Analysis failed (%s).", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"detail": "Analysis could not be completed safely."},
        )
    return result
