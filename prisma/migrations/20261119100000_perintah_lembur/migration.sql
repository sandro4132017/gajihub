-- Perintah lembur (SPKL): CREATE saja + satu kolom nullable di presensi_harian.

-- CreateEnum
CREATE TYPE "StatusPerintahLembur" AS ENUM ('DRAFT', 'TERKIRIM', 'GAGAL');

-- AlterTable
ALTER TABLE "presensi_harian" ADD COLUMN     "jam_lembur_nyata" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "perintah_lembur" (
    "id" TEXT NOT NULL,
    "satuan_kerja" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "kepala_tim_id" TEXT NOT NULL,
    "uraian_tugas" TEXT NOT NULL,
    "status" "StatusPerintahLembur" NOT NULL DEFAULT 'DRAFT',
    "nomor_surat" TEXT,
    "dokumen_tte_id" TEXT,
    "dikirim_pada" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "perintah_lembur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "perintah_lembur_anggota" (
    "id" TEXT NOT NULL,
    "perintah_lembur_id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "jam_diperintahkan" INTEGER NOT NULL,
    "keterangan" TEXT,
    "terkirim" BOOLEAN,

    CONSTRAINT "perintah_lembur_anggota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perintah_lembur_dokumen_tte_id_key" ON "perintah_lembur"("dokumen_tte_id");

-- CreateIndex
CREATE INDEX "perintah_lembur_satuan_kerja_tanggal_idx" ON "perintah_lembur"("satuan_kerja", "tanggal");

-- CreateIndex
CREATE INDEX "perintah_lembur_kepala_tim_id_tanggal_idx" ON "perintah_lembur"("kepala_tim_id", "tanggal");

-- CreateIndex
CREATE INDEX "perintah_lembur_dikirim_pada_idx" ON "perintah_lembur"("dikirim_pada");

-- CreateIndex
CREATE INDEX "perintah_lembur_anggota_pegawai_id_tanggal_idx" ON "perintah_lembur_anggota"("pegawai_id", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "perintah_lembur_anggota_perintah_lembur_id_pegawai_id_key" ON "perintah_lembur_anggota"("perintah_lembur_id", "pegawai_id");

-- CreateIndex
-- Satu pegawai, satu perintah TERKIRIM per tanggal: `terkirim` hanya true atau
-- NULL, dan NULL selalu dianggap berbeda, jadi hanya dua baris true yang bentrok.
CREATE UNIQUE INDEX "perintah_lembur_anggota_pegawai_id_tanggal_terkirim_key" ON "perintah_lembur_anggota"("pegawai_id", "tanggal", "terkirim");

-- AddForeignKey
ALTER TABLE "perintah_lembur" ADD CONSTRAINT "perintah_lembur_kepala_tim_id_fkey" FOREIGN KEY ("kepala_tim_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perintah_lembur" ADD CONSTRAINT "perintah_lembur_dokumen_tte_id_fkey" FOREIGN KEY ("dokumen_tte_id") REFERENCES "dokumen_tte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perintah_lembur_anggota" ADD CONSTRAINT "perintah_lembur_anggota_perintah_lembur_id_fkey" FOREIGN KEY ("perintah_lembur_id") REFERENCES "perintah_lembur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perintah_lembur_anggota" ADD CONSTRAINT "perintah_lembur_anggota_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
