# --- base ---
FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- build ---
FROM deps AS build
COPY tsconfig.json ./
COPY src/ src/
RUN pnpm build

# --- runtime ---
FROM node:22-slim AS runtime
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=build /app/dist dist/

USER app
CMD ["node", "dist/index.js"]
