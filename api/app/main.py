from fastapi import FastAPI

app = FastAPI(title="iGobanLab API", version="0.1.0")


@app.get("/healthz")
def healthz() -> dict[str, bool]:
    return {"ok": True}
