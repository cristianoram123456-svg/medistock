# Deployment

MediStock Pro has two deployable parts: the **React frontend** and the **FastAPI + MongoDB backend**.

## Option A — Emergent (one click)
Use the **Deploy** button in the Emergent UI. This provisions the frontend, backend and
managed MongoDB together. No env wiring required.

## Option B — Frontend on GitHub Pages + backend elsewhere
1. Deploy the backend (Option C) and note its public URL.
2. Follow `GITHUB_PAGES_SETUP.md`, setting `REACT_APP_BACKEND_URL` to that URL and
   `PUBLIC_URL` to `/REPOSITORY-NAME`.
3. Ensure backend CORS allows the Pages origin (currently `allow_origins=["*"]`).

## Option C — Backend (FastAPI + MongoDB)
Any container host (Render, Railway, Fly.io, a VPS, etc.):

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8001
```

Required env (`backend/.env`):
```
MONGO_URL=<your mongodb connection string>
DB_NAME=<database name>
JWT_SECRET=<random 64-char hex>
ADMIN_EMAIL=<owner email>
ADMIN_PASSWORD=<owner password>
```

Use **MongoDB Atlas** for a managed cloud database. All routes are under `/api`.

## Build output
`yarn build` (in `frontend/`) produces `frontend/build/` with `index.html` as the entry point.
The GitHub Action publishes that folder and adds `404.html` + `.nojekyll`.

## Production checklist
- [ ] Strong `JWT_SECRET`, changed `ADMIN_PASSWORD`
- [ ] MongoDB reachable + backups enabled (Atlas automated backups)
- [ ] `REACT_APP_BACKEND_URL` points at the live API (no localhost/preview URLs)
- [ ] No secrets in the frontend bundle
- [ ] HTTPS on both frontend and backend
