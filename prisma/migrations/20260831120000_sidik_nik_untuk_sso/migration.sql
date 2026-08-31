-- Sidik NIK untuk SSO Naco.
--
-- Satu ADD COLUMN nullable + satu index unik. Non-destruktif: baris yang sudah
-- ada bernilai NULL dan berperilaku persis seperti sebelumnya (login SSO-nya
-- belum cocok, login NIP tetap jalan) sampai `npm run sync:pegawai` mengisinya.
--
-- Index UNIK-nya disengaja: di SIAP ada 2 NIK yang dipakai lebih dari satu
-- NIP, dan constraint inilah penjamin terakhir bahwa satu sidik tidak pernah
-- menunjuk dua orang - bahkan kalau suatu saat penyaring di importer dilewati.
-- NULL tidak ikut dikekang oleh UNIQUE di PostgreSQL, jadi pegawai yang
-- dilewati boleh banyak.

ALTER TABLE "pegawai" ADD COLUMN "sidik_nik" TEXT;

CREATE UNIQUE INDEX "pegawai_sidik_nik_key" ON "pegawai"("sidik_nik");
