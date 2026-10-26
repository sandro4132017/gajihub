---
name: feature-pipeline
description: Alur kerja bertahap untuk fitur baru atau perubahan yang menyentuh lebih dari satu file di Gajihub - rencana, implementasi, review, catat - dengan persetujuan user di setiap gerbang.
---

# Feature pipeline

Urutan: **rencana → implementasi → review → catat**.
Setiap tahap dikerjakan satu agent, lalu BERHENTI dan tunggu user bilang "oke".

## 1. Rencana
- Panggil agent `planner` dengan permintaan user.
- Tampilkan rencananya ke user.
- **Gerbang**: tunggu persetujuan. Kalau user minta ubah, kirim balik ke `planner`.
- Kalau rencana menyentuh skema DB, ikuti juga skill `prisma-migration`.

## 2. Implementasi
- Panggil agent `implementer` dengan rencana yang sudah disetujui.
- Tampilkan ringkasan perubahan dan output `node tools/verify.mjs`.
- **Gerbang**: tunggu persetujuan untuk lanjut ke review.

## 3. Review
- Panggil agent `reviewer` (agent terpisah, bukan implementer).
- Kalau status PERLU PERBAIKAN: kirim temuan [wajib] ke `implementer`, lalu review ulang. Maksimal 3 putaran, setelah itu laporkan ke user.
- **Gerbang**: tampilkan laporan review, tunggu user bilang oke. User tetap membaca diff-nya sendiri.

## 4. Catat
- Panggil agent `archivist`.
- Jangan commit atau push kecuali user minta.

## Patokan selesai
Bukan klaim agent, tapi semua ini benar:
- `node tools/verify.mjs` lulus (typecheck, test, cek data sensitif)
- reviewer berstatus LULUS
- user sudah menyetujui
