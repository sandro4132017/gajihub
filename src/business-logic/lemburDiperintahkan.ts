/**
 * Lembur yang DIPERINTAHKAN (SPKL): membatasi jam lembur nyata dari presensi
 * dengan jam yang diperintahkan. Pure, nol I/O.
 *
 * DASAR: keputusan user 2026-11-19 (final):
 *   - Tanpa perintah lembur = tidak bisa lembur: jam dibayar 0.
 *   - Jam dibayar per hari = min(jam diperintahkan, jam lembur nyata).
 *   - Sama di hari kerja dan hari libur.
 *   - Lembur hari kerja tetap hanya untuk status WFO (aturan 2026-09-02);
 *     WFH dengan perintah tetap 0 + catatan.
 *
 * TODO(confirm): dokumen tata cara lembur resmi (PMK pelaksanaan anggaran yang
 * dirujuk Pasal 4 SBM 2026) belum kami punya - lihat C1 di
 * docs/permintaan-data-dan-konfirmasi-osdma.md. Aturan "min(perintah, nyata)"
 * adalah keputusan user, belum disahkan dokumen resmi.
 *
 * ATURAN CATATAN (supaya pegawai/petugas melihat sebab angkanya):
 *   - tanpa perintah, ada jam nyata  -> 0 + "Terbaca N jam lembur tanpa perintah..."
 *   - ada perintah, nyata 0          -> 0 + "Diperintahkan X jam, tidak ada lembur terbaca..."
 *   - ada perintah, hari kerja bukan WFO -> 0 + sebab WFO
 *   - nyata < perintah               -> nyata + "Diperintahkan X jam, presensi Y jam"
 *   - nyata > perintah               -> perintah + "Presensi Y jam, dibatasi perintah X jam"
 *     (informatif: dipilih supaya selisih yang tidak dibayar tidak hilang diam-diam)
 *   - nyata == perintah, atau tanpa perintah dan tanpa jam nyata -> catatan null
 */

export interface HasilLemburDibayar {
  dibayar: number;
  catatan: string | null;
}

/**
 * Perintah sah = bilangan bulat positif (jam perintah selalu jam bulat -
 * keputusan user 2026-11-19); selain itu dianggap tidak ada perintah, jadi
 * dibayar 0. Pecahan ditolak di sini juga, bukan hanya di validasi input,
 * karena nilai ini langsung menentukan uang.
 */
function perintahSah(perintah: number | null | undefined): perintah is number {
  return typeof perintah === "number" && Number.isInteger(perintah) && perintah > 0;
}

export function jamLemburDibayarHarian(nyata: number, perintah: number | null): HasilLemburDibayar {
  const jamNyata = Number.isFinite(nyata) && nyata > 0 ? nyata : 0;
  if (!perintahSah(perintah)) {
    if (jamNyata > 0) {
      return { dibayar: 0, catatan: `Terbaca ${jamNyata} jam lembur tanpa perintah lembur (SPKL)` };
    }
    return { dibayar: 0, catatan: null };
  }
  if (jamNyata <= 0) {
    return {
      dibayar: 0,
      catatan: `Diperintahkan ${perintah} jam, tidak ada lembur terbaca di presensi`,
    };
  }
  if (jamNyata < perintah) {
    return { dibayar: jamNyata, catatan: `Diperintahkan ${perintah} jam, presensi ${jamNyata} jam` };
  }
  if (jamNyata > perintah) {
    return {
      dibayar: perintah,
      catatan: `Presensi ${jamNyata} jam, dibatasi perintah ${perintah} jam`,
    };
  }
  return { dibayar: perintah, catatan: null };
}

/** Bentuk minimal hari yang dibutuhkan (subset RincianHariPdf). */
export interface HariUntukPerintah {
  tanggalIso: string;
  /** KategoriHari; string agar modul ini tidak bergantung ke presensiPdfKeRekap. */
  kategori: string;
  hariLibur: boolean;
  jamLembur: number;
  berhakMakanLembur: boolean;
}

export type HariDenganPerintah<T extends HariUntukPerintah> = T & {
  /** Jam lembur nyata sebelum dibatasi perintah. */
  jamLemburNyata: number;
  catatanLembur: string | null;
};

export interface HasilTerapkanPerintah<T extends HariUntukPerintah> {
  hari: HariDenganPerintah<T>[];
  /** Perintah pada tanggal yang tidak punya baris presensi sama sekali (dibayar 0). */
  catatanTanpaPresensi: string[];
}

/**
 * Batasi jam lembur tiap hari dengan perintahnya, lalu turunkan ulang
 * `berhakMakanLembur`.
 *
 * UANG MAKAN LEMBUR (SBM 2026 item 23.2, lihat uangLembur.ts): syaratnya
 * minimal 2 jam BERTURUT-TURUT. Diturunkan dari jam DIBAYAR (>= 2), dan hanya
 * bila mesin presensi juga sudah menilai hari itu berhak (`berhakMakanLembur`
 * lama). ASUMSI: jam dibayar adalah awalan dari rentang lembur nyata yang
 * berturut-turut, jadi memenggalnya ke `perintah` tidak memutus kesinambungan.
 * Kalau nyata 3 jam terdiri dari 1+2 jam terpisah, mesin sudah menjawab "tidak
 * berhak" dan tidak dinaikkan di sini.
 * TODO(confirm): apakah "2 jam" dihitung dari jam yang diperintahkan atau jam
 * yang benar-benar dikerjakan - dipakai jam dibayar (yang terkecil).
 *
 * Hari kerja bukan WFO: lembur dinolkan (aturan 2026-09-02), termasuk jam dari
 * koreksi petugas (keputusan user 2026-11-19); perintahnya tetap dicatat. Hari
 * libur dan baris "Lembur" berdiri sendiri tidak punya syarat WFO.
 */
export function terapkanPerintahLembur<T extends HariUntukPerintah>(
  hari: readonly T[],
  perintahPerTanggal: ReadonlyMap<string, number>
): HasilTerapkanPerintah<T> {
  const hasil = hari.map((h): HariDenganPerintah<T> => {
    const perintah = perintahPerTanggal.get(h.tanggalIso) ?? null;
    const nyata = h.jamLembur;
    const bukanWfo = !h.hariLibur && h.kategori !== "WFO" && h.kategori !== "LEMBUR";
    // Hari kerja berstatus bukan WFO: lembur hari kerja hanya untuk WFO (aturan
    // 2026-09-02), dan di satker ber-SPKL aturan itu MUTLAK - termasuk jam yang
    // datang dari koreksi petugas (keputusan user 2026-11-19). Jam nyatanya
    // tetap disimpan apa adanya supaya selisihnya terlihat, tapi dibayar 0.
    if (bukanWfo) {
      const catatanLembur = perintahSah(perintah)
        ? `Diperintahkan ${perintah} jam, tapi status hari itu bukan WFO - lembur hari kerja hanya untuk WFO, dibayar 0`
        : nyata > 0
          ? `Terbaca ${nyata} jam lembur di hari kerja bukan WFO - lembur hari kerja hanya untuk WFO, dibayar 0`
          : null;
      return {
        ...h,
        jamLembur: 0,
        berhakMakanLembur: false,
        jamLemburNyata: Math.max(nyata, 0),
        catatanLembur,
      };
    }
    const { dibayar, catatan } = jamLemburDibayarHarian(nyata, perintah);
    return {
      ...h,
      jamLembur: dibayar,
      berhakMakanLembur: h.berhakMakanLembur && dibayar >= 2,
      jamLemburNyata: nyata,
      catatanLembur: catatan,
    };
  });

  const adaBaris = new Set(hari.map((h) => h.tanggalIso));
  const catatanTanpaPresensi: string[] = [];
  for (const [iso, perintah] of [...perintahPerTanggal].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!perintahSah(perintah) || adaBaris.has(iso)) continue;
    catatanTanpaPresensi.push(
      `${iso}: diperintahkan lembur ${perintah} jam, tapi tidak ada baris presensi di tanggal itu - dibayar 0.`
    );
  }
  return { hari: hasil, catatanTanpaPresensi };
}
