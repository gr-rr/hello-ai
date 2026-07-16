# Dev container for hello-ai (Next.js + React).
# Build stage installs deps; the container runs `npm run dev` with hot reload.
FROM node:20-alpine

# git is needed for in-container git operations (mounted ssh/gitconfig, see compose).
RUN apk add --no-cache git openssh-client

WORKDIR /app

# Install deps first (better layer caching).
COPY package*.json ./
RUN npm ci

# Copy source.
COPY . .

# Next.js dev server binds to 0.0.0.0 so the host can reach it.
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

CMD ["npm", "run", "dev"]
