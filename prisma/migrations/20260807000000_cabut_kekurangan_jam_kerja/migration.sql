-- Mencabut kolom "kekurangan jam kerja" dari rekap presensi.
--
-- Kolom ini ditambahkan 2026-08-06 (migrasi 20260806090000) sebagai
-- pelanggaran KEEMPAT bertarif 0,01%/menit di Pasal 13 ayat (3). Setelah teks
-- pasalnya dibaca langsung, itu keliru: ayat (3) menyebut TEPAT TIGA hal -
-- "terlambat hadir, pulang cepat, atau meninggalkan kantor" - dan Pasal 12
-- huruf c yang dirujuknya menyebut tiga hal yang sama. Kekurangan jam kerja
-- tidak ada di keduanya.
--
-- AMAN DIJALANKAN: saat migrasi ini dibuat, 0 dari 40.740 baris
-- rekap_presensi_periode punya nilai bukan 0 di kolom ini - tidak ada jalur
-- otomatis yang pernah mengisinya, dan template manualnya pun jarang dipakai.
-- Jadi tidak ada angka tersimpan yang hilang dan tidak ada kalkulasi yang
-- berubah hasilnya.
--
-- Sebelum menjalankan di server lain, pastikan dulu di sana juga kosong:
--   SELECT COUNT(*) FROM rekap_presensi_periode
--    WHERE total_menit_kekurangan_jam_kerja <> 0;
ALTER TABLE "rekap_presensi_periode"
  DROP COLUMN IF EXISTS "total_menit_kekurangan_jam_kerja";
