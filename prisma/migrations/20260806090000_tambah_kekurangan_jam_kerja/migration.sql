-- Kekurangan jam kerja terhadap kewajiban jam kerja, dalam MENIT.
-- Potongan Pasal 13 ayat (3), tarif sama dengan terlambat/pulang cepat
-- (0,01% per menit dari bobot kehadiran).
--
-- Non-destruktif: satu ADD COLUMN dengan DEFAULT 0, jadi seluruh baris yang
-- sudah ada otomatis bernilai 0 dan tidak ada kalkulasi lama yang berubah.
--
-- PERHATIAN: kolom ini TIDAK diisi oleh jalur otomatis manapun (upload PDF
-- e-Presensi maupun tarikan database e-Presensi) karena keduanya sudah
-- menghitung keterlambatan & pulang cepat per hari - dan kekurangan jam kerja
-- adalah AKIBAT dari keduanya. Mengisinya dari sumber yang sama akan memotong
-- menit yang sama dua kali.
ALTER TABLE "rekap_presensi_periode"
  ADD COLUMN "total_menit_kekurangan_jam_kerja" INTEGER NOT NULL DEFAULT 0;
