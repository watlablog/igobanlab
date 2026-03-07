FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY katago/katago ./katago/katago
COPY katago/analysis.cfg ./katago/analysis.cfg
COPY katago/model.bin.gz ./katago/model.bin.gz
RUN chmod +x /app/katago/katago

ENV KATAGO_ENABLED=false
ENV KATAGO_TIMEOUT_SEC=20
ENV KATAGO_MAX_REQUESTS_PER_MINUTE=30
ENV CORS_ALLOW_ORIGINS=*

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
