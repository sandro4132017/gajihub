-- Versi sesi akun: token sesi yang versinya beda ditolak (logout, "Putus semua
-- sesi" oleh Admin, akun dinonaktifkan). Baris lama otomatis versi 0, sehingga
-- tidak ada data yang diubah; semua token lama toh ditolak karena formatnya.
-- AddColumn (tabel app_user = model User)
ALTER TABLE "app_user" ADD COLUMN "sesi_versi" INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN "app_user"."sesi_versi" IS 'Versi sesi akun; dinaikkan saat logout / sesi diputus Admin / akun dinonaktifkan. Token dengan versi beda ditolak.';
