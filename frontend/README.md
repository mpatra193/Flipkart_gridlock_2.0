# ASTRA Frontend

React + TypeScript + Vite + Tailwind command-centre dashboard for ASTRA.

```bash
npm install
npm run dev        # http://localhost:5173, proxies /api -> http://localhost:8000
npm run build      # production build into dist/
npm run typecheck  # tsc --noEmit
```

The backend must be running (`uvicorn astra.api.main:app --port 8000`) for the
dashboard to load data. The map uses the MapMyIndia vector SDK when the backend
reports credentials configured (`/api/mappls/status`), otherwise it renders an
SVG impact map. See [`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).
