FROM node:22-alpine3.22
ENV NODE_ENV=production

WORKDIR /app

COPY package*.json ./
COPY . .

RUN npm ci --omit=dev  \
    && npm prune --production \
    # Clean the apk cache to shave ~1 MiB
    && rm -rf /var/cache/apk/*

EXPOSE 3000

CMD ["npm", "start"]
