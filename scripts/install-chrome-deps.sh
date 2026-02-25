#!/bin/bash
# Install Chromium/Puppeteer system dependencies for Debian/Ubuntu servers.
# Run as root: bash scripts/install-chrome-deps.sh

set -e

echo "[Chrome Deps] Installing system libraries for Puppeteer..."

apt-get update -qq

apt-get install -y --no-install-recommends \
  libnspr4 \
  libnss3 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libcups2 \
  libdrm2 \
  libxkbcommon0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libpango-1.0-0 \
  libcairo2 \
  libasound2 \
  libxshmfence1 \
  fonts-liberation \
  xdg-utils

echo "[Chrome Deps] Done. Puppeteer should now be able to launch Chrome."
