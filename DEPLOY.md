# Deploy JazaMart online

## Recommended: Render

This repository includes `render.yaml` and a production `Dockerfile`.

1. Push this project to a GitHub repository.
2. In Render, create a Blueprint and select that repository.
3. Render will create the JazaMart web service and PostgreSQL database from `render.yaml`.
4. Set `FRONTEND_URL` to the public JazaMart URL if you want to restrict CORS; otherwise it can be left blank for this single-service deployment.
5. Deploy and open the generated `onrender.com` URL.

The web service automatically builds the React frontend and serves it from Express. `AUTO_INIT_DB=true` applies the schema on startup, and `/api/health` is the health check.

## M-Pesa

The current checkout supports the M-Pesa payment method at the application level, but a real M-Pesa transaction still requires your Safaricom Daraja credentials and a public HTTPS callback. Do not commit those secrets to GitHub.


## Production notes

- The Docker build uses `npm install` rather than `npm ci` because this release intentionally ships without lockfiles; Render can install directly from the package manifests.
- The Blueprint provisions a Free Render Postgres database in Singapore for a Kenya-first deployment. Render currently documents Free Postgres as 1 GB and 30-day lifetime; it is suitable for testing, not long-term production.
- For real production use, upgrade the Postgres instance before launch and configure real payment credentials separately.

## Search and app installation (v5.8)

The frontend now includes SEO metadata, `robots.txt`, `sitemap.xml`, a web app manifest and a service worker. This allows search engines to crawl the public storefront and supported browsers to offer **Install JazaMart**.

After deployment:
1. Open the public JazaMart URL and confirm `/robots.txt`, `/sitemap.xml`, and `/manifest.webmanifest` load.
2. In Google Search Console, add the verified site and submit `/sitemap.xml`.
3. In Bing Webmaster Tools, add the site and submit `/sitemap.xml`.
4. If you later attach a custom domain, update the canonical URL, sitemap URL and robots sitemap URL to that domain.
5. For a Play Store Android app, package this PWA with a trusted Android wrapper (for example a Trusted Web Activity) and publish the resulting Android App Bundle through Google Play Console. The ZIP does not contain a signed Android APK/AAB because those require the app's Android signing credentials and final public domain.
