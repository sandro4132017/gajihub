-- AlterTable
ALTER TABLE "rekap_presensi_periode" ADD COLUMN     "jumlah_hari_diklat" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jumlah_hari_dinas_luar" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jumlah_hari_makan_lembur" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jumlah_hari_wfh_wfa" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "jumlah_hari_wfo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_jam_lembur" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "uang_lembur" ADD COLUMN     "jumlah_hari_makan_lembur" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tarif_makan_lembur_per_hari" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "uang_lembur" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "uang_makan_lembur" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "uang_makan" ADD COLUMN     "jumlah_hari_dibayar" INTEGER NOT NULL DEFAULT 0;

