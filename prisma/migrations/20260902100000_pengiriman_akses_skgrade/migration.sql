-- Tiga tabel baru untuk revisi 2026-09-02. Tidak ada kolom lama yang diubah
-- dan tidak ada data lama yang disentuh - seluruhnya CREATE TABLE.
--
-- approval_log SENGAJA DIBIARKAN UTUH. Isinya jejak audit periode yang sudah
-- lewat, dan alur Banding/SK KGB/SK Hukuman Disiplin masih memakainya.

-- ---------------------------------------------------------------------------
-- PENGIRIMAN UNIT - satu baris per (satuan kerja, periode)
-- ---------------------------------------------------------------------------
CREATE TABLE "pengiriman_unit" (
    "id" TEXT NOT NULL,
    "satuan_kerja" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TERKIRIM',
    "jumlah_pegawai" INTEGER NOT NULL,
    "jumlah_kalkulasi" INTEGER NOT NULL,
    "catatan_pengirim" TEXT,
    "dikirim_oleh_id" TEXT NOT NULL,
    "dikirim_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alasan_kembali" TEXT,
    "dikembalikan_oleh_id" TEXT,
    "dikembalikan_pada" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pengiriman_unit_pkey" PRIMARY KEY ("id")
);

-- Inilah yang membuat "satu unit, satu periode, satu pengiriman" jadi jaminan
-- database, bukan sekadar disiplin kode. Dua Kasubag TU yang menekan Kirim
-- bersamaan akan menghasilkan satu baris, bukan dua.
CREATE UNIQUE INDEX "pengiriman_unit_satuan_kerja_periode_bulan_periode_tahun_key"
    ON "pengiriman_unit"("satuan_kerja", "periode_bulan", "periode_tahun");

CREATE INDEX "pengiriman_unit_periode_bulan_periode_tahun_idx"
    ON "pengiriman_unit"("periode_bulan", "periode_tahun");
CREATE INDEX "pengiriman_unit_status_idx" ON "pengiriman_unit"("status");

ALTER TABLE "pengiriman_unit" ADD CONSTRAINT "pengiriman_unit_dikirim_oleh_id_fkey"
    FOREIGN KEY ("dikirim_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pengiriman_unit" ADD CONSTRAINT "pengiriman_unit_dikembalikan_oleh_id_fkey"
    FOREIGN KEY ("dikembalikan_oleh_id") REFERENCES "app_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- AKSES SATKER TAMBAHAN - hibah akses BACA lintas unit
-- ---------------------------------------------------------------------------
CREATE TABLE "akses_satker_tambahan" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "satuan_kerja" TEXT NOT NULL,
    "alasan" TEXT NOT NULL,
    "berlaku_sampai" TIMESTAMP(3),
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "diberikan_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "akses_satker_tambahan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "akses_satker_tambahan_user_id_satuan_kerja_key"
    ON "akses_satker_tambahan"("user_id", "satuan_kerja");
CREATE INDEX "akses_satker_tambahan_user_id_idx" ON "akses_satker_tambahan"("user_id");
CREATE INDEX "akses_satker_tambahan_satuan_kerja_idx" ON "akses_satker_tambahan"("satuan_kerja");

ALTER TABLE "akses_satker_tambahan" ADD CONSTRAINT "akses_satker_tambahan_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "akses_satker_tambahan" ADD CONSTRAINT "akses_satker_tambahan_diberikan_oleh_id_fkey"
    FOREIGN KEY ("diberikan_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- SK GRADE - sumber kolom "Nomor SK" & "Kode Grade" di ADK Tunjangan Kinerja
-- ---------------------------------------------------------------------------
CREATE TABLE "sk_grade" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "nomor_sk" TEXT NOT NULL,
    "tanggal_sk" TIMESTAMP(3) NOT NULL,
    "tmt_berlaku" TIMESTAMP(3) NOT NULL,
    "kelas_jabatan" INTEGER NOT NULL,
    "keterangan" TEXT,
    "dicatat_oleh_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sk_grade_pkey" PRIMARY KEY ("id")
);

-- Satu nomor SK tidak boleh dicatat dua kali untuk orang yang sama - itu
-- bentuk paling umum dari salah entri berulang.
CREATE UNIQUE INDEX "sk_grade_pegawai_id_nomor_sk_key" ON "sk_grade"("pegawai_id", "nomor_sk");

-- Menopang pertanyaan yang dipakai tiap export ADK: "SK mana yang berlaku
-- untuk pegawai ini pada periode itu" - urut tmt_berlaku menurun, ambil satu.
CREATE INDEX "sk_grade_pegawai_id_tmt_berlaku_idx" ON "sk_grade"("pegawai_id", "tmt_berlaku");

ALTER TABLE "sk_grade" ADD CONSTRAINT "sk_grade_pegawai_id_fkey"
    FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sk_grade" ADD CONSTRAINT "sk_grade_dicatat_oleh_id_fkey"
    FOREIGN KEY ("dicatat_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
