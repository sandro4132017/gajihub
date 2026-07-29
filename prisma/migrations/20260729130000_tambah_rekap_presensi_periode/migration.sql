-- CreateTable
CREATE TABLE "rekap_presensi_periode" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "jumlah_hari_alpha" INTEGER NOT NULL DEFAULT 0,
    "jumlah_tidak_presensi" INTEGER NOT NULL DEFAULT 0,
    "total_menit_terlambat" INTEGER NOT NULL DEFAULT 0,
    "total_menit_pulang_cepat" INTEGER NOT NULL DEFAULT 0,
    "total_menit_meninggalkan_kantor" INTEGER NOT NULL DEFAULT 0,
    "jumlah_tidak_ikut_upacara" INTEGER NOT NULL DEFAULT 0,
    "jumlah_hari_kerja" INTEGER NOT NULL DEFAULT 0,
    "jumlah_hari_hadir" INTEGER NOT NULL DEFAULT 0,
    "source_system" TEXT NOT NULL DEFAULT 'UPLOAD_MANUAL',
    "source_file_name" TEXT,
    "diunggah_oleh_id" TEXT NOT NULL,
    "diunggah_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rekap_presensi_periode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rekap_presensi_periode_periode_bulan_periode_tahun_idx" ON "rekap_presensi_periode"("periode_bulan", "periode_tahun");

-- CreateIndex
CREATE UNIQUE INDEX "rekap_presensi_periode_pegawai_id_periode_bulan_periode_tah_key" ON "rekap_presensi_periode"("pegawai_id", "periode_bulan", "periode_tahun");

-- AddForeignKey
ALTER TABLE "rekap_presensi_periode" ADD CONSTRAINT "rekap_presensi_periode_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rekap_presensi_periode" ADD CONSTRAINT "rekap_presensi_periode_diunggah_oleh_id_fkey" FOREIGN KEY ("diunggah_oleh_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

