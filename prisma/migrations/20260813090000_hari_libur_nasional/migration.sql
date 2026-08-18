-- Kalender hari libur nasional & cuti bersama.
-- Satu CREATE TABLE + index + FK. Non-destruktif: tidak menyentuh tabel yang
-- sudah ada, dan selama tabelnya kosong perilaku sistem persis seperti
-- sebelumnya (hari libur = Sabtu/Minggu saja).
CREATE TABLE "hari_libur_nasional" (
    "id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "keterangan" TEXT NOT NULL,
    "cutiBersama" BOOLEAN NOT NULL DEFAULT false,
    "ditetapkan_oleh_id" TEXT NOT NULL,
    "ditetapkan_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hari_libur_nasional_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "hari_libur_nasional_tanggal_key" ON "hari_libur_nasional"("tanggal");
CREATE INDEX "hari_libur_nasional_tanggal_idx" ON "hari_libur_nasional"("tanggal");

ALTER TABLE "hari_libur_nasional" ADD CONSTRAINT "hari_libur_nasional_ditetapkan_oleh_id_fkey"
    FOREIGN KEY ("ditetapkan_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
