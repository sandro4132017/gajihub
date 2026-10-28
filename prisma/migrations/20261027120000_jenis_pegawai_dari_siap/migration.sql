-- Jenis kepegawaian dari SIAP (PEGAWAI.STATUSPEGAWAIID): CPNS / PNS / PPPK.
-- Kolom nullable, terisi pada sync:pegawai berikutnya. Tidak menyentuh data lama.
ALTER TABLE "pegawai" ADD COLUMN "jenis_pegawai" TEXT;
