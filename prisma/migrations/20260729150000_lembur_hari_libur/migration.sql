-- AlterTable
ALTER TABLE "rekap_presensi_periode" ADD COLUMN     "jumlah_hari_makan_lembur_hari_libur" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_jam_lembur_hari_libur" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "uang_lembur" ADD COLUMN     "jam_lembur_hari_kerja" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "jam_lembur_hari_libur" DOUBLE PRECISION NOT NULL DEFAULT 0;

