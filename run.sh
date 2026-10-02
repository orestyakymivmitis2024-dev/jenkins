#!/usr/bin/env bash
# Runs any command inside Node 22 + pnpm, so nothing needs to be installed locally except Docker.
#   ./run.sh pnpm install
#   CLOUDFLARE_ENV=develop ./run.sh pnpm build
#   ./run.sh npx wrangler whoami
# Cloudflare / build variables are passed through from your shell if they are set.
set -euo pipefail

IMAGE="node:22.22.0-bookworm-slim"
PNPM_VERSION="11.5.2"
TTY=""; [ -t 0 ] && [ -t 1 ] && TTY="-it"

exec docker run --rm $TTY \
  -v "$PWD:/app" -w /app \
  -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -e CLOUDFLARE_API_TOKEN -e CLOUDFLARE_ACCOUNT_ID -e CLOUDFLARE_ENV \
  -e PUBLIC_BUILD_BRANCH -e PUBLIC_BUILD_TIME -e PUBLIC_DEPLOY_TIER \
  -p 8787:8787 \
  "$IMAGE" \
  sh -c 'cmd="$1"; shift
         if [ "$cmd" = "pnpm" ]; then exec npx -y "pnpm@'"$PNPM_VERSION"'" "$@"; fi
         exec "$cmd" "$@"' sh "$@"
