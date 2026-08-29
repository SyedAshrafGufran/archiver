# syntax=docker/dockerfile:1
FROM node:22-slim

# --- Puppeteer / whatsapp-web.js needs a real Chromium ---------------------
# We install Chromium via apt instead of letting Puppeteer download its own
# copy, and point Puppeteer at it. This is faster, smaller, and avoids
# Puppeteer's own (large) Chromium download step during build.
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    npm_config_loglevel=warn

RUN apt-get update && apt-get install -y --no-install-recommends \
        chromium \
        fonts-liberation \
        ca-certificates \
        dumb-init \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Dependencies ------------------------------------------------------------
COPY package.json package-lock.json ./
RUN npm ci --only=production

# --- Application code ---------------------------------------------------------
COPY index.js drive-uploader.js list-groups.js oauth-setup.js ./

RUN mkdir -p session .wwebjs_cache

# Run as a non-root user for safety. --no-sandbox is already passed to
# Chromium in the app's own puppeteer launch args, so this still works.
RUN useradd --create-home --shell /bin/bash appuser \
    && chown -R appuser:appuser /app
USER appuser

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "index.js"]
