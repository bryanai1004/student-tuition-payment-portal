# myAMU

Monorepo for a student-facing tuition and payments web app: **React (Vite)** frontend and **Express (TypeScript)** API, backed by **MySQL**. Optional integrations include **Supabase Storage** (profile photos), **Authorize.net** (Accept.js), **Socket.io**, and **OpenAI** for knowledge-base tooling.

## Requirements

- **Node.js 20.x** (see `engines` in root `package.json`)
- **MySQL** reachable from the machine running the API (local or AWS RDS, etc.)

## Repository layout

| Path        | Role |
|------------|------|
| `frontend/` | Vite + React SPA (`myamu-frontend`) |
| `backend/`  | Express API (`myamu-api`) |

npm **workspaces** are configured at the repo root.

## Quick start

1. **Install dependencies** (from the repository root):

   ```bash
   npm install
   ```

2. **Environment files**

   - Backend: copy `backend/.env.example` to `backend/.env` and set at least the MySQL variables (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`). The API loads `backend/.env` automatically.
   - Frontend: copy `frontend/.env.example` to `frontend/.env.development` (or `.env`) and set `VITE_API_BASE_URL` to your API base URL with **no** trailing slash and **no** `/api` suffix (for example `http://127.0.0.1:3001`).

3. **Database**

   After MySQL is available and credentials in `backend/.env` are correct, create portal billing tables and dev seed data (see comment in `backend/.env.example`):

   ```bash
   npm run db:bootstrap-portal -w backend
   ```

4. **Run app in development** (frontend + API together):

   ```bash
   npm run dev
   ```

   - API: `http://127.0.0.1:3001` by default (`PORT` in `backend/.env`)
   - Frontend: Vite default (typically `http://127.0.0.1:5173`)

   Health check: `GET http://127.0.0.1:3001/api/health`

## Root scripts

| Command        | Description |
|----------------|-------------|
| `npm run dev`  | Runs `frontend` and `backend` dev servers concurrently |
| `npm run build`| Builds backend (`tsc`) then frontend (`vite build`) |
| `npm run seed` | Legacy Mongo seed (`backend/legacy`) — requires `MONGODB_URI` if used |

## Backend scripts (run with `-w backend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | `tsx watch src/server.ts` |
| `npm run build` | TypeScript compile to `dist/` |
| `npm run start` | `node dist/server.js` (after build) |
| `npm run db:bootstrap-portal` | Portal billing tables + seed |
| `npm run admin:create` | Create admin user (interactive script) |
| `npm run seed` | Legacy MongoDB seed only |

Other scripts (`test:openai`, `build:knowledge`, password migration jobs, etc.) are documented inline in `backend/package.json`.

## Frontend scripts (run with `-w frontend`)

| Script | Description |
|--------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build locally |

## Environment variables (summary)

Full lists and comments live in:

- `backend/.env.example`
- `frontend/.env.example`

**Backend — commonly required**

- MySQL: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `PORT` — optional; defaults to `3001`

**Backend — features**

- Supabase (private photo bucket, server-side only): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`
- Authorize.net: `AUTHORIZE_API_LOGIN_ID`, `AUTHORIZE_TRANSACTION_KEY`, `AUTHORIZE_ENV`
- Student AI tokens (production): `STUDENT_AUTH_SECRET`; optional `STUDENT_AUTH_TOKEN_TTL_SECONDS`
- Extra CORS origins: `CORS_ORIGINS` or `CORS_ORIGIN` (comma-separated)
- OpenAI (optional tooling): `OPENAI_API_KEY`, models as in example file

**Frontend**

- `VITE_API_BASE_URL` — API origin only (no `/api` path)
- `VITE_AUTHORIZE_API_LOGIN_ID`, `VITE_AUTHORIZE_CLIENT_KEY` — for Accept.js in the browser

Do not commit real `.env` files; they are listed in `.gitignore`.

## Production build

```bash
npm run build
```

Start the API from `backend/` after build:

```bash
npm run start -w backend
```

Serve the contents of `frontend/dist/` with your static host or reverse proxy, and point the SPA’s `VITE_API_BASE_URL` at the deployed API during the build step.

## License / support

Internal project configuration; add your organization’s license or support contacts here if needed.
