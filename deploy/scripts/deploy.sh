#!/usr/bin/env bash
# ============================================================
# AdigeHost - Deploy (atomik, sıfır-kesinti)
# Kullanım:  bash deploy/scripts/deploy.sh [--allow-dirty] [--no-pull]
#
# Nasıl çalışır
#   Build çıktısı servis EDİLMEYEN `*/build-out` dizinine yazılır, oradan
#   `*/releases/<sürüm>` altına taşınır ve `*/dist` symlink'i atomik olarak
#   (rename(2)) yeni sürüme çevrilir. Böylece:
#     - Doğrulama amaçlı alınan bir build canlıyı ETKİLEMEZ.
#     - Yayın anı tek bir atomik işlemdir; yarım build kimseye servis edilmez.
#     - Geri alma tek komut: deploy/scripts/rollback.sh
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

ALLOW_DIRTY=0
DO_PULL=1
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --no-pull) DO_PULL=0 ;;
    *) echo "Bilinmeyen argüman: $arg" >&2; exit 2 ;;
  esac
done

KEEP_RELEASES=5
STAMP="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"

log() { printf '\n==> %s\n' "$1"; }
fail() { printf '\n❌ %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------
# 1) Kirli çalışma dizini koruması
# ---------------------------------------------------------------
# Canlı kod ile repo aynı dizinde durduğu için, commit'lenmemiş iş farkında
# olmadan ziyaretçilere açılabiliyor. Deploy edilen şey commit'lenmiş olmalı.
if [[ $ALLOW_DIRTY -eq 0 ]] && [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit'lenmemiş değişiklikler var — deploy edilecek sürüm belirsiz:" >&2
  git status --short >&2
  fail "Önce commit'leyin, ya da bilerek yayınlıyorsanız --allow-dirty geçin."
fi

# ---------------------------------------------------------------
# 2) Kod ve bağımlılıklar
# ---------------------------------------------------------------
if [[ $DO_PULL -eq 1 ]]; then
  log "Git: en son kod çekiliyor"
  git pull --ff-only origin main
fi

log "Bağımlılıklar (workspaces)"
npm ci

log "Tip kontrolü"
npm run typecheck || fail "Tip kontrolü başarısız — deploy durduruldu."

# ---------------------------------------------------------------
# 3) Build (servis edilmeyen build-out dizinlerine)
# ---------------------------------------------------------------
log "Backend build"
rm -rf backend/build-out
npm run build:backend

log "Frontend build"
rm -rf frontend/build-out
npm run build:frontend

[[ -f backend/build-out/index.js ]] || fail "backend/build-out/index.js üretilmedi."
[[ -f frontend/build-out/index.html ]] || fail "frontend/build-out/index.html üretilmedi."

# ---------------------------------------------------------------
# 4) DB migration (symlink çevrilmeden önce — şema yeni koda hazır olsun)
# ---------------------------------------------------------------
log "DB migration (güvenli mod)"
# LOG_DIR ayrı: uygulama log'unu PM2 root olarak yazıyor, deploy ise normal
# kullanıcı olarak çalışıyor. Aynı günlük dosyaya iki farklı kullanıcı yazamadığı
# için (EACCES) migration kendi dizinine loglar. dotenv mevcut ortam değişkenini
# ezmediğinden buradaki değer .env'deki LOG_DIR'i geçersiz kılar.
mkdir -p backend/logs/deploy
LOG_DIR=logs/deploy npm run migrate --workspace backend

# ---------------------------------------------------------------
# 5) Sürümü hazırla + atomik yayın
# ---------------------------------------------------------------
publish() {
  local app="$1"           # backend | frontend
  local rel="$app/releases/$STAMP"

  mkdir -p "$app/releases"
  rm -rf "$rel"
  mv "$app/build-out" "$rel"

  cat > "$rel/BUILD_INFO" <<EOF
stamp=$STAMP
commit=$(git rev-parse HEAD)
branch=$(git rev-parse --abbrev-ref HEAD)
dirty=$([[ -n "$(git status --porcelain)" ]] && echo yes || echo no)
built_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
built_by=$(id -un)
EOF

  # rename(2) atomiktir: eski symlink tek adımda yenisiyle değişir, ziyaretçi
  # hiçbir an yarım/eksik dizin görmez.
  ln -sfn "releases/$STAMP" "$app/dist.tmp"
  mv -T "$app/dist.tmp" "$app/dist"
}

log "Yayın: frontend"
publish frontend

log "Yayın: backend"
publish backend

# ---------------------------------------------------------------
# 6) PM2 reload
# ---------------------------------------------------------------
log "PM2 reload (sıfır-kesinti)"
# DİKKAT: uygulama root'un PM2 daemon'ında kayıtlı ve 5000 portunu o tutuyor.
# PM2 daemon'ları kullanıcı başına ayrıdır; sudo'suz çağırırsan normal kullanıcının
# boş daemon'ı "uygulama çalışmıyor" deyip ikinci bir kopya başlatır, o da portu
# alamayıp sonsuz restart döngüsüne girer (2026-08-11'de oldu).
if sudo pm2 describe adigehost-api > /dev/null 2>&1; then
  sudo pm2 reload ecosystem.config.cjs --env production
else
  fail "adigehost-api root'un PM2'sinde kayıtlı değil — elle kontrol edin (sudo pm2 list)."
fi
sudo pm2 save

# ---------------------------------------------------------------
# 7) Duman testi
# ---------------------------------------------------------------
log "Duman testi"
sleep 3
api_code="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/api/health || echo 000)"
[[ "$api_code" == "200" ]] || echo "⚠️  API /api/health beklenmedik yanıt: $api_code" >&2

# ---------------------------------------------------------------
# 8) Eski sürümleri buda (canlı olan asla silinmez)
# ---------------------------------------------------------------
prune() {
  local app="$1"
  local current
  current="$(basename "$(readlink "$app/dist")")"
  # shellcheck disable=SC2012
  ls -1 "$app/releases" 2>/dev/null | sort -r | tail -n +$((KEEP_RELEASES + 1)) | while read -r old; do
    [[ "$old" == "$current" ]] && continue
    rm -rf "${app:?}/releases/${old:?}"
  done
}
prune frontend
prune backend

log "✅ Deploy tamamlandı — sürüm: $STAMP"
echo "   Geri almak için: bash deploy/scripts/rollback.sh"
