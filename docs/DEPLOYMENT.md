# ASTRA — Deployment Guide

ASTRA is a two-part system: a **FastAPI backend** (Python) that holds all data,
the trained model, and the engines in memory, and a **React frontend** served as
static files that talks to the backend over `/api`.

---

## 1. Local development

Backend:

```bash
pip install -r requirements.txt
python scripts/build_all.py          # one-time: regenerates data/processed + artifacts
uvicorn astra.api.main:app --reload --port 8001   # dev port — matches the Vite proxy
```

Frontend (separate terminal):

```bash
cd frontend
npm install
npm run dev                          # http://localhost:5173, proxies /api -> :8001
```

> Local dev runs the backend on **:8001** (the Vite proxy target in `vite.config.ts`).
> The Docker image serves on **:8000** internally. The full cloud topology
> (S3/CloudFront + ECR/Fargate/ALB + SSM secrets + CI/CD) is in
> [`README.md` §14 — AWS Deployment Plan](../README.md#14-aws-deployment-plan).

`build_all.py` runs the five pipeline stages in order (preprocess → memory tables
→ ESI → duration model → spillover graph). It must run once before the API can
start, because the API loads the processed parquet files and the model artifact
at startup.

---

## 2. MapMyIndia (Mappls) credentials — optional

Everything runs without these; the frontend falls back to an SVG impact map and
the backend uses Haversine for all distances. To enable the live Mappls vector
map and real road-distance/diversion routing:

```bash
cp .env.example .env
# edit .env:
# MAPMYINDIA_CLIENT_ID=...
# MAPMYINDIA_CLIENT_SECRET=...
```

The backend reads these at startup and exposes `/api/mappls/token`,
`/api/mappls/directions`, and `/api/mappls/matrix`. The frontend calls
`/api/mappls/status` and only loads the Mappls SDK when credentials are present.

---

## 3. Docker (single host)

```bash
docker compose up --build
```

- backend → http://localhost:8000 (image runs `build_all.py` during build, so it
  ships self-contained with processed data + trained model)
- frontend → http://localhost:8080 (nginx serves the build and proxies `/api` to
  the backend container)

Put MapMyIndia credentials in `.env` before `up` to enable Mappls; it is optional.

---

## 4. AWS

### 4.1 Fast path — single EC2 instance

Best for a demo. One `t3.medium` (2 vCPU / 4 GB) runs both containers.

```bash
# on the instance (Amazon Linux 2023 / Ubuntu 22.04)
sudo yum install -y docker git    # or apt
sudo systemctl enable --now docker
sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
  -o /usr/local/bin/docker-compose && sudo chmod +x /usr/local/bin/docker-compose
git clone https://github.com/mpatra193/Flipkart_gridlock_2.0.git && cd Flipkart_gridlock_2.0
docker compose up --build -d
```

Open security-group ports 8080 (frontend) and 8000 (API, if testing directly).
Access the dashboard at `http://<ec2-public-ip>:8080`.

### 4.2 Production path — S3 + CloudFront + ALB + EC2

| Component | Role |
|---|---|
| **S3** | hosts the React production build (`npm run build` → `frontend/dist`) |
| **CloudFront** | CDN + HTTPS; default origin → S3, behaviour `/api/*` → ALB |
| **ALB** | routes `/api/*` to the EC2 backend on port 8000, health-checks `/api/health` |
| **EC2 (t3.medium)** | runs the backend container (model + graph + tables in memory, ~150 MB) |

Steps:

1. Build and upload the frontend:
   ```bash
   cd frontend && npm run build
   aws s3 sync dist/ s3://astra-frontend-bucket/
   ```
2. Run the backend container on EC2 (`docker run -p 8000:8000 astra-backend`),
   register it in an ALB target group with health check `/api/health`.
3. Create the CloudFront distribution: origin 1 = S3 bucket (default behaviour),
   origin 2 = ALB with path pattern `/api/*`.
4. Point the frontend at the same origin — it already calls relative `/api`, so
   CloudFront routing handles the split with no code change.

### 4.3 Why no database

The dataset is 8,173 rows (~5 MB). It loads once into pandas at startup and
stays in memory for the process lifetime. A database would add latency and infra
with no benefit at this scale. Horizontal scaling (multiple backend instances)
is the only reason to introduce a shared store (Postgres for the event log,
Redis for the risk tables) — not required for the competition.

### 4.4 Cost (1 week, demo)

| Service | Approx |
|---|---|
| EC2 t3.medium | ~$2.50 |
| S3 | ~$0.02 |
| CloudFront | ~$0.10 |
| ALB | ~$0.50 |
| **Total** | **~$3.12** |
