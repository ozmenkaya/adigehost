#!/usr/bin/env bash
# ============================================================
# AdigeHost - Deploy scripti (sıfır-kesinti)
# /var/www/adigehost içinde çalıştırın:  bash deploy/scripts/deploy.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "==> Git: en son kod çekiliyor"
git pull --ff-only origin main

echo "==> Bağımlılıklar (workspaces)"
npm ci

echo "==> Backend build"
npm run build:backend

echo "==> DB migration (güvenli mod)"
npm run migrate

echo "==> Frontend build"
npm run build:frontend

echo "==> PM2 reload (sıfır-kesinti)"
if pm2 describe adigehost-api > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --env production
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

echo "✅ Deploy tamamlandı."
