/**
 * Rincian cuti satu pegawai dalam satu periode, per JENIS - isi pop up angka
 * cuti di halaman Presensi.
 *
 * Rekap bulanan (`RekapPresensiPeriode`) cuma menyimpan SATU jenis cuti, yaitu
 * yang harinya terbanyak - itu yang dipakai Pasal 14 di perhitungan Tukin.
 * Rincian ini menunjukkan seluruh jenisnya dari baris harian e-Presensi,
 * supaya pemeriksa bisa melihat bahwa "3 Cuti Sakit" sebenarnya 2 hari cuti
 * sakit + 1 hari cuti tahunan.
 *
 * Murni: tanpa prisma, tanpa I/O.
 */

export interface BarisCutiHarian {
  tanggal: Date;
  /** Label e-Presensi apa adanya, mis. "Cuti - Cuti Tahunan". Null untuk baris lama. */
  namaSistemKerja: string | null;
}

export interface RincianJenisCuti {
  jenis: string;
  hari: number;
  /** Tanggal (1-31) urut naik. */
  tanggal: number[];
}

/** Label yang dipakai kalau e-Presensi tidak menyebut jenisnya. */
export const JENIS_CUTI_TAK_DISEBUT = "Cuti (jenis tidak disebut)";

/** "Cuti - Cuti Tahunan" -> "Cuti Tahunan"; "Cuti" / kosong -> label tak disebut. */
export function labelJenisCutiHarian(namaSistemKerja: string | null): string {
  const t = namaSistemKerja?.trim() ?? "";
  const tanpaAwalan = t.replace(/^Cuti\s*-\s*/i, "").trim();
  if (!tanpaAwalan || /^cuti$/i.test(tanpaAwalan)) return JENIS_CUTI_TAK_DISEBUT;
  return tanpaAwalan;
}

/**
 * Kelompokkan baris cuti harian per jenis. Urut: hari terbanyak dulu; kalau
 * seri, jenis yang lebih dulu muncul di bulan itu - sama dengan aturan
 * pemilihan jenis cuti di rekap (`presensiPdfKeRekap.ts`).
 */
export function susunRincianCuti(baris: BarisCutiHarian[]): RincianJenisCuti[] {
  const urut = [...baris].sort((a, b) => a.tanggal.getTime() - b.tanggal.getTime());
  const per = new Map<string, number[]>();
  for (const b of urut) {
    const jenis = labelJenisCutiHarian(b.namaSistemKerja);
    const tgl = b.tanggal.getUTCDate();
    const daftar = per.get(jenis) ?? [];
    if (!daftar.includes(tgl)) daftar.push(tgl);
    per.set(jenis, daftar);
  }
  return [...per.entries()]
    .map(([jenis, tanggal]) => ({ jenis, hari: tanggal.length, tanggal }))
    .sort((a, b) => b.hari - a.hari);
}

/**
 * Rincian untuk pop up, atau `null` kalau rincian per jenis TIDAK tersedia:
 * tidak ada baris cuti harian sama sekali, atau SEMUA barisnya tanpa label
 * jenis (data harian sebelum 2026-09-29 tidak menyimpan `namaSistemKerja`).
 *
 * Tanpa pembeda ini, bulan lama tampil sebagai satu baris "Cuti (jenis tidak
 * disebut)" - terbaca seperti rincian, padahal datanya memang tidak ada.
 * Label "tidak disebut" tetap dipakai untuk SEBAGIAN baris di bulan campuran.
 */
export function rincianCutiAtauNull(baris: BarisCutiHarian[]): RincianJenisCuti[] | null {
  if (!baris.some((b) => b.namaSistemKerja?.trim())) return null;
  return susunRincianCuti(baris);
}
