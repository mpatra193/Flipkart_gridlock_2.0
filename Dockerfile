FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY astra ./astra
COPY scripts ./scripts
COPY data/raw ./data/raw

RUN python scripts/build_all.py

EXPOSE 8000
CMD ["uvicorn", "astra.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
