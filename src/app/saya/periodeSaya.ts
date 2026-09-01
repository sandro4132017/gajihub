export interface PeriodeSaya {
  bulan: number;
  tahun: number;
}

/**
 * Kunci periode untuk value <option> dan pembanding - "2026-08".
 *
 * Bulan dipadding nol supaya kuncinya bisa diurutkan sebagai teks kalau
 * suatu saat perlu ("2026-09" < "2026-10", sementara "2026-9" > "2026-10").
 */
export function kunciPeriode(p: PeriodeSaya): string {
  return `${p.tahun}-${String(p.bulan).padStart(2, "0")}`;
}

/**
 * Periode yang dipilih dari `?periode=`, dibatasi ke yang BENAR-BENAR ada
 * datanya.
 *
 * Nilai tak dikenal jatuh ke periode pertama dalam daftar (pemanggil
 * mengurutkan terbaru dulu), bukan dilempar sebagai galat - query string
 * datang dari URL, jadi bisa berisi tautan lama, salah ketik, atau isengan.
 *
 * Yang TIDAK dilakukan: menerima bulan/tahun sembarang lalu menampilkan
 * halaman kosong. Periode tanpa data terbaca sebagai "presensi saya hilang",
 * dan itu kepanikan yang tidak perlu di halaman soal gaji. Kalau daftarnya
 * memang kosong, hasilnya null dan pemanggil menjelaskan kenapa.
 */
export function pilihPeriode(nilai: string | undefined, tersedia: PeriodeSaya[]): PeriodeSaya | null {
  if (tersedia.length === 0) return null;
  return tersedia.find((p) => kunciPeriode(p) === nilai) ?? tersedia[0];
}
