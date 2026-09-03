#!/usr/bin/env bash
#
# Sinkronisasi terjadwal Gajihub:
#   pegawai  <- SIAP (SQL Server, READ-ONLY)
#   presensi <- e-Presensi (PostgreSQL, READ-ONLY)
#
# Dipanggil cron di VPS, TAPI SENGAJA JALAN JUGA DI LAPTOP: direktori aplikasi
# diturunkan dari lokasi file ini, bukan ditulis tetap. Jadi yang diuji di
# lokal adalah file yang sama persis dengan yang nanti jalan di server -
# skrip yang "sudah dicoba" tapi isinya beda dengan yang dipasang adalah
# pengujian yang tidak membuktikan apa-apa.
#
#   scripts/sync-harian.sh --dry-run    # tidak menulis apa pun - coba ini dulu
#   scripts/sync-harian.sh              # sungguhan
#
# Cron di VPS (NIP ditaruh di crontab, BUKAN di file ini - repo ini publik):
#   0 2 * * * GAJIHUB_SYNC_NIP=<NIP> /home/support/apps/gajihub/scripts/sync-harian.sh
#
# TIDAK memakai `set -e`: kalau sinkronisasi pegawai gagal, presensi tetap
# dicoba. Dua sumber yang berbeda tidak saling bergantung, dan menghentikan
# semuanya karena satu gagal membuat log hari itu kehilangan separuh
# informasinya. Kegagalan dicatat lalu dikembalikan lewat exit code.
set -uo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR" || exit 1

# Cron memulai dengan PATH minim (/usr/bin:/bin) - node/npm sering tidak ada
# di sana. Ditambahkan di depan, bukan menimpa, supaya sesi interaktif (dan
# nvm) tetap utuh waktu skrip ini dijalankan dengan tangan.
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"

# Gagal NYARING kalau npm tetap tidak ketemu. Inilah cara cron paling sering
# gagal, dan tanpa baris ini kegagalannya cuma berupa log kosong.
if ! command -v npm >/dev/null 2>&1; then
  echo "FATAL: npm tidak ada di PATH." >&2
  echo "  PATH = $PATH" >&2
  echo "  Jalankan 'which node npm', lalu tambahkan direktorinya ke baris export PATH di skrip ini." >&2
  exit 1
fi

# NIP penanggung jawab penarikan presensi - tercatat di RekapPresensiPeriode,
# jadi harus akun sungguhan. Diambil dari environment, TIDAK ditulis di sini:
# repo ini publik, dan menempelkan NIP seseorang ke dalamnya tidak ada
# gunanya bagi siapa pun.
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

# Bulan berjalan.
BULAN_INI="$(date +%-m)"
TAHUN_INI="$(date +%Y)"

# Bulan lalu - dihitung lewat "tanggal 1 bulan ini, mundur 1 hari", BUKAN
# `date -d 'last month'`. Yang terakhir itu salah pada tanggal 29-31: di
# tanggal 31 Maret ia menghasilkan 3 Maret, bukan Februari.
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

  # Tiga hari pertama tiap bulan, tarik juga bulan sebelumnya. Hari-hari
  # terakhir sebuah bulan baru lengkap SETELAH bulan itu berakhir; tanpa ini
  # ekor tiap bulan tertinggal selamanya.
  #
  # Ditaruh di AWAL bulan dengan sengaja - sebelum unit mulai menghitung dan
  # mengirim rekap periode itu. Menarik ulang presensi bulan yang rekapnya
  # SUDAH dikirim akan menggeser angka yang sudah dipertanggungjawabkan.
  if [ "$(date +%-d)" -le 3 ]; then
    jalankan npm run sync:presensi -- \
      --bulan="$BULAN_LALU" --tahun="$TAHUN_LALU" --oleh="$NIP_OPERATOR" $KERING
  fi

  echo
  echo "===== selesai $(date -Is) - status: $([ $gagal -eq 0 ] && echo OK || echo ADA_YANG_GAGAL) ====="
} 2>&1 | tee -a "$LOG"

# Buang log lebih tua dari 60 hari.
find "$LOG_DIR" -name 'sync-*.log' -mtime +60 -delete 2>/dev/null

exit $gagal
