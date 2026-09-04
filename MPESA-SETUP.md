# JazaMart M-Pesa (Daraja STK Push) setup

JazaMart v6.0 uses Safaricom Daraja for server-side M-Pesa STK Push. Daraja credentials are never placed in the frontend.

## Render environment variables

Set these in the JazaMart Render Web Service:

- `MPESA_ENV=sandbox` while testing; change to `production` only after Safaricom production onboarding.
- `MPESA_CONSUMER_KEY` = your Daraja consumer key
- `MPESA_CONSUMER_SECRET` = your Daraja consumer secret
- `MPESA_SHORTCODE` = your M-Pesa PayBill/Till business shortcode as required by your Daraja product
- `MPESA_PASSKEY` = the passkey issued for STK Push
- `MPESA_CALLBACK_URL=https://jazamart.onrender.com/api/mpesa/callback`
- `MPESA_ACCOUNT_REFERENCE=JazaMart`
- `MPESA_TRANSACTION_DESC=JazaMart order payment`
- `MPESA_TRANSACTION_TYPE=CustomerPayBillOnline` (use the transaction type required by your Daraja product)

Never commit these secret values to Git or the ZIP.

## Payment flow

1. Customer selects M-Pesa at checkout.
2. Backend calculates the amount from PostgreSQL and creates a pending order/payment.
3. Backend requests an STK Push from Daraja.
4. Customer receives the M-Pesa prompt and enters their PIN.
5. Safaricom calls `/api/mpesa/callback`.
6. JazaMart records the receipt/result and marks the payment `paid` only after a successful callback.
7. Failed payments cancel the pending order and release the reserved stock.
8. The customer dashboard polls payment status for confirmation.

## Important

The callback URL must be publicly reachable over HTTPS. Sandbox credentials should be tested first. Production payments require the appropriate Safaricom/Daraja production onboarding and credentials.
