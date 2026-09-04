# JazaMart v5.9 — Crawlable Product URLs & Dynamic Sitemap

- Added `GET /product/:id` server-rendered SEO HTML shell for active products.
- Product shells include unique title, meta description, canonical URL, Open Graph/Twitter metadata, and Product JSON-LD.
- Added `GET /api/products/:id` for product detail data.
- Added dynamic `GET /sitemap.xml` generated from active products in PostgreSQL.
- Added dedicated product detail view in the React app.
- Product cards now link to `/product/<product-id>`.
- Kept the existing marketplace, authentication, seller, customer, cart and review functionality.

## Deployment

Deploy this version after the existing database is available. The sitemap and product SEO shells query PostgreSQL at request time.

Optional environment variable:
`PUBLIC_SITE_URL=https://jazamart.onrender.com`
