/**
 * Perbandingan satu angka periode ini terhadap periode sebelumnya, untuk
 * penanda "+8% vs bulan lalu" di kartu dashboard.
 *
 * PURE - nol I/O.
 *
 * `null` berarti **tidak ada yang bisa dibandingkan**, dan itu dibedakan
 * dengan sengaja dari "0%":
 *
 *   - Periode sebelumnya belum ada datanya (mis. periode Januari, sementara
 *     data tren cuma memuat tahun berjalan). Menampilkan "+0%" di situ
 *     berbohong: seolah bulan lalu nilainya sama, padahal tidak diketahui.
 *   - Periode sebelumnya NOL. Kenaikan dari nol bukan persentase mana pun -
 *     matematis tak hingga, dan "+100%" yang sering dipakai orang justru
 *     mengecilkan lompatannya.
 *
 * Di dashboard yang angkanya menyentuh pembayaran, penanda yang mengarang
 * lebih buruk daripada tidak ada penanda.
 */
export interface DeltaPeriode {
  /** Selalu positif; arah dibaca dari `arah`. Dibulatkan ke bilangan bulat. */
  persen: number;
  arah: "naik" | "turun" | "tetap";
}

export function deltaPersen(sekarang: number, sebelumnya: number | null | undefined): DeltaPeriode | null {
  if (sebelumnya === null || sebelumnya === undefined) return null;
  if (!Number.isFinite(sekarang) || !Number.isFinite(sebelumnya)) return null;
  if (sebelumnya === 0) return null;

  const selisih = sekarang - sebelumnya;
  const persen = Math.round(Math.abs(selisih / sebelumnya) * 100);

  // Dibandingkan setelah PEMBULATAN, bukan sebelumnya: selisih 0,4% yang
  // dibulatkan jadi 0 tidak boleh tampil sebagai "naik 0%" - pembacanya akan
  // mengira ada kenaikan yang tidak terlihat angkanya.
  if (persen === 0) return { persen: 0, arah: "tetap" };
  return { persen, arah: selisih > 0 ? "naik" : "turun" };
}

/**
 * Bulan sebelum `bulan` dalam satu deret tren yang HANYA memuat satu tahun.
 *
 * Januari mengembalikan `null` - bulan sebelumnya ada di tahun lain yang tidak
 * ikut ditarik. Mengembalikan Desember tahun yang sama akan membandingkan
 * periode ini dengan sebelas bulan ke DEPAN.
 */
export function bulanSebelumnyaDalamTahun(bulan: number): number | null {
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return null;
  return bulan === 1 ? null : bulan - 1;
}
