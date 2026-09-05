# JazaMart Production Readiness

## Completed in repository

- PostgreSQL-backed users, products, addresses, orders, payments and order history.
- Customer/seller authentication with JWT and bcrypt password hashing.
- Product SEO pages, robots.txt and dynamic sitemap in the v6 deployment source.
- M-Pesa Daraja sandbox integration in v6 deployment source.
- HTTPS deployment target on Render.
- Security response headers and reduced Express fingerprinting.
- Authentication rate limiting (10 attempts per IP per 15 minutes).
- Production startup protection against the default JWT secret.
- M-Pesa logs redacted so credentials, access tokens, phone numbers and full request payloads are not written to logs.
- CORS restricted to `FRONTEND_URL` or `PUBLIC_SITE_URL` instead of allowing every origin.
- Public test-product seed endpoint removed from the production deployment build.

## Still requires external account/configuration

### 1. M-Pesa sandbox
Render must contain valid Daraja sandbox Consumer Key, Consumer Secret and Passkey. Keep all three private. The shortcode for the JazaMart sandbox setup is `174379` and the transaction type is `CustomerPayBillOnline`.

### 2. Persistent product images
The current Render service is on the free plan. Do not rely on the container filesystem for permanent uploads. Configure an object/image storage provider (Cloudinary, S3-compatible storage, Supabase Storage, or an equivalent) before allowing sellers to upload permanent product files.

### 3. Email/SMS
Production notifications require credentials for a mail/SMS provider. Recommended Kenya-friendly SMS option: Africa's Talking. Email can use a transactional provider such as Resend or SendGrid. Credentials must be stored as Render environment variables, never in Git.

### 4. Credential rotation
Any database password, JWT secret, M-Pesa secret/passkey or other credential exposed in a screenshot or chat should be rotated before production use.

## Deployment verification

After each Render deployment, verify:

1. `/api/health` reports the database as connected.
2. The homepage loads over HTTPS.
3. Customer registration and login work.
4. Seller registration/login works and seller-only endpoints reject customers.
5. Product creation/listing and stock changes persist after refresh.
6. Checkout creates an order and reserves stock correctly.
7. M-Pesa is tested only after valid sandbox credentials are configured.
8. Product image URLs remain valid after a redeploy.
9. The sitemap and robots endpoints return valid content.
10. Render reports the service as Live.
