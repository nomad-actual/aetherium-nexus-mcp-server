# Stage 1: Build stage
FROM node:22-alpine3.22 as builder

WORKDIR /app
COPY package*.json ./
COPY ./src .

RUN npm install --production=false


# Build the TypeScript project
RUN npm run build

# Stage 2: Production stage
FROM node:22-alpine3.22

WORKDIR /app

# Copy only the necessary files from the builder stage
COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN npm install --only=production

EXPOSE 3000

# Start the application
CMD ["npm", "start"]
