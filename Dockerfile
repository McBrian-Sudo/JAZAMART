FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install --no-audit --no-fund --prefer-online
COPY frontend/ ./
RUN npm run build

FROM node:20-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev --no-audit --no-fund --prefer-online
COPY backend/ ./backend/
COPY --from=frontend-build /app/frontend/dist ./frontend/dist
EXPOSE 5000
CMD ["node", "backend/server.js"]
