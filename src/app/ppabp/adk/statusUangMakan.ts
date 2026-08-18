/**
 * Status harian yang BERHAK uang makan (SBM 2026 item 22.1).
 *
 * Sengaja satu daftar dipakai bareng route export dan panel peringatan di
 * halaman /ppabp/adk - kalau keduanya punya daftar sendiri, panel bisa
 * mengatakan "semua cocok" untuk file yang isinya lain.
 *
 * "HADIR" & "TERLAMBAT" ikut karena itu nilai lama sebelum enum dipecah jadi
 * WFO/WFH/WFA (lihat komentar StatusKehadiran di schema.prisma) - data lama
 * yang belum disinkronkan ulang masih memakainya.
 *
 * DIKLAT & DINAS_LUAR TIDAK ikut: konsumsinya sudah ditanggung kegiatan /
 * perjalanan dinas. TODO(confirm) - file ADK asli Juni 2026 justru MEMBAYAR
 * 4 hari Dinas Luar (Adipa Rizky Putra 17-19 Juni, Yudi Apriyanto 17 Juni).
 * Belum diubah karena bertentangan dengan aturan yang user tetapkan sendiri,
 * dan 4 hari dari 2.097 baris bisa saja kekeliruan operator. Perlu ditanyakan
 * sebelum salah satunya diikuti.
 */
export const STATUS_BERHAK_UANG_MAKAN = ["WFO", "WFH", "WFA", "HADIR", "TERLAMBAT"] as const;
