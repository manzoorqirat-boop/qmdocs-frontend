# QMDocs Frontend

React 19.2 + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query/Router.
See `MIGRATION_STATUS.md` for the full rebuild history, architecture
decisions, and every backend bug found and fixed along the way.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

Set `VITE_API_URL` in a `.env.local` file if the backend isn't at the same
origin during local dev, e.g.:

```
VITE_API_URL=http://localhost:5000
```

## Production build

```bash
npm run build         # tsc -b && vite build -> dist/
npm start              # node server.js — serves dist/ with SPA fallback
```

`npm start` runs a small dependency-free Node server (`server.js`), not
`vite preview` — Vite's own docs say `preview` isn't meant for production
traffic. The server adds baseline security headers
(`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), sets
long-lived immutable caching on hashed assets vs. `no-cache` on
`index.html`, and falls back to `index.html` for any path that isn't a
real built file — required for a client-side router (both the
`/app/*` routes and the standalone `/external/sign/:token` page).

## Deploying to Railway via GitHub

1. **Push this repo to GitHub**, then in Railway: *New Project → Deploy
   from GitHub repo*, select it.
2. Railway's Nixpacks builder auto-detects Node from `package.json` and
   runs `npm install`, `npm run build`, then `npm start` — no Dockerfile
   or `railway.json` needed for this service.
3. **Set `VITE_API_URL` as a Railway environment variable pointing at the
   backend service's public URL**, e.g. `https://eres-backend-production.up.railway.app`.
   This is the one easy-to-miss gotcha: Vite bakes `import.meta.env.*`
   variables into the JS bundle **at build time**, not read at runtime — if
   this isn't set before the build runs (or is changed later without a
   rebuild), the deployed app will silently call the wrong API origin.
   Railway exposes service variables to the build step by default, so
   setting it as a normal variable on this service is sufficient — just
   make sure it's set *before* the first deploy, and redeploy after
   changing it.
4. Railway assigns `PORT` automatically; `server.js` reads it — nothing to
   configure there.
5. **On the backend service**, `Cors__AllowedOrigins` must include this
   frontend's Railway domain (or custom domain), or the browser will block
   every API call with a CORS error. Same double-underscore convention
   Railway uses for nested config: `Cors__AllowedOrigins`.

### Backend service checklist (separate Railway service, separate repo)

Set as environment variables on the backend service before first deploy:

- `Jwt__Secret` — 32+ characters, never committed to the repo
- `ConnectionStrings__Postgres` — from Railway's attached Postgres plugin
- `Cors__AllowedOrigins` — this frontend's Railway URL
- `DocumentStorage__LocalRoot` — point at a mounted Railway volume path;
  the container filesystem is ephemeral otherwise and signed documents
  (the actual electronic records) would be lost on every redeploy

The backend deploys from its own `Dockerfile` (already in that repo) —
Railway detects it automatically and doesn't need Nixpacks.
