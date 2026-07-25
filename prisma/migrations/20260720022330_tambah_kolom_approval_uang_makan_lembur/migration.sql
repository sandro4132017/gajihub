-- AlterTable
ALTER TABLE "uang_lembur" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "catatan_anomali" TEXT;

-- AlterTable
ALTER TABLE "uang_makan" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "catatan_anomali" TEXT;
