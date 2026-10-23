FROM node:26-alpine3
ENV NODE_ENV=production

ARG VERSION=dev
ENV MCP_SERVER_VERSION=${VERSION}

WORKDIR /app

COPY package*.json ./

RUN npm ci --omit=dev \
    # Clean the apk cache to shave ~1 MiB
    && rm -rf /var/cache/apk/* \
    # Run as non-root — the app fetches untrusted content and runs jsdom
    && addgroup -S appgroup && adduser -S appuser -G appgroup

COPY . .

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["npm", "start"]
