import asyncio

import httpx

from app.main import app


def test_health_returns_ok() -> None:
    response = asyncio.run(_get_health())

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def _get_health() -> httpx.Response:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        return await client.get("/health")
