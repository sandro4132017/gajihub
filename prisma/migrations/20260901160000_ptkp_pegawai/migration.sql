-- Data PTKP/PPh 21 pada tabel pegawai.
--
-- Ketiganya NULLABLE tanpa default: baris yang sudah ada tetap sah dan tidak
-- disentuh. Nilainya terisi pada `npm run sync:pegawai` berikutnya. Sampai itu
-- dijalankan, PTKP setiap pegawai tampil sebagai "belum diketahui" - bukan
-- sebagai TK/0, karena menebaknya menempatkan orangnya di kategori tarif yang
-- belum tentu benar.
--
-- Tidak ada index: ketiga kolom ini dibaca per pegawai lewat primary key,
-- tidak pernah jadi kriteria pencarian.
ALTER TABLE "pegawai" ADD COLUMN "status_kawin" TEXT;
ALTER TABLE "pegawai" ADD COLUMN "jenis_kelamin" TEXT;
ALTER TABLE "pegawai" ADD COLUMN "jumlah_anak_tanggungan" INTEGER;
