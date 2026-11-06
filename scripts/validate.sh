#!/usr/bin/env sh
set -eu
node --check server.js
node --check auth-service/index.js
node --check log-service/index.js
npm --prefix frontend run build
printf '\nValidações locais concluídas. Para validar Compose, execute docker compose config --quiet.\n'
