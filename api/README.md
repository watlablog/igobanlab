# iGobanLab API (KataGo-ready)

This service provides:

- `GET /healthz`
- `POST /v1/analyze/score`
- `POST /v1/analyze/move`
- `POST /v1/selfplay/jobs` (`501 Not Implemented` placeholder)

## Local run

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

## Environment variables

KataGo integration is disabled by default.

```bash
KATAGO_ENABLED=true
KATAGO_BINARY=/path/to/katago
KATAGO_CONFIG=/path/to/analysis_example.cfg
KATAGO_MODEL=/path/to/model.bin.gz
KATAGO_OVERRIDE_CONFIG=logToStderr=true,logFile=/tmp/katago.log
KATAGO_TIMEOUT_SEC=20
KATAGO_MAX_REQUESTS_PER_MINUTE=30
KATAGO_APPIMAGE_EXTRACT_AND_RUN=true
CORS_ALLOW_ORIGINS=http://localhost:5173,https://igobanlab.web.app,https://igobanlab.firebaseapp.com
```

If `KATAGO_ENABLED=false`, analysis endpoints return `503 ENGINE_DISABLED`.

## API quick checks

```bash
curl -i http://localhost:8080/healthz
```

```bash
curl -i http://localhost:8080/v1/analyze/score \
  -H "Content-Type: application/json" \
  -d '{
    "boardSize": 19,
    "komi": 6.5,
    "handicap": 0,
    "rules": "japanese",
    "moves": [],
    "maxVisits": 200,
    "includeOwnership": true
  }'
```

## Tests

```bash
cd api
pytest
```

## KataGo runtime files

Put runtime files under `api/katago/`:

- `api/katago/katago` (Linux binary)
- `api/katago/analysis.cfg`
- `api/katago/model.bin.gz`

`Dockerfile` copies this directory into the image as `/app/katago`.
This repo's `analysis.cfg` is tuned for low-latency interactive calls (reduced threads and visits).

## Deploy to Cloud Run (CPU baseline)

```bash
cp api/cloudrun.env.example api/cloudrun.env
# Edit api/cloudrun.env if needed.

gcloud run deploy igobanlab-api \
  --source api \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --cpu 2 \
  --memory 2Gi \
  --timeout 20 \
  --min-instances 0 \
  --max-instances 1 \
  --env-vars-file api/cloudrun.env
```
