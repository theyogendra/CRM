# One image build, two runtime targets:
#   server -> API replicas and the worker (same code, different command)
#   web    -> Nginx: load balancer for the API + static file server for the React app

FROM node:22-bookworm-slim AS deps
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build -w server && npm run build -w client

FROM node:22-bookworm-slim AS server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/server/package.json server/
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/server/dist server/dist
WORKDIR /app/server
USER node
EXPOSE 4000
CMD ["node", "dist/index.js"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
