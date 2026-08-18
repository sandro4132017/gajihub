-- Penanda "SK belum terbit" untuk SK Hukuman Disiplin.
--
-- KEADAAN NYATA, BUKAN SEKADAR PENANDA DATA UJI: keputusan hukuman disiplin
-- diproses pimpinan, dan nomor SK-nya terbit BELAKANGAN. Sementara itu unit
-- sudah perlu mencatat orangnya supaya tukin periode berjalan tidak terlanjur
-- dibayar dengan kelas jabatan lama.
--
-- KENAPA KOLOM SENDIRI, bukan menulis "(belum terbit)" di nomor_sk:
--   - Bisa DI-QUERY. Pertanyaan yang wajib bisa dijawab sebelum go-live -
--     "SK mana saja yang sudah memotong tukin padahal nomornya belum ada?" -
--     tidak bisa dijawab dari teks bebas tanpa menebak pola penulisannya.
--   - Teks bebas ikut tercetak apa adanya ke daftar & laporan. Satu baris
--     bertuliskan "(belum terbit)" di kolom Nomor SK gampang terbaca sebagai
--     nomor yang sebenarnya.
--   - Penulisannya pasti tidak seragam antar orang ("belum ada", "-", "TBD"),
--     jadi tidak bisa dihitung.
--
-- nomor_sk jadi NULLABLE: kalau SK-nya memang belum terbit, tidak ada nomor
-- yang bisa diisi, dan memaksa mengarang sesuatu di situ justru menghasilkan
-- data yang kelihatan resmi. Non-destruktif - semua baris yang ada sudah
-- terisi.
ALTER TABLE "sk_hukuman_disiplin"
  ADD COLUMN IF NOT EXISTS "sk_belum_terbit" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sk_hukuman_disiplin"
  ALTER COLUMN "nomor_sk" DROP NOT NULL;
