-- Kunci berkas bukti kehadiran untuk koreksi jam presensi (Pasal 10 ayat (2)
-- Permenaker 15/2024). Nullable: koreksi lama tidak punya bukti, dan koreksi
-- yang hanya jam lembur boleh tanpa bukti. Tidak ada backfill.
ALTER TABLE "koreksi_presensi_harian" ADD COLUMN "bukti_ref" TEXT;
