---
name: data-job
description: Membuat atau mengubah job sinkronisasi dan batch di src/jobs/ (import pegawai SIAP, presensi e-Presensi, cek TTE SPTJM, hash dokumen TTE), termasuk script npm-nya.
---

# Data job

Job di `src/jobs/` dijalankan lewat `tsx` (lihat script `sync:*`, `cek:tte`, `isi:hash-tte` di package.json).
Job menyentuh data pegawai sungguhan, jadi wajib hati-hati.

## Pola wajib
- **Pisahkan logika murni dari I/O.** Fungsi transformasi/validasi (mapping kolom MSSQL → model Prisma, parsing Excel, hitung hash) diletakkan di fungsi terpisah yang bisa di-test Vitest tanpa database.
- **Idempoten.** Menjalankan job dua kali tidak boleh menggandakan data. Pakai `upsert` dengan kunci unik (misal NIP + periode).
- **Mode `--dry-run`.** Job baru harus mendukung flag ini: baca sumber, hitung perubahan, cetak ringkasan (jumlah baru/diubah/dilewati), tanpa menulis ke DB.
- **Batch + transaksi.** Tulis per batch (misal 500 baris) dalam `prisma.$transaction`.
- **Log aman.** Log jumlah dan ID internal saja. Jangan log NIP, NIK, nama, gaji, atau rekening. Untuk referensi baris, samarkan (misal `NIP ****1234`).
- **MSSQL.** Query wajib parameterized (`request.input(...)`), tutup pool di `finally`.
- Kalau menambah job baru, tambahkan juga script `pre<nama>: prisma generate` di package.json mengikuti pola yang ada.

## Verifikasi
1. Test Vitest untuk fungsi transformasi pakai data palsu.
2. `node tools/verify.mjs` lulus.
3. **Gerbang**: AI hanya boleh menjalankan job dengan `--dry-run`. Menjalankan job sungguhan dilakukan user sendiri.
