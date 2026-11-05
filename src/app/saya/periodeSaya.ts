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

/**
 * Bulan/tahun dari segmen URL. Hanya bulan 1-12 dan tahun 4 digit yang sah;
 * "08" terbaca 8. Selain itu null - pemanggil menjawab "alamat tidak sah",
 * bukan halaman kosong.
 */
export function periodeDariParam(bulan: string, tahun: string): PeriodeSaya | null {
  if (!/^\d{1,2}$/.test(bulan) || !/^\d{4}$/.test(tahun)) return null;
  const b = Number(bulan);
  const t = Number(tahun);
  if (b < 1 || b > 12 || t < 1000 || t > 9999) return null;
  return { bulan: b, tahun: t };
}

/**
 * Periode sebelum & sesudah. "Sesudah" null bila melewati bulan berjalan:
 * periode di masa depan belum punya data, tautannya hanya mengarah ke
 * halaman kosong. `sekarang` dioper dari pemanggil supaya fungsi ini murni.
 */
export function periodeTetangga(
  p: PeriodeSaya,
  sekarang: PeriodeSaya,
): { sebelum: PeriodeSaya; sesudah: PeriodeSaya | null } {
  const sebelum = p.bulan === 1 ? { bulan: 12, tahun: p.tahun - 1 } : { bulan: p.bulan - 1, tahun: p.tahun };
  const berikut = p.bulan === 12 ? { bulan: 1, tahun: p.tahun + 1 } : { bulan: p.bulan + 1, tahun: p.tahun };
  const lewat = berikut.tahun * 12 + berikut.bulan > sekarang.tahun * 12 + sekarang.bulan;
  return { sebelum, sesudah: lewat ? null : berikut };
}
