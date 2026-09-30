set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || exit 1

export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

if ! command -v npm >/dev/null 2>&1; then
  echo "FATAL: npm tidak ada di PATH." >&2
  echo "  PATH = $PATH" >&2
  echo "  Jalankan 'which node npm', lalu tambahkan direktorinya ke baris export PATH di skrip ini." >&2
  exit 1
fi

NIP_OPERATOR="${GAJIHUB_SYNC_NIP:-}"
if [ -z "$NIP_OPERATOR" ]; then
  echo "FATAL: GAJIHUB_SYNC_NIP belum diisi." >&2
  echo "  Contoh: GAJIHUB_SYNC_NIP=198703232015031002 scripts/sync-harian.sh --dry-run" >&2
  exit 1
fi

KERING=""
if [ "${1:-}" = "--dry-run" ]; then
  KERING="--dry-run"
fi

LOG_DIR="$APP_DIR/log-sync"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/sync-$(date +%F).log"

BULAN_INI="$(date +%-m)"
TAHUN_INI="$(date +%Y)"

AWAL_BULAN_INI="$(date +%Y-%m-01)"
BULAN_LALU="$(date -d "$AWAL_BULAN_INI -1 day" +%-m)"
TAHUN_LALU="$(date -d "$AWAL_BULAN_INI -1 day" +%Y)"

gagal=0
jalankan() {
  echo
  echo "--- $* ---"
  if ! "$@"; then
    echo "!!! GAGAL: $*"
    gagal=1
  fi
}

{
  echo "===== mulai $(date -Is) ${KERING:+[DRY RUN]} ====="
  echo "app: $APP_DIR"

  jalankan npm run sync:pegawai -- $KERING

  jalankan npm run sync:presensi -- \
    --bulan="$BULAN_INI" --tahun="$TAHUN_INI" --oleh="$NIP_OPERATOR" $KERING

  if [ "$(date +%-d)" -le 3 ]; then
    jalankan npm run sync:presensi -- \
      --bulan="$BULAN_LALU" --tahun="$TAHUN_LALU" --oleh="$NIP_OPERATOR" $KERING
  fi

  echo
  echo "===== selesai $(date -Is) - status: $([ $gagal -eq 0 ] && echo OK || echo ADA_YANG_GAGAL) ====="
} 2>&1 | tee -a "$LOG"

find "$LOG_DIR" -name 'sync-*.log' -mtime +60 -delete 2>/dev/null

exit $gagal
