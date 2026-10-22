import asyncio
import hmac
import json
import logging
import os

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.schemas import (
    AnalysisResponse,
    AnalyzeRequest,
    AnalyzeSourcesRequest,
    FixtureDescriptor,
    FixtureListResponse,
)
from app.services.discovery import DiscoveryError
from app.services.scanner import (
    FIXTURE_IDS,
    analyze_fixture,
    analyze_sources,
    fixture_path,
)

app = FastAPI(title="Bug Detective Analyzer")
logger = logging.getLogger(__name__)
MAX_REQUEST_BYTES = 4 * 1024
MAX_SOURCE_REQUEST_BYTES = 64 * 1024 * 1024


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


@app.post("/analyze/sources", response_model=AnalysisResponse)
async def analyze_sources_endpoint(
    request: Request,
) -> AnalysisResponse | JSONResponse:
    configured_key = os.getenv("ANALYZER_API_KEY")
    supplied_key = request.headers.get("x-analyzer-api-key", "")
    if not configured_key:
        return JSONResponse(
            status_code=503,
            content={"detail": "Repository analysis is not configured."},
        )
    if not hmac.compare_digest(
        configured_key.encode("utf-8"),
        supplied_key.encode("utf-8"),
    ):
        return JSONResponse(
            status_code=401,
            content={"detail": "Repository analysis authorization failed."},
        )

    content_length = request.headers.get("content-length")
    if content_length is not None:
        try:
            if int(content_length) > MAX_SOURCE_REQUEST_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "Source request exceeds the configured request limit."},
                )
        except ValueError:
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid Content-Length header."},
            )

    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > MAX_SOURCE_REQUEST_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Source request exceeds the configured request limit."},
            )
        body.extend(chunk)

    try:
        payload = AnalyzeSourcesRequest.model_validate_json(bytes(body))
    except (ValidationError, ValueError, json.JSONDecodeError):
        return JSONResponse(
            status_code=422,
            content={"detail": "Provide a valid repository, full commit SHA, and source files."},
        )

    try:
        result = await asyncio.to_thread(
            analyze_sources,
            payload.repository_full_name,
            payload.commit_sha.lower(),
            [(item.path, item.content) for item in payload.files],
        )
    except Exception as exc:
        logger.error("Repository analysis failed (%s).", type(exc).__name__)
        return JSONResponse(
            status_code=500,
            content={"detail": "Repository analysis could not be completed safely."},
        )
    return result
