-- CreateTable
CREATE TABLE "pegawai" (
    "id" TEXT NOT NULL,
    "nip" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "unit_kerja" TEXT NOT NULL,
    "satuan_kerja" TEXT NOT NULL,
    "status_pegawai" TEXT NOT NULL,
    "jabatan" TEXT,
    "golongan" TEXT,
    "tmt_sk_terakhir" TIMESTAMP(3),
    "source_system" TEXT NOT NULL DEFAULT 'SIAP',
    "source_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pegawai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presensi_harian" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "jam_masuk" TIMESTAMP(3),
    "jam_keluar" TIMESTAMP(3),
    "status_kehadiran" TEXT NOT NULL,
    "menit_terlambat" INTEGER NOT NULL DEFAULT 0,
    "source_system" TEXT NOT NULL DEFAULT 'e-Presensi',
    "source_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "presensi_harian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "predikat_kinerja" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "predikat" TEXT NOT NULL,
    "nilai_angka" DOUBLE PRECISION NOT NULL,
    "source_system" TEXT NOT NULL DEFAULT 'e-Kinerja BKN',
    "source_synced_at" TIMESTAMP(3) NOT NULL,
    "input_method" TEXT NOT NULL DEFAULT 'MANUAL_UPLOAD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "predikat_kinerja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tukin_calculation" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "komponen_kehadiran" DOUBLE PRECISION NOT NULL,
    "komponen_kinerja" DOUBLE PRECISION NOT NULL,
    "tukin_pokok" DOUBLE PRECISION NOT NULL,
    "potongan_pph" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tukin_bersih" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "catatan_anomali" TEXT,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "approved_by" TEXT,

    CONSTRAINT "tukin_calculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uang_makan" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "jumlah_hari_kerja" INTEGER NOT NULL,
    "jumlah_hari_hadir" INTEGER NOT NULL,
    "tarif_harian" DOUBLE PRECISION NOT NULL,
    "total_uang_makan" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uang_makan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uang_lembur" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "total_jam_lembur" DOUBLE PRECISION NOT NULL,
    "tarif_per_jam" DOUBLE PRECISION NOT NULL,
    "total_uang_lembur" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uang_lembur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_log" (
    "id" TEXT NOT NULL,
    "referensi_tipe" TEXT NOT NULL,
    "referensi_id" TEXT NOT NULL,
    "approver_nip" TEXT NOT NULL,
    "approver_nama" TEXT NOT NULL,
    "approver_jabatan" TEXT NOT NULL,
    "jenjang" INTEGER NOT NULL,
    "keputusan" TEXT NOT NULL,
    "catatan" TEXT,
    "timestamp_aksi" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_trail" (
    "id" TEXT NOT NULL,
    "entitas" TEXT NOT NULL,
    "entitas_id" TEXT NOT NULL,
    "aksi" TEXT NOT NULL,
    "aktor" TEXT NOT NULL,
    "data_sebelum" JSONB,
    "data_sesudah" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_status" (
    "id" TEXT NOT NULL,
    "pegawai_id" TEXT NOT NULL,
    "periode_bulan" INTEGER NOT NULL,
    "periode_tahun" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "detail_selisih" JSONB,
    "window_verifikasi_berakhir" TIMESTAMP(3),
    "keputusan_akhir" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pegawai_nip_key" ON "pegawai"("nip");

-- CreateIndex
CREATE INDEX "pegawai_satuan_kerja_idx" ON "pegawai"("satuan_kerja");

-- CreateIndex
CREATE INDEX "pegawai_status_pegawai_idx" ON "pegawai"("status_pegawai");

-- CreateIndex
CREATE INDEX "presensi_harian_tanggal_idx" ON "presensi_harian"("tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "presensi_harian_pegawai_id_tanggal_key" ON "presensi_harian"("pegawai_id", "tanggal");

-- CreateIndex
CREATE UNIQUE INDEX "predikat_kinerja_pegawai_id_periode_bulan_periode_tahun_key" ON "predikat_kinerja"("pegawai_id", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE INDEX "tukin_calculation_status_idx" ON "tukin_calculation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "tukin_calculation_pegawai_id_periode_bulan_periode_tahun_key" ON "tukin_calculation"("pegawai_id", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE UNIQUE INDEX "uang_makan_pegawai_id_periode_bulan_periode_tahun_key" ON "uang_makan"("pegawai_id", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE UNIQUE INDEX "uang_lembur_pegawai_id_periode_bulan_periode_tahun_key" ON "uang_lembur"("pegawai_id", "periode_bulan", "periode_tahun");

-- CreateIndex
CREATE INDEX "approval_log_referensi_tipe_referensi_id_idx" ON "approval_log"("referensi_tipe", "referensi_id");

-- CreateIndex
CREATE INDEX "audit_trail_entitas_entitas_id_idx" ON "audit_trail"("entitas", "entitas_id");

-- CreateIndex
CREATE INDEX "audit_trail_timestamp_idx" ON "audit_trail"("timestamp");

-- CreateIndex
CREATE INDEX "reconciliation_status_status_idx" ON "reconciliation_status"("status");

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_status_pegawai_id_periode_bulan_periode_tahu_key" ON "reconciliation_status"("pegawai_id", "periode_bulan", "periode_tahun");

-- AddForeignKey
ALTER TABLE "presensi_harian" ADD CONSTRAINT "presensi_harian_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "predikat_kinerja" ADD CONSTRAINT "predikat_kinerja_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tukin_calculation" ADD CONSTRAINT "tukin_calculation_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uang_makan" ADD CONSTRAINT "uang_makan_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uang_lembur" ADD CONSTRAINT "uang_lembur_pegawai_id_fkey" FOREIGN KEY ("pegawai_id") REFERENCES "pegawai"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
