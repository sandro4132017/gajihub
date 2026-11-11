-- Bukti koreksi jam presensi dipisah per sisi (Pasal 10 ayat (2) Permenaker
-- 15/2024). "bukti_ref" tetap ada dan kini berarti bukti absen MASUK.
--   bukti_ref_keluar : bukti absen pulang
--   bukti_ref_lembur : bukti opsional dari jalur koreksi lembur (SPL)
-- Additive, nullable, tanpa backfill.
ALTER TABLE "koreksi_presensi_harian" ADD COLUMN "bukti_ref_keluar" TEXT;
ALTER TABLE "koreksi_presensi_harian" ADD COLUMN "bukti_ref_lembur" TEXT;
