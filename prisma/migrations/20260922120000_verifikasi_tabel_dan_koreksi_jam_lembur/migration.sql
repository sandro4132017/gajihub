-- Koreksi jam lembur per TANGGAL, menumpang di baris koreksi yang sudah ada.
--
-- Tidak bisa ditaruh di presensi_harian: tabel itu dihapus sebulan penuh lalu
-- ditulis ulang tiap sinkronisasi, jadi koreksi manual di sana pasti hilang.
-- NULL = pakai hitungan mesin; 0 = diperiksa, memang tidak ada lembur.
ALTER TABLE "koreksi_presensi_harian"
  ADD COLUMN "jam_lembur" DOUBLE PRECISION;

-- Penanda "tabel ini sudah saya periksa" per unit per periode, syarat sebelum
-- rekap boleh dikirim ke PPABP. Satu baris per tabel supaya bisa dijawab
-- siapa memeriksa tabel MANA dan kapan. Mencabut centang = menghapus barisnya.
CREATE TABLE "verifikasi_tabel_unit" (
  "id" TEXT NOT NULL,
  "satuan_kerja" TEXT NOT NULL,
  "periode_bulan" INTEGER NOT NULL,
  "periode_tahun" INTEGER NOT NULL,
  "jenis_tabel" TEXT NOT NULL,
  "diverifikasi_oleh_id" TEXT NOT NULL,
  "diverifikasi_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "verifikasi_tabel_unit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "verifikasi_tabel_unit_satuan_kerja_periode_bulan_periode_ta_key"
  ON "verifikasi_tabel_unit" ("satuan_kerja", "periode_bulan", "periode_tahun", "jenis_tabel");

CREATE INDEX "verifikasi_tabel_unit_periode_bulan_periode_tahun_idx"
  ON "verifikasi_tabel_unit" ("periode_bulan", "periode_tahun");

ALTER TABLE "verifikasi_tabel_unit"
  ADD CONSTRAINT "verifikasi_tabel_unit_diverifikasi_oleh_id_fkey"
  FOREIGN KEY ("diverifikasi_oleh_id") REFERENCES "app_user"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
