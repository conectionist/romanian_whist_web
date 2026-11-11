# syntax=docker/dockerfile:1

# Debian, not Alpine: TypeScript 7 ships a glibc binary only. npm 11 installs the lockfile; npm 10 cannot.
FROM node:26.13.0-trixie-slim AS build
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
WORKDIR /src
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN nice -n 19 npm run build

FROM caddy:2.11.9-alpine
LABEL org.opencontainers.image.title="Romanian Whist page" \
      org.opencontainers.image.source="https://github.com/conectionist/romanian_whist_web" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /src/dist /srv
COPY LICENSE /usr/share/licenses/romanian_whist_web/LICENSE
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
