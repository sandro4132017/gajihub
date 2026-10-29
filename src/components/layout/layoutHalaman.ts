/**
 * Kelas pembungkus <main> untuk SELURUH halaman.
 *
 * Sebelum ini tiap halaman menulis kelasnya sendiri, dan hasilnya melebar
 * sendiri-sendiri: max-w-3xl, 4xl, 5xl, 6xl, 7xl, sampai max-w-[1600px] -
 * bahkan dua cabang di dalam SATU halaman bisa berbeda. Yang terlihat oleh
 * pemakai: lebar isi berubah-ubah tiap kali berpindah menu, seolah tiap
 * halaman aplikasi yang berbeda.
 *
 * Acuannya halaman Predikat Kinerja (permintaan user 2026-09-06).
 *
 * Tabel yang lebih lebar dari ini TIDAK melebarkan halaman - dia menggeser di
 * dalam pembungkusnya sendiri (`overflow-x-auto`), sesuai konvensi yang sudah
 * dipakai di seluruh tabel. Halaman yang melebar mengikuti tabel terlebarnya
 * membuat sidebar dan judul ikut bergeser, dan itu jauh lebih mengganggu
 * daripada menggeser tabelnya saja.
 */
export const HALAMAN = "mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8";
