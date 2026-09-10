-- Banding atas DATA SUMBER, bukan cuma atas angka kalkulasi.
--
-- Dua kolom, keduanya NULLABLE dan tanpa DEFAULT: baris banding yang sudah ada
-- tidak disentuh sama sekali, dan tidak ada tabel yang ditulis ulang.
--
-- `bagian_data`      - bagian mana yang dipersoalkan (dipilih dari daftar
--                      tertutup per jenis banding, lihat bandingData.ts).
-- `usulan_perbaikan` - nilai yang menurut pegawai seharusnya tercatat.
--                      USULAN. Tidak pernah menulis ke data mana pun.
ALTER TABLE "banding" ADD COLUMN "bagian_data" TEXT;
ALTER TABLE "banding" ADD COLUMN "usulan_perbaikan" TEXT;
