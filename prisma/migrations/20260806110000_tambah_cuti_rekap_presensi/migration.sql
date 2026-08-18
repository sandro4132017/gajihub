-- Cuti pada rekap presensi periode (Pasal 14 Permenaker 15/2024).
--
-- TIGA kolom, bukan satu kolom per jenis cuti seperti rekap Excel manual yang
-- punya 12 kolom cuti. Bentuk ini yang dikonsumsi engine (`cutiAktif`), dan 12
-- kolom Excel bisa diturunkan darinya - sebaliknya tidak bisa, karena
-- "Cuti Sakit Bulan II" tidak memberi tahu berapa harinya.
--
-- Non-destruktif: dua kolom nullable + satu DEFAULT 0. Seluruh baris yang
-- sudah ada berarti "tidak sedang cuti", yang memang keadaan sebelumnya
-- (cutiAktif tidak pernah diisi jalur manapun), jadi tidak ada kalkulasi lama
-- yang berubah nilainya.
ALTER TABLE "rekap_presensi_periode"
  ADD COLUMN "jenis_cuti_aktif" TEXT,
  ADD COLUMN "bulan_cuti_keberapa" INTEGER,
  ADD COLUMN "jumlah_hari_cuti" INTEGER NOT NULL DEFAULT 0;
