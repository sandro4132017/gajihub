-- Hari berstatus "Tugas Belajar" pada periode tersebut.
--
-- BUKAN untuk uang makan (pegawai tugas belajar tidak berhak) - ini PENANDA
-- bahwa Tunjangan Kinerja periode itu dibayar 80% sesuai Permenaker 15/2024:
-- "Pelaksana yang melaksanakan tugas belajar menerima 80% (delapan puluh
-- persen) dari Tunjangan Kinerja di kelas jabatan semula setiap bulan sejak
-- yang bersangkutan melaksanakan tugas belajar."
--
-- Non-destruktif: satu ADD COLUMN dengan DEFAULT 0, jadi seluruh baris yang
-- sudah ada bernilai 0 (= bukan tugas belajar) dan tidak ada kalkulasi lama
-- yang berubah nilainya.
ALTER TABLE "rekap_presensi_periode"
  ADD COLUMN "jumlah_hari_tugas_belajar" INTEGER NOT NULL DEFAULT 0;
