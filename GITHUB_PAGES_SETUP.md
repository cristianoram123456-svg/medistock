# GitHub Pages Setup (Frontend)

This guide hosts the **React frontend** on GitHub Pages. GitHub Pages serves static files only, so the frontend talks to a separately deployed backend API (see `DEPLOYMENT.md`) via `REACT_APP_BACKEND_URL`.

> The React build output folder is `frontend/build/` (Create React App / CRACO convention). The included GitHub Action publishes that folder. `build/index.html` is the real app entry point — the README is never published as the site.

---

## 1. Push the code to GitHub

```bash
git init
git add .
git commit -m "MediStock Pro"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY-NAME.git
git push -u origin main
```

## 2. Enable Pages

Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 3. Configure variables

Repo → **Settings → Secrets and variables → Actions → Variables**:

| Variable | Value | Notes |
|----------|-------|-------|
| `PUBLIC_URL` | `/REPOSITORY-NAME` | Sub-path. Use `/` only for `USERNAME.github.io` root sites. |
| `REACT_APP_BACKEND_URL` | `https://your-api.example.com` | Your deployed FastAPI backend. No trailing slash. |

## 4. Deploy

Push to `main` (or run the **Deploy Frontend to GitHub Pages** workflow manually).
The workflow (`.github/workflows/deploy-pages.yml`):

1. `yarn install --frozen-lockfile`
2. `yarn build` with `PUBLIC_URL` + `REACT_APP_BACKEND_URL`
3. Copies `index.html → 404.html` (SPA deep-link fallback) and adds `.nojekyll`
4. Publishes `frontend/build/`

Your site: **https://USERNAME.github.io/REPOSITORY-NAME/**

---

## Sub-path routing

- `PUBLIC_URL` is consumed by the router `basename` (`App.js`) and by CRA to prefix all JS/CSS/font/image asset URLs — so everything resolves from the repository subdirectory.
- `.nojekyll` (in `frontend/public/`) stops GitHub from hiding underscore-prefixed asset folders.
- `404.html` = copy of `index.html` so client-side routes (e.g. `/pos`) load on refresh.

## Checklist

- [ ] `PUBLIC_URL` matches the repo name exactly (leading slash, no trailing slash)
- [ ] `REACT_APP_BACKEND_URL` points to a reachable API and backend CORS allows the Pages origin
- [ ] No `localhost` / preview URLs hard-coded (all API calls use `REACT_APP_BACKEND_URL`)
- [ ] No secrets in the frontend bundle (only the public backend URL is exposed)
