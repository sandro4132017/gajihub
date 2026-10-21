-- SHA-256 berkas SPTJM yang sudah ditandatangani.
--
-- ADDITIF dan NULLABLE: tidak menyentuh satu pun baris yang sudah ada, dan
-- dokumen lama tetap bisa dibaca tanpa nilainya. Pengisian untuk dokumen lama
-- dikerjakan terpisah oleh `npm run isi:hash-tte`, yang membaca berkas di
-- disk - bukan oleh migrasi ini.
ALTER TABLE "dokumen_tte" ADD COLUMN "hash_berkas" TEXT;
