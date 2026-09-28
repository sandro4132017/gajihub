-- Daftar Perubahan Data Kepegawaian.
--
-- Satu baris per perubahan yang terdeteksi saat sinkronisasi SIAP. Polanya
-- mengikuti "Daftar Perubahan Pegawai" di Kemenkeu (sharing session BOT Gaji &
-- Tukin, 23 September 2026): perubahan data kepegawaian tidak cukup
-- disinkronkan, ia harus bisa DIPERIKSA berbarengan dengan daftar pembayaran.
--
-- Tidak ada foreign key ke pegawai - ini dokumen riwayat, dan harus tetap utuh
-- terbaca untuk periode lampau apa pun yang terjadi pada baris pegawainya.
--
-- Tidak ada unique key, dan itu DISENGAJA: satu orang bisa sah berpindah unit
-- dua kali dalam setahun, dan keduanya dua kejadian berbeda yang dua-duanya
-- harus tercatat. Yang menjaga dari baris kembar adalah pembandingnya sendiri -
-- sesudah data tersimpan, sinkronisasi berikutnya tidak melihat selisih lagi.
CREATE TABLE "perubahan_data_pegawai" (
  "id" TEXT NOT NULL,
  "nip" TEXT NOT NULL,
  "nama" TEXT NOT NULL,

  -- PEGAWAI_BARU | PINDAH_UNIT | GANTI_STATUS | KELAS_JABATAN | JABATAN
  "jenis" TEXT NOT NULL,
  "dari" TEXT,
  "ke" TEXT,

  -- PINDAH_UNIT mengisi keduanya dengan nilai BERBEDA: unit lama perlu tahu
  -- ada yang keluar dari rekapnya, unit baru perlu tahu ada yang masuk.
  "satuan_kerja_dari" TEXT,
  "satuan_kerja_ke" TEXT,

  "terdeteksi_pada" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- NULL = dijalankan lewat CLI (npm run sync:pegawai), bukan lewat tombol.
  "terdeteksi_oleh_id" TEXT,

  CONSTRAINT "perubahan_data_pegawai_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "perubahan_data_pegawai_satuan_kerja_dari_terdeteksi_pada_idx"
  ON "perubahan_data_pegawai" ("satuan_kerja_dari", "terdeteksi_pada");

CREATE INDEX "perubahan_data_pegawai_satuan_kerja_ke_terdeteksi_pada_idx"
  ON "perubahan_data_pegawai" ("satuan_kerja_ke", "terdeteksi_pada");

CREATE INDEX "perubahan_data_pegawai_nip_terdeteksi_pada_idx"
  ON "perubahan_data_pegawai" ("nip", "terdeteksi_pada");

ALTER TABLE "perubahan_data_pegawai"
  ADD CONSTRAINT "perubahan_data_pegawai_terdeteksi_oleh_id_fkey"
  FOREIGN KEY ("terdeteksi_oleh_id") REFERENCES "app_user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
