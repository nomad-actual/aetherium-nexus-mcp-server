# Stage 1: Build stage
FROM node:22-alpine3.22 AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install && npm cache clean --force

COPY . .
RUN npm run build

# Stage 2: Runner stage
FROM node:22-alpine3.22 AS runner
ENV NODE_ENV=production

WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force && npm prune --production

EXPOSE 3000

# Start the application
CMD ["npm", "start"]
