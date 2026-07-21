# Curio Automation — production image for Render (web + worker share this image).
#
# The local Mac pipeline shells out to ffmpeg/ffprobe and renders caption plates with
# Pillow. On Render there is no macOS, no Homebrew ffmpeg and no system font book, so
# everything media-related must be installed explicitly here. Fonts matter: the caption
# and plate renderers select by family name, and a missing family silently falls back
# to a different typeface, which is a brand defect that no test would catch.

FROM node:22-bookworm-slim AS base

# ffmpeg/ffprobe + fonts + fontconfig. libass/freetype come in with ffmpeg on Debian,
# which is what the local Mac build was missing (see PRODUCTION_DOCTRINE: local ffmpeg
# has no drawtext/libass, so captions were rendered via Pillow PNG overlay).
# python3 + python3-pil back tools/caption_render.py, the PORTABLE caption
# rasterizer. The Swift/AppKit tool cannot run here, so without Pillow this
# container could not caption a video at all.
# (Comment kept OUTSIDE the RUN: a '#' inside a backslash continuation is
# parser-dependent and this image cannot be built locally to verify it.)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pil \
      fontconfig \
      fonts-dejavu-core \
      fonts-liberation2 \
      ca-certificates \
      tini \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production

# ---- dependencies (cached layer) -------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# ---- build ------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM base AS runtime

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public
COPY db ./db
COPY tools ./tools
COPY assets ./assets

# Non-root. Render runs containers as root by default; we drop privileges because this
# process shells out to ffmpeg with attacker-influenceable filenames.
RUN useradd --system --uid 10001 --create-home curio \
  && mkdir -p /app/var /tmp/curio \
  && chown -R curio:curio /app /tmp/curio
USER curio

ENV MEDIA_TMP_DIR=/tmp/curio \
    PORT=10000

EXPOSE 10000

# tini reaps ffmpeg zombies and forwards SIGTERM so in-flight stages can checkpoint
# before Render kills the container during a deploy.
ENTRYPOINT ["/usr/bin/tini", "--"]

# Overridden by render.yaml for the worker service.
CMD ["node", "dist/src/server.js"]
