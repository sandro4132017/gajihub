// ============================================================================
// SPTJM UNIT - dokumen mana yang WAJIB ber-TTE sebelum rekap dikirim ke PPABP,
// dan kapan sebuah tanda tangan sudah tidak berlaku.
//
// PURE - nol I/O. Satu-satunya sumber kebenaran untuk dua pembaca sekaligus:
// gerbang di server (kirimRekapUnitAction -> cekBolehKirim) dan tampilan
// halaman Kalkulasi Unit. Keduanya WAJIB memakai fungsi di sini; kalau salah
// satunya menghitung sendiri, tombol yang menyala di layar bisa berbeda dari
// keputusan server.
//
// KEPUTUSAN USER: TTE wajib sebelum kirim, ditagih di server, tanpa jalan
// darurat bila BSrE gangguan.
//   - SPTJM Tukin dan SPTJM Uang Makan: SELALU wajib.
//   - SPTJM Uang Lembur: wajib HANYA bila nominal lembur sudah dihitung/
//     ditampilkan (TAMPILKAN_NOMINAL_LEMBUR). Selama uang lembur ditunda
//     menunggu tata cara, tidak ada nominal yang bisa dinyatakan benar.
// ============================================================================

export type JenisSptjmUnit = "SPTJM_TUKIN" | "SPTJM_UANG_MAKAN" | "SPTJM_LEMBUR";

/** Urutan tampil & urutan penagihan. */
export const URUTAN_SPTJM: readonly JenisSptjmUnit[] = ["SPTJM_TUKIN", "SPTJM_UANG_MAKAN", "SPTJM_LEMBUR"];

export const LABEL_SPTJM: Record<JenisSptjmUnit, string> = {
  SPTJM_TUKIN: "Tukin",
  SPTJM_UANG_MAKAN: "Uang Makan",
  SPTJM_LEMBUR: "Uang Lembur",
};

/** Bentuk minimal dokumen TTE yang dibutuhkan modul ini. */
export interface DokumenSptjmRingkas {
  status: string;
  signedAt: Date | null;
}

/**
 * Dokumen TERBARU per jenis (createdAt terbesar). Sama dengan aturan lama di
 * halaman: yang dibaca selalu dokumen terakhir yang dibuat, bukan yang pernah
 * ditandatangani.
 */
export function pilihDokumenTerbaru<T extends { jenisDokumen: string; createdAt: Date }>(
  baris: readonly T[],
): Record<JenisSptjmUnit, T | null> {
  const hasil: Record<JenisSptjmUnit, T | null> = {
    SPTJM_TUKIN: null,
    SPTJM_UANG_MAKAN: null,
    SPTJM_LEMBUR: null,
  };
  for (const b of baris) {
    if (!(URUTAN_SPTJM as readonly string[]).includes(b.jenisDokumen)) continue;
    const jenis = b.jenisDokumen as JenisSptjmUnit;
    const ada = hasil[jenis];
    if (!ada || b.createdAt.getTime() > ada.createdAt.getTime()) hasil[jenis] = b;
  }
  return hasil;
}

export type StatusSptjm = "SAH" | "PERLU_TTE_ULANG" | "BELUM";

/**
 * SPTJM yang ditandatangani SEBELUM rekapnya dikembalikan PPABP sudah basi:
 * SPTJM menyatakan hitungan periode itu benar, dan pengembalian berarti
 * angkanya akan berubah. Dokumennya tidak dihapus (bukti sah atas apa yang
 * dinyatakan saat itu), tapi tidak lagi dihitung sebagai tanda tangan yang
 * berlaku.
 *
 * Diturunkan dari perbandingan waktu, bukan kolom baru.
 */
export function statusSptjm(
  dokumen: DokumenSptjmRingkas | null | undefined,
  dikembalikanPada: Date | null,
  /**
   * Waktu kalkulasi TERAKHIR komponen dokumen ini (mis. max calculatedAt
   * Tukin unit itu). Hitung ulang SESUDAH tanda tangan membuat angka yang
   * ditandatangani tidak lagi sama dengan angka yang akan dikirim, jadi
   * SPTJM-nya wajib ditandatangani ulang (keputusan user 2026-11-16).
   */
  dihitungTerakhir: Date | null = null,
): StatusSptjm {
  if (!dokumen || dokumen.status !== "TERTANDATANGANI") return "BELUM";
  const batas = [dikembalikanPada, dihitungTerakhir]
    .filter((d): d is Date => d instanceof Date)
    .reduce<number | null>((m, d) => (m === null || d.getTime() > m ? d.getTime() : m), null);
  // Fail-closed: tanda tangan tanpa waktu tidak bisa dibuktikan lebih baru
  // dari pengembalian / hitungan terakhir, jadi dianggap perlu TTE ulang.
  if (batas !== null && (!dokumen.signedAt || dokumen.signedAt.getTime() < batas)) {
    return "PERLU_TTE_ULANG";
  }
  return "SAH";
}

/** Waktu paling akhir dari daftar (null bila kosong). */
export function waktuTerakhir(daftar: readonly (Date | null | undefined)[]): Date | null {
  let hasil: Date | null = null;
  for (const d of daftar) if (d instanceof Date && (!hasil || d.getTime() > hasil.getTime())) hasil = d;
  return hasil;
}

/** Jenis SPTJM yang wajib untuk keadaan sekarang. */
export function sptjmWajib(lemburWajib: boolean): JenisSptjmUnit[] {
  return URUTAN_SPTJM.filter((j) => j !== "SPTJM_LEMBUR" || lemburWajib);
}

export interface MasukanSyaratTte {
  dokumen: Partial<Record<JenisSptjmUnit, DokumenSptjmRingkas | null>>;
  dikembalikanPada: Date | null;
  lemburWajib: boolean;
  /** Waktu kalkulasi terakhir per jenis SPTJM (Tukin, Uang Makan, Lembur). */
  dihitungTerakhir?: Partial<Record<JenisSptjmUnit, Date | null>>;
}

export interface RingkasanSyaratTte {
  wajib: JenisSptjmUnit[];
  /** Yang wajib DAN sah. */
  jumlahSah: number;
  /** Yang wajib tapi belum ada tanda tangan sama sekali. */
  belum: JenisSptjmUnit[];
  /** Yang wajib, pernah ditandatangani, tapi basi karena pengembalian. */
  perluUlang: JenisSptjmUnit[];
  /** Status SEMUA jenis (juga yang tidak wajib) - bahan tampilan. */
  statusPerJenis: Record<JenisSptjmUnit, StatusSptjm>;
  lengkap: boolean;
}

export function ringkasSyaratTte(m: MasukanSyaratTte): RingkasanSyaratTte {
  const wajib = sptjmWajib(m.lemburWajib);
  const statusPerJenis = Object.fromEntries(
    URUTAN_SPTJM.map((j) => [j, statusSptjm(m.dokumen[j], m.dikembalikanPada, m.dihitungTerakhir?.[j] ?? null)]),
  ) as Record<JenisSptjmUnit, StatusSptjm>;
  const belum = wajib.filter((j) => statusPerJenis[j] === "BELUM");
  const perluUlang = wajib.filter((j) => statusPerJenis[j] === "PERLU_TTE_ULANG");
  const jumlahSah = wajib.filter((j) => statusPerJenis[j] === "SAH").length;
  return { wajib, jumlahSah, belum, perluUlang, statusPerJenis, lengkap: belum.length === 0 && perluUlang.length === 0 };
}

/** "A", "A dan B", "A, B, dan C". */
export function daftarTeks(butir: readonly string[]): string {
  if (butir.length <= 1) return butir[0] ?? "";
  if (butir.length === 2) return `${butir[0]} dan ${butir[1]}`;
  return `${butir.slice(0, -1).join(", ")}, dan ${butir[butir.length - 1]}`;
}

/** Kalimat penolakan untuk server & layar; null bila syarat TTE terpenuhi. */
export function alasanTteBelumLengkap(r: RingkasanSyaratTte): string | null {
  if (r.lengkap) return null;
  const bagian: string[] = [];
  if (r.belum.length > 0) {
    bagian.push(`SPTJM ${daftarTeks(r.belum.map((j) => LABEL_SPTJM[j]))} belum ditandatangani.`);
  }
  if (r.perluUlang.length > 0) {
    bagian.push(
      `SPTJM ${daftarTeks(r.perluUlang.map((j) => LABEL_SPTJM[j]))} perlu ditandatangani ulang - rekap dikembalikan PPABP atau angkanya dihitung ulang setelah dokumen itu ditandatangani.`,
    );
  }
  return `${bagian.join(" ")} Tanda tangani lewat Tahap 3 (TTE SPTJM) sebelum mengirim.`;
}
