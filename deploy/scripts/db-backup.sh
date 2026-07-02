#!/usr/bin/env bash
# ============================================================
# AdigeHost - Veritabanı yedekleme scripti
# Günlük mysqldump + gzip + rotasyon. Cron ile çalıştırılır.
# Elle:  bash deploy/scripts/db-backup.sh
#
# Ayarlanabilir (env):
#   ADIGEHOST_BACKUP_DIR       (varsayılan /root/backups)
#   ADIGEHOST_BACKUP_KEEP_DAYS (varsayılan 14)
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="$ROOT/backend/.env"
BACKUP_DIR="${ADIGEHOST_BACKUP_DIR:-/root/backups}"
KEEP_DAYS="${ADIGEHOST_BACKUP_KEEP_DAYS:-14}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[db-backup] HATA: $ENV_FILE bulunamadı" >&2
  exit 1
fi

# .env'den yalnızca ilgili anahtarı oku (tırnakları soy). Şifre komut satırına yazılmaz.
get_env() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//'
}

DB_HOST="$(get_env DB_HOST)"; DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(get_env DB_PORT)"; DB_PORT="${DB_PORT:-3306}"
DB_NAME="$(get_env DB_NAME)"
DB_USER="$(get_env DB_USER)"
DB_PASS="$(get_env DB_PASS)"

if [[ -z "$DB_NAME" || -z "$DB_USER" ]]; then
  echo "[db-backup] HATA: DB_NAME/DB_USER .env'de okunamadı" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}-${STAMP}.sql.gz"

# Şifreyi güvenli geçir: geçici defaults dosyası (process listesinde görünmez).
DEFAULTS="$(mktemp)"
chmod 600 "$DEFAULTS"
trap 'rm -f "$DEFAULTS"' EXIT
cat > "$DEFAULTS" <<EOF
[client]
host=$DB_HOST
port=$DB_PORT
user=$DB_USER
password=$DB_PASS
EOF

# --single-transaction: InnoDB için kilitsiz tutarlı döküm (canlıda güvenli).
# --no-tablespaces: DB kullanıcısı PROCESS yetkisi gerektirmesin (veri dökümü tam kalır).
mysqldump --defaults-extra-file="$DEFAULTS" \
  --single-transaction --quick --routines --triggers --events --no-tablespaces \
  "$DB_NAME" | gzip -9 > "$OUT"

# Boş/bozuk döküm koruması: gzip bütünlüğü + minimum boyut.
if ! gzip -t "$OUT" 2>/dev/null || [[ "$(stat -c%s "$OUT")" -lt 1024 ]]; then
  echo "[db-backup] HATA: döküm bozuk/çok küçük, siliniyor: $OUT" >&2
  rm -f "$OUT"
  exit 1
fi

# Rotasyon: KEEP_DAYS günden eski dökümleri sil.
find "$BACKUP_DIR" -maxdepth 1 -name "${DB_NAME}-*.sql.gz" -type f -mtime +"$KEEP_DAYS" -delete

echo "[db-backup] $(date -u +%FT%TZ) OK: $OUT ($(du -h "$OUT" | cut -f1))"
