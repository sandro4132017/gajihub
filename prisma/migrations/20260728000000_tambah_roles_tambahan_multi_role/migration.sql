-- Role TAMBAHAN per akun, buat kemudahan TESTING (satu akun bisa ganti-ganti
-- sudut pandang role lewat menu "Ganti role" di tombol akun) - lihat komentar
-- panjang di model User (prisma/schema.prisma) soal batasan & TODO(confirm)
-- production-nya.
--
-- Kolom array TANPA DEFAULT eksplisit: Prisma memperlakukan scalar list yang
-- belum pernah diisi sebagai array kosong, dan baris lama otomatis dapat '{}'
-- (bukan NULL) karena Postgres mengisi kolom array baru dengan empty array
-- untuk baris yang sudah ada. Jadi semua akun lama tetap single-role persis
-- seperti sebelumnya - tidak ada perubahan perilaku sampai Admin benar-benar
-- menambahkan role tambahan lewat halaman "Kelola Assignment Role".

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "roles_tambahan" "Role"[];
