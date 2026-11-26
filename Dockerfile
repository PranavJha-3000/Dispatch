# One image: the API serves the built SPA same-origin (cookie auth, no CORS).
FROM node:24-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build -w web && cd server && npx prisma generate && npm run build
ENV NODE_ENV=production WEB_DIST=/app/web/dist PORT=3000
EXPOSE 3000
WORKDIR /app/server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
