# JazaMart build notes

## v4.4 additions
- Admin dashboard with marketplace statistics, order controls, product moderation and review moderation.
- Delivery tracking timeline persisted in `order_status_history`.
- Customer reviews/ratings restricted to delivered order items, with one review per customer/product.
- Seller order statuses now include `out_for_delivery` and are written to the tracking history.

## Database
Run `backend/sql/schema.sql` against the PostgreSQL database before starting the API. The schema is written to be safe for an existing v4.x database (including the new tracking table, review moderation column, and expanded order-status constraint).

## Build
From `frontend/`:
```bash
npm install
npm run build
```

From `backend/`:
```bash
npm install
npm start
```

The build was not executed in the development environment because npm dependency installation previously could not reach the npm registry. Run it in an environment with normal registry/network access.


## v4.6 npm reliability
- Added npm configuration at the project root, backend, and frontend.
- Increased fetch retry/timeout limits and reduced concurrent registry connections.
- Backend `npm run install:deps` now uses the bundled installer and reports common DNS/network errors clearly.
- These settings cannot bypass a blocked DNS connection to the npm registry.
