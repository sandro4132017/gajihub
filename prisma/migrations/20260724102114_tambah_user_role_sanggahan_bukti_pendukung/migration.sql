-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PEGAWAI', 'KASUBAG_TU', 'PPABP', 'BIRO_OSDMA', 'ADMIN_SISTEM', 'ITJEN', 'PIMPINAN');

-- CreateTable
CREATE TABLE "app_user" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "satuan_kerja" TEXT,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sanggahan" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "referensi_tipe" TEXT NOT NULL,
    "referensi_id" TEXT NOT NULL,
    "pengaju_id" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DIAJUKAN',
    "batas_waktu_verifikasi" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sanggahan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_pendukung_upload" (
    "id" TEXT NOT NULL,
    "sanggahan_id" TEXT NOT NULL,
    "jenis_dokumen" TEXT NOT NULL,
    "nama_file" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "ukuran_bita" INTEGER,
    "diunggah_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bukti_pendukung_upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_nip_key" ON "app_user"("nip");

-- CreateIndex
CREATE INDEX "app_user_role_idx" ON "app_user"("role");

-- CreateIndex
CREATE INDEX "app_user_satuan_kerja_idx" ON "app_user"("satuan_kerja");

-- CreateIndex
CREATE INDEX "sanggahan_pegawai_id_idx" ON "sanggahan"("pegawai_id");

-- CreateIndex
CREATE INDEX "sanggahan_referensi_tipe_referensi_id_idx" ON "sanggahan"("referensi_tipe", "referensi_id");

-- CreateIndex
CREATE INDEX "sanggahan_status_idx" ON "sanggahan"("status");

-- CreateIndex
CREATE INDEX "bukti_pendukung_upload_sanggahan_id_idx" ON "bukti_pendukung_upload"("sanggahan_id");

-- AddForeignKey
ALTER TABLE "sanggahan" ADD CONSTRAINT "sanggahan_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sanggahan" ADD CONSTRAINT "sanggahan_pengaju_id_fkey" FOREIGN KEY ("pengaju_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_pendukung_upload" ADD CONSTRAINT "bukti_pendukung_upload_sanggahan_id_fkey" FOREIGN KEY ("sanggahan_id") REFERENCES "sanggahan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_pendukung_upload" ADD CONSTRAINT "bukti_pendukung_upload_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
