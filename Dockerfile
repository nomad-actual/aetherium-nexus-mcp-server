FROM node:26-alpine3.23
ENV NODE_ENV=production

WORKDIR /app

COPY . .

RUN npm ci --omit=dev  \
    && npm prune --production \
    # Clean the apk cache to shave ~1 MiB
    && rm -rf /var/cache/apk/*

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["npm", "start"]
