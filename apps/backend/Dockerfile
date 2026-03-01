FROM node:20-bookworm-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/database/package.json ./packages/database/
COPY apps/backend/package.json ./apps/backend/
RUN pnpm install --frozen-lockfile --shamefully-hoist
COPY apps/backend ./apps/backend
COPY packages/database ./packages/database
EXPOSE 8101
CMD ["sh", "-c", "/app/node_modules/.bin/prisma generate --schema=/app/packages/database/prisma/schema.prisma && /app/node_modules/.bin/prisma migrate deploy --schema=/app/packages/database/prisma/schema.prisma && cd /app/apps/backend && /app/node_modules/.bin/nest start --watch"]
