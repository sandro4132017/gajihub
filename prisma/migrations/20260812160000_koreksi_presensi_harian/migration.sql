-- Koreksi jam presensi per pegawai per hari (lanjutan Pasal 10 ayat (2)
-- Permenaker 15/2024): e-Presensi error -> pegawai lapor beserta foto,
-- geotag, dan jam -> petugas absensi memperbaikinya di sini.
--
-- Satu CREATE TABLE + index + dua foreign key. Non-destruktif: tidak
-- menyentuh satupun tabel yang sudah ada, termasuk presensi_harian yang
-- tetap menyimpan data mentah e-Presensi apa adanya.

CREATE TABLE "koreksi_presensi_harian" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "jam_masuk" TIMESTAMP(3),
    "jam_keluar" TIMESTAMP(3),
    "alasan" TEXT NOT NULL,
    "dikoreksi_oleh_id" TEXT NOT NULL,
    "dikoreksi_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "koreksi_presensi_harian_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "koreksi_presensi_harian_tanggal_idx" ON "koreksi_presensi_harian"("tanggal");

CREATE UNIQUE INDEX "koreksi_presensi_harian_pegawai_id_tanggal_key"
    ON "koreksi_presensi_harian"("pegawai_id", "tanggal");

ALTER TABLE "koreksi_presensi_harian"
    ADD CONSTRAINT "koreksi_presensi_harian_pegawai_id_fkey"
    FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "koreksi_presensi_harian"
    ADD CONSTRAINT "koreksi_presensi_harian_dikoreksi_oleh_id_fkey"
    FOREIGN KEY ("dikoreksi_oleh_id") REFERENCES "app_user"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
