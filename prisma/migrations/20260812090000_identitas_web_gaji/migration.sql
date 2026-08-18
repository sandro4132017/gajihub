-- Identitas pembayaran pegawai menurut Web Gaji Kemenkeu.
--
-- Nama pegawai di Web Gaji ditulis berbeda dari SIAP (umumnya karena gelar) -
-- terukur berbeda pada 3.628 dari 4.701 pegawai. Untuk berkas pembayaran
-- (ADK), yang berlaku adalah penulisan Web Gaji.
--
-- TABEL SENDIRI, bukan kolom di `pegawai`: kolom `pegawai.nama` ditimpa ulang
-- setiap sinkronisasi dari SIAP, jadi nilai versi Web Gaji akan hilang. Lihat
-- komentar lengkap di model IdentitasWebGaji (schema.prisma).
--
-- Non-destruktif: satu CREATE TABLE, tidak menyentuh tabel yang sudah ada.
CREATE TABLE IF NOT EXISTS "identitas_web_gaji" (
  "id"                 TEXT NOT NULL,
  "pegawai_id"         TEXT NOT NULL,
  "nama"               TEXT NOT NULL,
  "jenis_pegawai"      TEXT,
  "kode_satker"        TEXT,
  "nama_satuan_kerja"  TEXT,
  "source_file_name"   TEXT,
  "diunggah_oleh_id"   TEXT NOT NULL,
  "diunggah_pada"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "identitas_web_gaji_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "identitas_web_gaji_pegawai_id_key"
  ON "identitas_web_gaji"("pegawai_id");
CREATE INDEX IF NOT EXISTS "identitas_web_gaji_kode_satker_idx"
  ON "identitas_web_gaji"("kode_satker");

ALTER TABLE "identitas_web_gaji"
  ADD CONSTRAINT "identitas_web_gaji_pegawai_id_fkey"
  FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "identitas_web_gaji"
  ADD CONSTRAINT "identitas_web_gaji_diunggah_oleh_id_fkey"
  FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
