FROM crystallang/crystal:1.9 AS api-build
WORKDIR /app

# Project shared dependencies
RUN apt update && apt install libsqlite3-dev libevent-dev -y

# Project dependencies API
COPY API/shard.yml API/shard.lock ./
RUN shards install --production

# Copy source code and build
COPY API ./
RUN crystal build --static --release src/main.cr -o journalsApp


FROM node:18-slim as ui-build
WORKDIR /app

# Project dependencies Web-UI
COPY Web-UI/package.json Web-UI/package-lock.json Web-UI/rollup.config.js ./
RUN npm ci

# Copy source code and build
COPY Web-UI ./
RUN npm run build


FROM nginx:1.25.1-alpine3.17-slim AS runner

# Copy all the build files
COPY --from=api-build /app/journalsApp /app/api/journalsApp
COPY --from=ui-build /app/public /app/ui/public
COPY --from=ui-build /app/public2 /app/ui/public2

COPY nginx.conf /etc/nginx/nginx.conf

# Set PORT
EXPOSE 9900
EXPOSE 80

WORKDIR /app
# Start the application
CMD nginx & /app/api/journalsApp
