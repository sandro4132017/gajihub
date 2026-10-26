---
name: prisma-migration
description: Cara aman mengubah skema Prisma/PostgreSQL di Gajihub - menambah atau mengubah model, kolom, relasi, atau index.
---

# Prisma migration

1. Ubah `prisma/schema.prisma`. Tunjukkan diff-nya ke user.
2. Nilai risikonya dan sebutkan ke user:
   - Menghapus atau mengganti nama kolom/tabel → **destruktif**, data bisa hilang.
   - Kolom baru `NOT NULL` di tabel berisi data → butuh `@default` atau migrasi bertahap (tambah nullable → isi → ubah jadi wajib).
   - Ubah tipe kolom (misal angka gaji) → cek pembulatan dan presisi. Untuk uang pakai `Decimal`, bukan `Float`.
3. **Gerbang**: tunggu persetujuan user.
4. Jalankan `npx prisma migrate dev --create-only --name <nama_deskriptif>`, lalu tampilkan SQL yang dihasilkan di `prisma/migrations/`.
5. **Gerbang**: user membaca SQL-nya. Baru setelah disetujui jalankan `npm run prisma:migrate` (database dev).
6. Jalankan `node tools/verify.mjs`.

Larangan:
- Jangan pernah `prisma migrate reset`, `prisma db push`, atau `migrate deploy` ke production tanpa izin eksplisit.
- Jangan mengedit file migrasi yang sudah pernah dijalankan.
