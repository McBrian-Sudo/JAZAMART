# JazaMart

Kenya-first multi-vendor marketplace prototype with customer accounts, product browsing, cart/checkout, orders and tracking, seller tools, reviews, and admin moderation.

## Run locally

```bash
npm run install:all
npm run db:init
npm start
```

For frontend development with Vite:

```bash
npm run frontend
```

Set `DATABASE_URL` and `JWT_SECRET` in `backend/.env` first. See `backend/.env.example`.

## Deploy online

A production Dockerfile and Render Blueprint are included. See `DEPLOY.md`.

The production image builds the React frontend and serves the frontend plus Express API from one service. The database can be initialized automatically with `AUTO_INIT_DB=true`.

## Important

- npm itself is operational; local `EAI_AGAIN` / DNS errors are machine or network connectivity problems, not a JazaMart dependency-version error. npm's public registry is the default registry.
- Real M-Pesa payments require your own Daraja credentials and public HTTPS callback.
- Never commit `.env` files or production secrets.


## v5.1 deployment hardening

This release is configured for a single Render Docker Web Service plus PostgreSQL. It avoids `npm ci` because the repository intentionally does not include lockfiles, uses Singapore for the Kenya-first deployment, and keeps the API available even when the database is temporarily unavailable.
