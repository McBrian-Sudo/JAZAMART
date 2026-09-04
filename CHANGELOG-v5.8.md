# JazaMart v5.8 — Web Discovery & Installability

- Added SEO title, description, keywords and Open Graph metadata.
- Added canonical URL for the current Render service: `https://jazamart.onrender.com/`.
- Added `robots.txt` and XML sitemap for search-engine crawling.
- Added a web app manifest and installable PWA configuration.
- Added service-worker registration and basic offline shell caching.
- Added an **Install App** button when the browser exposes the install prompt.
- Added 192px and 512px app icons.

## Important
Search engines still decide when to crawl and index the site. After deployment, submit the sitemap in Google Search Console and Bing Webmaster Tools. If the Render service gets a different custom domain, replace `https://jazamart.onrender.com/` in `index.html`, `robots.txt`, and `sitemap.xml` with the final public domain.
