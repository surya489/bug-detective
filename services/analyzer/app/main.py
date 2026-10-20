from fastapi import FastAPI

app = FastAPI(title="Bug Detective Analyzer")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
