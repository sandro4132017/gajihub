-- AlterTable
ALTER TABLE "presensi_harian" ADD COLUMN     "menit_meninggalkan_kantor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "menit_pulang_cepat" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tidak_ikut_upacara" BOOLEAN NOT NULL DEFAULT false;

