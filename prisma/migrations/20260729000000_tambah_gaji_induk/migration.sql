-- CreateTable
CREATE TABLE "gaji_induk" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "kode_satker" TEXT,
    "nomor_gaji" TEXT,
    "jenis_gaji" TEXT NOT NULL DEFAULT '1',
    "gaji_pokok" DOUBLE PRECISION NOT NULL,
    "tunjangan_istri" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_anak" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_umum" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_struktural" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_fungsional" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_beras" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_pph" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pembulatan" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tunjangan_lain" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "potongan_iuran_pegawai" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "potongan_pph" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "potongan_bpjs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "potongan_lain" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_penghasilan" DOUBLE PRECISION NOT NULL,
    "total_potongan" DOUBLE PRECISION NOT NULL,
    "gaji_bersih" DOUBLE PRECISION NOT NULL,
    "honorarium" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source_file_name" TEXT,
    "diunggah_oleh_id" TEXT NOT NULL,
    "diunggah_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gaji_induk_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gaji_induk_periode_bulan_periode_tahun_idx" ON "gaji_induk"("periode_bulan", "periode_tahun");

-- CreateIndex
CREATE UNIQUE INDEX "gaji_induk_pegawai_id_periode_bulan_periode_tahun_key" ON "gaji_induk"("pegawai_id", "periode_bulan", "periode_tahun");

-- AddForeignKey
ALTER TABLE "gaji_induk" ADD CONSTRAINT "gaji_induk_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gaji_induk" ADD CONSTRAINT "gaji_induk_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

