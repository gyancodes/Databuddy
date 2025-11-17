FROM oven/bun:1.3.2-slim AS builder

WORKDIR /app

COPY package.json bun.lock turbo.json ./

COPY apps/ ./apps/
COPY packages/ ./packages/

RUN bun install

RUN bunx turbo build --filter=@databuddy/api...

FROM oven/bun:1.3.2-slim

WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/packages ./packages

EXPOSE 4000

WORKDIR /app/apps/api

CMD ["bun", "run", "src/index.ts"]