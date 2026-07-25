-- Data cleanup (dev/demo only): baris app_user & sanggahan yang ada sekarang
-- cuma akun demo lama (7 baris, role BIRO_OSDMA/ADMIN_SISTEM/ITJEN yang
-- sudah tidak ada di enum Role baru) + 2 baris sanggahan hasil testing
-- manual sebelumnya. BUKAN data pegawai/kalkulasi asli (tabel pegawai,
-- tukin_calculation, dst SAMA SEKALI TIDAK disentuh migrasi ini). Aman
-- dihapus karena akan diisi ulang oleh seed script yang baru
-- (src/auth/seedUsers.ts, src/db/seedSimulasi.ts).
DELETE FROM "bukti_pendukung_upload";
DELETE FROM "sanggahan";
DELETE FROM "app_user";

-- AlterEnum
BEGIN;
CREATE TYPE "Role_new" AS ENUM ('PEGAWAI', 'KASUBAG_TU', 'OSDMA', 'PPABP', 'PIMPINAN', 'ADMIN');
ALTER TABLE "app_user" ALTER COLUMN "role" TYPE "Role_new" USING ("role"::text::"Role_new");
ALTER TABLE "usulan_perubahan_role" ALTER COLUMN "role_saat_ini" TYPE "Role_new" USING ("role_saat_ini"::text::"Role_new");
ALTER TABLE "usulan_perubahan_role" ALTER COLUMN "role_diusulkan" TYPE "Role_new" USING ("role_diusulkan"::text::"Role_new");
ALTER TYPE "Role" RENAME TO "Role_old";
ALTER TYPE "Role_new" RENAME TO "Role";
DROP TYPE "Role_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "bukti_pendukung_upload" DROP CONSTRAINT "bukti_pendukung_upload_diunggah_oleh_id_fkey";

-- DropForeignKey
ALTER TABLE "bukti_pendukung_upload" DROP CONSTRAINT "bukti_pendukung_upload_sanggahan_id_fkey";

-- DropForeignKey
ALTER TABLE "sanggahan" DROP CONSTRAINT "sanggahan_pegawai_id_fkey";

-- DropForeignKey
ALTER TABLE "sanggahan" DROP CONSTRAINT "sanggahan_pengaju_id_fkey";

-- DropTable
DROP TABLE "bukti_pendukung_upload";

-- DropTable
DROP TABLE "sanggahan";

-- CreateTable
CREATE TABLE "banding" (
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

    CONSTRAINT "banding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_dukung" (
    "id" TEXT NOT NULL,
    "banding_id" TEXT NOT NULL,
    "jenis_dokumen" TEXT NOT NULL,
    "nama_file" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "ukuran_bita" INTEGER,
    "diunggah_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bukti_dukung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sk_kgb" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "nomor_sk" TEXT NOT NULL,
    "tanggal_sk" TIMESTAMP(3) NOT NULL,
    "tmt_kgb" TIMESTAMP(3) NOT NULL,
    "golongan_lama" TEXT NOT NULL,
    "golongan_baru" TEXT NOT NULL,
    "file_url" TEXT,
    "diajukan_oleh_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DIAJUKAN',
    "applied_at" TIMESTAMP(3),
    "applied_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sk_kgb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sk_hukuman_disiplin" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "nomor_sk" TEXT NOT NULL,
    "tanggal_sk" TIMESTAMP(3) NOT NULL,
    "jenis_hukuman" TEXT NOT NULL,
    "keterangan" TEXT,
    "periode_mulai_bulan" INTEGER NOT NULL,
    "periode_mulai_tahun" INTEGER NOT NULL,
    "periode_selesai_bulan" INTEGER,
    "periode_selesai_tahun" INTEGER,
    "file_url" TEXT,
    "diajukan_oleh_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DIAJUKAN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sk_hukuman_disiplin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anggaran_realisasi" (
    "id" TEXT NOT NULL,
    "satuan_kerja" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "pagu" DOUBLE PRECISION NOT NULL,
    "realisasi" DOUBLE PRECISION NOT NULL,
    "source_file_url" TEXT,
    "diunggah_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anggaran_realisasi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bukti_potong_pajak" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "tahun_pajak" INTEGER NOT NULL,
    "nomor_bukti_potong" TEXT,
    "file_url" TEXT NOT NULL,
    "diunggah_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bukti_potong_pajak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usulan_perubahan_role" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_saat_ini" "Role" NOT NULL,
    "role_diusulkan" "Role" NOT NULL,
    "alasan" TEXT,
    "diusulkan_oleh_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'MENUNGGU',
    "diputuskan_oleh_id" TEXT,
    "diputuskan_pada" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usulan_perubahan_role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banding_pegawai_id_idx" ON "banding"("pegawai_id");

-- CreateIndex
CREATE INDEX "banding_referensi_tipe_referensi_id_idx" ON "banding"("referensi_tipe", "referensi_id");

-- CreateIndex
CREATE INDEX "banding_status_idx" ON "banding"("status");

-- CreateIndex
CREATE INDEX "bukti_dukung_banding_id_idx" ON "bukti_dukung"("banding_id");

-- CreateIndex
CREATE INDEX "sk_kgb_pegawai_id_idx" ON "sk_kgb"("pegawai_id");

-- CreateIndex
CREATE INDEX "sk_kgb_status_idx" ON "sk_kgb"("status");

-- CreateIndex
CREATE INDEX "sk_hukuman_disiplin_pegawai_id_idx" ON "sk_hukuman_disiplin"("pegawai_id");

-- CreateIndex
CREATE INDEX "sk_hukuman_disiplin_status_idx" ON "sk_hukuman_disiplin"("status");

-- CreateIndex
CREATE INDEX "anggaran_realisasi_periode_bulan_periode_tahun_idx" ON "anggaran_realisasi"("periode_bulan", "periode_tahun");

-- CreateIndex
CREATE UNIQUE INDEX "anggaran_realisasi_satuan_kerja_periode_bulan_periode_tahun_key" ON "anggaran_realisasi"("satuan_kerja", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE UNIQUE INDEX "bukti_potong_pajak_pegawai_id_tahun_pajak_key" ON "bukti_potong_pajak"("pegawai_id", "tahun_pajak");

-- CreateIndex
CREATE INDEX "usulan_perubahan_role_user_id_idx" ON "usulan_perubahan_role"("user_id");

-- CreateIndex
CREATE INDEX "usulan_perubahan_role_status_idx" ON "usulan_perubahan_role"("status");

-- AddForeignKey
ALTER TABLE "banding" ADD CONSTRAINT "banding_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banding" ADD CONSTRAINT "banding_pengaju_id_fkey" FOREIGN KEY ("pengaju_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung" ADD CONSTRAINT "bukti_dukung_banding_id_fkey" FOREIGN KEY ("banding_id") REFERENCES "banding"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_dukung" ADD CONSTRAINT "bukti_dukung_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sk_kgb" ADD CONSTRAINT "sk_kgb_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sk_kgb" ADD CONSTRAINT "sk_kgb_diajukan_oleh_id_fkey" FOREIGN KEY ("diajukan_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sk_hukuman_disiplin" ADD CONSTRAINT "sk_hukuman_disiplin_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sk_hukuman_disiplin" ADD CONSTRAINT "sk_hukuman_disiplin_diajukan_oleh_id_fkey" FOREIGN KEY ("diajukan_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anggaran_realisasi" ADD CONSTRAINT "anggaran_realisasi_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_potong_pajak" ADD CONSTRAINT "bukti_potong_pajak_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bukti_potong_pajak" ADD CONSTRAINT "bukti_potong_pajak_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usulan_perubahan_role" ADD CONSTRAINT "usulan_perubahan_role_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usulan_perubahan_role" ADD CONSTRAINT "usulan_perubahan_role_diusulkan_oleh_id_fkey" FOREIGN KEY ("diusulkan_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usulan_perubahan_role" ADD CONSTRAINT "usulan_perubahan_role_diputuskan_oleh_id_fkey" FOREIGN KEY ("diputuskan_oleh_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

