# JazaMart

Kenya-first multi-vendor marketplace. Customers can register, browse/search products, add to cart, save delivery details, checkout and view orders. Sellers can register and add products. PostgreSQL stores marketplace data.

## Local

1. `npm run install:all`
2. Configure `backend/.env` from `backend/.env.example`.
3. `npm run db:init`
4. `npm start`

## Online

`render.yaml` provisions a Docker web service and PostgreSQL database. The Docker image builds the React frontend and serves it from the Express API.

Never commit real `.env` files, JWT secrets, database passwords, or payment credentials.
