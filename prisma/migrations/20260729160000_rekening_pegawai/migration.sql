-- CreateTable
CREATE TABLE "rekening_pegawai" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "jenis_pembayaran" TEXT NOT NULL,
    "kode_bank_span" TEXT NOT NULL,
    "nama_bank" TEXT NOT NULL,
    "nomor_rekening" TEXT NOT NULL,
    "nama_rekening" TEXT,
    "source_file_name" TEXT,
    "diunggah_oleh_id" TEXT NOT NULL,
    "diunggah_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rekening_pegawai_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rekening_pegawai_jenis_pembayaran_kode_bank_span_idx" ON "rekening_pegawai"("jenis_pembayaran", "kode_bank_span");

-- CreateIndex
CREATE UNIQUE INDEX "rekening_pegawai_pegawai_id_jenis_pembayaran_key" ON "rekening_pegawai"("pegawai_id", "jenis_pembayaran");

-- AddForeignKey
ALTER TABLE "rekening_pegawai" ADD CONSTRAINT "rekening_pegawai_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekening_pegawai" ADD CONSTRAINT "rekening_pegawai_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

