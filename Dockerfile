FROM node:22-alpine AS build
WORKDIR /app

# Install deps using lockfile. esbuild needs its binary installed here.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy source and pre-build the browser bundle.
COPY . .
RUN npm run build


FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production deps only in the runtime layer.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Copy the built app from the build stage.
COPY --from=build /app/async-util ./async-util
COPY --from=build /app/chain ./chain
COPY --from=build /app/lightning ./lightning
COPY --from=build /app/public ./public
COPY --from=build /app/routers ./routers
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/service ./service
COPY --from=build /app/swaps ./swaps
COPY --from=build /app/views ./views
COPY --from=build /app/server.js ./server.js

# Drop privileges: node image ships with a non-root 'node' user.
USER node
EXPOSE 9889

# Disable the prestart build hook — the bundle is already baked in.
CMD ["node", "server.js"]
