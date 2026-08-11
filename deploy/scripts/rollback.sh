#!/usr/bin/env bash
# ============================================================
# AdigeHost - Bir önceki sürüme dön
# Kullanım:
#   bash deploy/scripts/rollback.sh            # bir önceki sürüme
#   bash deploy/scripts/rollback.sh <stamp>    # belirli bir sürüme
#   bash deploy/scripts/rollback.sh --list     # mevcut sürümleri listele
#
# Symlink'i çevirir; yeniden build almaz. Saniyeler içinde geri döner.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

log() { printf '\n==> %s\n' "$1"; }
fail() { printf '\n❌ %s\n' "$1" >&2; exit 1; }

current_of() { basename "$(readlink "$1/dist")"; }

if [[ "${1:-}" == "--list" ]]; then
  for app in frontend backend; do
    echo "--- $app (canlı: $(current_of "$app")) ---"
    ls -1 "$app/releases" 2>/dev/null | sort -r
  done
  exit 0
fi

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  # Frontend'in canlı sürümünden bir önceki
  TARGET="$(ls -1 frontend/releases | sort -r | grep -v "^$(current_of frontend)$" | head -1 || true)"
  [[ -n "$TARGET" ]] || fail "Dönülecek önceki sürüm yok."
fi

for app in frontend backend; do
  [[ -d "$app/releases/$TARGET" ]] || fail "$app/releases/$TARGET yok — sürüm eksik, geri alma durduruldu."
done

log "Geri alınıyor → $TARGET"
for app in frontend backend; do
  ln -sfn "releases/$TARGET" "$app/dist.tmp"
  mv -T "$app/dist.tmp" "$app/dist"
done

log "PM2 reload"
pm2 reload ecosystem.config.cjs --env production
pm2 save

log "✅ Geri alındı — sürüm: $TARGET"
cat "frontend/releases/$TARGET/BUILD_INFO" 2>/dev/null || true
