-- Jumlah HARI lembur hari kerja per periode.
--
-- Dibutuhkan pengali jam pertama (1,5x) yang berlaku PER HARI: uang lembur
-- sebulan = tarif x (2J - 0,5D), J total jam dan D jumlah hari. Tanpa D,
-- potongan setengah tarif cuma jatuh sekali sebulan dan pegawai dibayar lebih
-- rendah dari semestinya.
--
-- NON-DESTRUKTIF: satu ADD COLUMN dengan DEFAULT 0, tidak menyentuh kolom
-- maupun baris yang sudah ada. Baris lama bernilai 0, yang artinya "belum
-- diketahui" - mesin uang menolak memakai pengali untuk nilai itu dan menulis
-- anomali, bukan menebak.
ALTER TABLE "rekap_presensi_periode"
  ADD COLUMN "jumlah_hari_lembur_hari_kerja" INTEGER NOT NULL DEFAULT 0;
