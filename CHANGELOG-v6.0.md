# JazaMart v6.0 — Real M-Pesa Payments

- Added Safaricom Daraja OAuth + STK Push server integration.
- Added secure Render environment-variable configuration.
- Added public M-Pesa callback endpoint with idempotent payment updates.
- Added M-Pesa payment metadata, receipt and callback storage.
- Added customer payment-status endpoint and frontend polling.
- Added payment status/receipt visibility in My Orders.
- Failed M-Pesa requests/callbacks cancel pending orders and release reserved stock.
- Cash on Delivery remains available.


## v6.0.1 hardening
- Fixed Kenyan phone normalization regex.
- Require a Daraja CheckoutRequestID before treating STK initiation as successful.
- Made terminal M-Pesa callbacks idempotent for paid/failed/cancelled payments.
- Fixed amount-mismatch callback handling so the failure and stock release are committed instead of rolled back.
- Clarified checkout payment-method messaging.
