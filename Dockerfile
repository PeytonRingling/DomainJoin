FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

# Vite bakes these into the JS bundle at build time.
# Pass via: docker build --build-arg VITE_DEFAULT_DC=10.0.0.10 ...
# Or set them in docker-compose.yml build.args (reads from your shell/.env).
ARG VITE_DEFAULT_DC
ARG VITE_DEFAULT_OU
ENV VITE_DEFAULT_DC=${VITE_DEFAULT_DC}
ENV VITE_DEFAULT_OU=${VITE_DEFAULT_OU}

COPY . .

# Build the React frontend, then strip devDependencies
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

CMD ["node", "server/index.js"]
