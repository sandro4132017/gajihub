-- Rating Hasil Kerja & Rating Perilaku Kerja dari file Rekap Penilaian
-- e-Kinerja BKN. Sebelumnya kedua kolom itu dibaca parser lalu dibuang karena
-- tidak ada tempat menyimpannya.
--
-- TIDAK dipakai menghitung tukin - yang menentukan cuma predikat akhir
-- (Kepsekjen 82/2025). Murni informasi, supaya rincian di aplikasi sebanding
-- dengan rekap Excel manual yang menampilkan keduanya.
--
-- Non-destruktif: dua kolom nullable, baris lama tetap NULL (= tidak diketahui,
-- bukan kosong) dan tidak ada nilai kalkulasi yang berubah.
ALTER TABLE "predikat_kinerja"
  ADD COLUMN "hasil_kerja" TEXT,
  ADD COLUMN "perilaku_kerja" TEXT;
