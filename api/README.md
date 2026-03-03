# iGobanLab API (Skeleton)

This directory contains a minimal FastAPI service for future AI analysis features.

## Local run

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Health check

```bash
curl -i http://localhost:8080/healthz
```

Expected response: `200 {"ok": true}`

## Deploy to Cloud Run

```bash
gcloud run deploy igobanlab-api \
  --source api \
  --region asia-northeast1 \
  --allow-unauthenticated
```
