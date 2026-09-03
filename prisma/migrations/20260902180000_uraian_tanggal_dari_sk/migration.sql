-- Keterangan pelengkap SK penetapan kelas jabatan: uraian, tanggal terbit,
-- dan instansi penerbitnya. Diisi petugas lewat halaman Data Pegawai.
--
-- SEMUANYA NULLABLE. 5.302 pegawai sudah ada di tabel ini dan tidak satu pun
-- punya isinya; NOT NULL berarti mengarang nilai untuk semuanya, dan ini
-- kolom yang menerangkan dasar hukum pembayaran - persis yang tidak boleh
-- ditebak.
--
-- `tanggal_sk` TERPISAH dari `tmt_sk_terakhir` yang sudah ada, dan itu
-- disengaja: yang satu tanggal SK diterbitkan, yang lain tanggal mulai
-- berlakunya. SK bertanggal 3 Juli bisa berlaku surut sejak 1 Juni.
--
-- Tanpa index: ketiganya dibaca bersama barisnya sendiri, tidak pernah jadi
-- syarat pencarian.
ALTER TABLE "pegawai" ADD COLUMN "uraian_sk" TEXT;
ALTER TABLE "pegawai" ADD COLUMN "tanggal_sk" TIMESTAMP(3);
ALTER TABLE "pegawai" ADD COLUMN "sk_dari" TEXT;
