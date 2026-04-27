FROM node:24-alpine3.23
ENV NODE_ENV=production

WORKDIR /app

COPY . .

RUN npm ci --omit=dev  \
    && npm prune --production \
    # Clean the apk cache to shave ~1 MiB
    && rm -rf /var/cache/apk/*

EXPOSE 3000

CMD ["npm", "start"]
