-- Pengecualian pegawai per periode. Lihat alasannya di
-- src/business-logic/pengecualianPegawai.ts.
--
-- Tabel sendiri, BUKAN kolom di "pegawai": sinkronisasi SIAP menulis ulang
-- seluruh baris pegawai tiap kali dijalankan (termasuk memaksa status_pegawai
-- kembali 'AKTIF'), jadi penandaan apa pun di tabel itu tidak akan bertahan.
CREATE TABLE "pengecualian_pegawai" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "alasan_kode" TEXT NOT NULL,
    "penjelasan" TEXT,
    "ditandai_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pengecualian_pegawai_pkey" PRIMARY KEY ("id")
);

-- Satu pegawai satu baris per periode. Menandai ulang menimpa, bukan menumpuk -
-- tanpa ini "berapa orang dikecualikan" bisa lebih besar dari jumlah orangnya.
CREATE UNIQUE INDEX "pengecualian_pegawai_pegawai_id_periode_bulan_periode_tahun_key"
    ON "pengecualian_pegawai"("pegawai_id", "periode_bulan", "periode_tahun");

-- Menopang pertanyaan yang dipakai tiap kali halaman kalkulasi dibuka:
-- "siapa saja yang dikecualikan pada periode ini".
CREATE INDEX "pengecualian_pegawai_periode_bulan_periode_tahun_idx"
    ON "pengecualian_pegawai"("periode_bulan", "periode_tahun");

ALTER TABLE "pengecualian_pegawai" ADD CONSTRAINT "pengecualian_pegawai_pegawai_id_fkey"
    FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pengecualian_pegawai" ADD CONSTRAINT "pengecualian_pegawai_ditandai_oleh_id_fkey"
    FOREIGN KEY ("ditandai_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
