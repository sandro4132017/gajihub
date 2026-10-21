-- Gelar pegawai dari SIAP, dipisah dari kolom nama.
--
-- ADITIF dan NULLABLE: tidak ada baris yang berubah, tidak ada yang hilang.
-- Isinya baru terisi setelah `npm run sync:pegawai` dijalankan ulang.
ALTER TABLE "pegawai" ADD COLUMN "gelar_depan" TEXT;
ALTER TABLE "pegawai" ADD COLUMN "gelar_belakang" TEXT;
