-- Tambah Dokumen TTE BSrE dan Log Gagal TTE
-- Mendukung 11 Kriteria Integrasi Sistem dengan BSrE BSSN (Kriteria IX & Pedoman Teknis)

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "StatusDokumenTte" AS ENUM ('DRAFT', 'MENUNGGU_TTE', 'TERTANDATANGANI', 'GAGAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "dokumen_tte" (
    "id" TEXT NOT NULL,
    "jenis_dokumen" TEXT NOT NULL,
    "nomor_dokumen" TEXT,
    "judul_dokumen" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "satuan_kerja" TEXT NOT NULL,
    "status" "StatusDokumenTte" NOT NULL DEFAULT 'DRAFT',
    "file_draft_path" TEXT,
    "file_signed_path" TEXT,
    "id_dokumen_bsre" TEXT,
    "signed_at" TIMESTAMP(3),
    "signing_time_ms" INTEGER,
    "penandatangan_id" TEXT,
    "penandatangan_nip" TEXT,
    "penandatangan_nama" TEXT,
    "penandatangan_jabatan" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dokumen_tte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "log_gagal_tte" (
    "id" TEXT NOT NULL,
    "dokumen_tte_id" TEXT,
    "user_id" TEXT,
    "nip" TEXT NOT NULL,
    "status_code" INTEGER,
    "pesan_error" TEXT NOT NULL,
    "kategori_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_gagal_tte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dokumen_tte_jenis_dokumen_periode_bulan_periode_tahun_idx" ON "dokumen_tte"("jenis_dokumen", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dokumen_tte_satuan_kerja_periode_bulan_periode_tahun_idx" ON "dokumen_tte"("satuan_kerja", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "dokumen_tte_status_idx" ON "dokumen_tte"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "log_gagal_tte_dokumen_tte_id_idx" ON "log_gagal_tte"("dokumen_tte_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "log_gagal_tte_nip_created_at_idx" ON "log_gagal_tte"("nip", "created_at");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "dokumen_tte" ADD CONSTRAINT "dokumen_tte_penandatangan_id_fkey" FOREIGN KEY ("penandatangan_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "log_gagal_tte" ADD CONSTRAINT "log_gagal_tte_dokumen_tte_id_fkey" FOREIGN KEY ("dokumen_tte_id") REFERENCES "dokumen_tte"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "log_gagal_tte" ADD CONSTRAINT "log_gagal_tte_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

