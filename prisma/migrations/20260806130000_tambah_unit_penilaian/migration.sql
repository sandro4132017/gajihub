-- Unit PENILAI dari kepala file Rekap Penilaian e-Kinerja BKN (mis.
-- "Subbagian Tata Usaha"). Satu satuan kerja bisa dinilai oleh beberapa
-- penilai yang masing-masing mengekspor filenya sendiri berisi orang berbeda -
-- kolom ini membuat "sumber penilaian mana saja yang sudah masuk" bisa dilihat.
--
-- BUKAN Pegawai.satuan_kerja, dan TIDAK BOLEH dipakai untuk scoping
-- kewenangan - lihat komentar model PredikatKinerja.
--
-- Non-destruktif: satu kolom nullable. Baris lama tetap NULL, yang artinya
-- "sumbernya tidak tercatat" - bukan salah, cuma diupload sebelum kolom ini ada.
ALTER TABLE "predikat_kinerja"
  ADD COLUMN "unit_penilaian" TEXT;
