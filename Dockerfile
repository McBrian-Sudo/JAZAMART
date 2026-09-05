# JazaMart production image. The v6.0 GitHub-ready archive is the canonical
# deployable source for this commit, so Render builds the tested v6.0 backend
# and frontend even though the archive is also kept in the repository.
FROM node:20-bookworm-slim AS source
WORKDIR /src
COPY JazaMart-v6.0-github-ready.zip /tmp/jazamart.zip
COPY deploy-hardening.js /tmp/deploy-hardening.js
RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip \
  && unzip -q /tmp/jazamart.zip -d /src \
  && node /tmp/deploy-hardening.js /src/backend/server.js \
  && rm -rf /var/lib/apt/lists/* /tmp/jazamart.zip /tmp/deploy-hardening.js

FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY --from=source /src/frontend/package*.json ./
RUN npm install --no-audit --no-fund --prefer-online
COPY --from=source /src/frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=source /src/backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund --prefer-online
COPY --from=source /src/backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 5000
CMD ["node", "backend/server.js"]
