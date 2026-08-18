// ============================================================================
// Tanggal e-Presensi bermasalah - deteksi & pengecualian.
//
// DASAR HUKUM: Pasal 10 ayat (2) Permenaker 15/2024 - "Dalam hal presensi
// elektronik mengalami kendala atau keadaan kahar, presensi dilakukan secara
// manual yang diketahui oleh pimpinan Unit Kerja masing-masing."
//
// Modul ini PURE (tidak menyentuh database). Dua tugasnya terpisah tegas, dan
// pemisahan itu disengaja:
//
//   1. MENDETEKSI tanggal yang angkanya janggal  -> `deteksiTanggalJanggal`
//   2. MEMUTUSKAN apakah tanggal itu dikecualikan -> `indeksKendala` +
//      `tanggalDikecualikan`, yang isinya datang dari penanda yang DITULIS
//      MANUSIA (tabel `kendala_epresensi`).
//
// Deteksi TIDAK PERNAH langsung jadi pengecualian. Kalau sistem boleh
// memutihkan sendiri tanggal yang kelihatan aneh, hari yang memang banyak
// orang lalai akan ikut terhapus - dan tidak akan ada yang tahu. Yang
// dilakukan deteksi cuma satu: memastikan tanggal seperti itu tidak lagi
// ditemukan secara kebetulan.
// ============================================================================

/** Satu tanggal yang sudah ditandai manusia sebagai kendala e-Presensi. */
export interface PenandaKendala {
  /** Tanggal ISO "YYYY-MM-DD". */
  tanggalIso: string;
  /** null = berlaku seluruh kementerian. */
  satuanKerja: string | null;
}

export interface IndeksKendala {
  /** Tanggal yang berlaku untuk SEMUA satuan kerja. */
  semua: ReadonlySet<string>;
  /** tanggalIso -> daftar satuan kerja yang terdampak. */
  perSatker: ReadonlyMap<string, ReadonlySet<string>>;
}

/**
 * Susun penanda jadi bentuk yang murah dicek berkali-kali. Dipanggil sekali
 * per proses tarikan, bukan per pegawai.
 */
export function indeksKendala(daftar: readonly PenandaKendala[]): IndeksKendala {
  const semua = new Set<string>();
  const perSatker = new Map<string, Set<string>>();
  for (const k of daftar) {
    if (k.satuanKerja === null) {
      semua.add(k.tanggalIso);
      continue;
    }
    if (!perSatker.has(k.tanggalIso)) perSatker.set(k.tanggalIso, new Set());
    perSatker.get(k.tanggalIso)!.add(k.satuanKerja);
  }
  return { semua, perSatker };
}

/**
 * Apakah tanggal ini dikecualikan untuk pegawai di satuan kerja tersebut.
 *
 * Penanda se-kementerian menang duluan - kalau e-Presensi mati untuk semua
 * orang, satuan kerjanya tidak lagi relevan.
 */
export function tanggalDikecualikan(
  tanggalIso: string,
  satuanKerja: string | null | undefined,
  indeks: IndeksKendala
): boolean {
  if (indeks.semua.has(tanggalIso)) return true;
  if (!satuanKerja) return false;
  return indeks.perSatker.get(tanggalIso)?.has(satuanKerja) ?? false;
}

/** Bentuk himpunan tanggal yang berlaku untuk SATU pegawai (satu satker). */
export function tanggalKendalaUntukSatker(
  satuanKerja: string | null | undefined,
  indeks: IndeksKendala
): ReadonlySet<string> {
  const hasil = new Set<string>(indeks.semua);
  if (satuanKerja) {
    for (const [iso, satkers] of indeks.perSatker) if (satkers.has(satuanKerja)) hasil.add(iso);
  }
  return hasil;
}

// ---------------------------------------------------------------------------
// Deteksi
// ---------------------------------------------------------------------------

/** Ringkasan satu tanggal: berapa hari kerja, berapa yang absen pulangnya hilang. */
export interface StatistikTanggal {
  tanggalIso: string;
  /** Jumlah baris presensi berstatus kerja (WFO/WFH/WFA) di tanggal itu. */
  hariKerja: number;
  /** Berapa di antaranya yang absen masuk/pulangnya tidak tercatat. */
  kejadian: number;
}

export interface TanggalJanggal extends StatistikTanggal {
  persen: number;
  /** Median persentase seluruh tanggal yang diperiksa - pembanding "hari biasa". */
  medianPersen: number;
  /** Berapa kali lipat dari median. */
  kelipatan: number;
}

/**
 * Berapa kali lipat dari hari biasa sebelum sebuah tanggal dianggap janggal.
 *
 * Dibandingkan ke MEDIAN, bukan rata-rata: kalau ada satu-dua hari rusak,
 * rata-ratanya ikut terangkat dan justru menyamarkan hari rusak itu sendiri.
 * Median tidak bergeser oleh pencilan.
 */
export const AMBANG_KELIPATAN_MEDIAN = 3;

/**
 * Lantai mutlak, supaya hari yang cuma naik sedikit dari angka yang memang
 * kecil tidak ikut ditandai.
 *
 * Diturunkan dari data nyata Juli 2026 se-kementerian: hari biasa 1,3-2,5%,
 * hari JUMAT konsisten 3,5-5,1% (itu perilaku manusia menjelang akhir pekan,
 * BUKAN kerusakan - dan tidak boleh ikut tertandai), sementara 15 & 16 Juli
 * yang benar-benar bermasalah mencapai 13,6% dan 14,1%. Ambang 8% memisahkan
 * keduanya dengan jarak lega di kedua sisi.
 */
export const AMBANG_MINIMUM_PERSEN = 8;

/**
 * Jumlah baris minimum sebelum sebuah tanggal layak dinilai. Di unit kecil,
 * 1 dari 4 orang sudah 25% tanpa ada yang rusak.
 */
export const MINIMUM_SAMPEL = 30;

function median(angka: readonly number[]): number {
  if (angka.length === 0) return 0;
  const urut = [...angka].sort((a, b) => a - b);
  const tengah = Math.floor(urut.length / 2);
  return urut.length % 2 === 1 ? urut[tengah] : (urut[tengah - 1] + urut[tengah]) / 2;
}

/**
 * Tanggal yang angkanya jauh di atas kebiasaan - kandidat kendala e-Presensi.
 *
 * Mengembalikan daftar KANDIDAT, bukan keputusan. Yang memutuskan tetap
 * manusia lewat penanda `kendala_epresensi`.
 */
export function deteksiTanggalJanggal(
  statistik: readonly StatistikTanggal[],
  opsi: { ambangKelipatan?: number; ambangMinimumPersen?: number; minimumSampel?: number } = {}
): TanggalJanggal[] {
  const ambangKelipatan = opsi.ambangKelipatan ?? AMBANG_KELIPATAN_MEDIAN;
  const ambangMinimum = opsi.ambangMinimumPersen ?? AMBANG_MINIMUM_PERSEN;
  const minimumSampel = opsi.minimumSampel ?? MINIMUM_SAMPEL;

  const layak = statistik.filter((s) => s.hariKerja >= minimumSampel);
  if (layak.length === 0) return [];

  const persenSemua = layak.map((s) => (s.kejadian / s.hariKerja) * 100);
  const med = median(persenSemua);

  const hasil: TanggalJanggal[] = [];
  for (const s of layak) {
    const persen = (s.kejadian / s.hariKerja) * 100;
    if (persen < ambangMinimum) continue;
    // Median nol (tidak ada kejadian sama sekali di hari lain) berarti apa pun
    // yang muncul sudah menyimpang - kelipatannya tak hingga, jadi lolos.
    const kelipatan = med === 0 ? Infinity : persen / med;
    if (kelipatan < ambangKelipatan) continue;
    hasil.push({ ...s, persen, medianPersen: med, kelipatan });
  }
  return hasil.sort((a, b) => b.persen - a.persen);
}
