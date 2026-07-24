FROM node:24-alpine
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/database/package.json ./packages/database/
RUN pnpm install --frozen-lockfile --shamefully-hoist
COPY apps/frontend ./apps/frontend
EXPOSE 8100
CMD ["sh", "-c", "cd /app/apps/frontend && /app/node_modules/.bin/next dev --port 8100"]
