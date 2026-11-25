// ============================================================================
// TAHAP KALKULASI UNIT - logika tampilan halaman /kasubag/kalkulasi yang
// berupa hitungan & keputusan, bukan JSX: sub-langkah stepper, jumlah tab,
// total, potongan, checklist pengiriman, dan kandidat anomali.
//
// PURE - nol I/O. Halaman menyerahkan angka yang sudah dibaca dari database;
// di sini hanya dihitung dan diberi nama. Sengaja dipisah dari komponen supaya
// angka yang tampil di stepper, kartu tahap, dan checklist selalu berasal dari
// satu perhitungan - bukan tiga salinan yang bisa saling berbeda.
//
// Tidak ada keputusan regulasi baru di sini: potongan Tukin diturunkan dari
// nilai tersimpan (lihat rincianTukinTersimpan.ts untuk dasar Pasal 5 & 13).
// ============================================================================

import { TEMUAN, type JenisTemuan, type PegawaiDiperiksa, type RingkasanKesiapan } from "./kesiapanKalkulasi";
import { TABEL_WAJIB_DIVERIFIKASI, type JenisTabelKalkulasi, type KeadaanPengiriman } from "./pengirimanUnit";
import type { RingkasanSyaratTte } from "./sptjmUnit";

// ---------------------------------------------------------------------------
// TAHAP 1 - kesiapan pegawai & anomali
// ---------------------------------------------------------------------------

export interface RingkasKesiapanPegawai {
  total: number;
  /** Tidak punya temuan apa pun - siap dihitung. */
  siap: number;
  /** Punya satu temuan atau lebih (HALANG maupun PERIKSA). */
  perluTinjau: number;
  /** 0-100, dibulatkan; 0 bila unit kosong (bukan NaN). */
  persenSiap: number;
}

export function ringkasKesiapanPegawai(r: RingkasanKesiapan): RingkasKesiapanPegawai {
  const total = r.jumlahDiperiksa;
  return {
    total,
    siap: r.jumlahLengkap,
    perluTinjau: r.jumlahPerluDiperiksa,
    persenSiap: total > 0 ? Math.round((r.jumlahLengkap / total) * 100) : 0,
  };
}

/**
 * Temuan yang membuat seseorang jadi KANDIDAT pengecualian: belum punya
 * predikat (staf maupun pejabat pimpinan tinggi) atau sebulan penuh tanpa
 * kehadiran tercatat. Keduanya tanda yang sama - orangnya mungkin sudah keluar
 * dari unit tapi SIAP belum diperbarui.
 */
const TEMUAN_ANOMALI: readonly JenisTemuan[] = ["PREDIKAT_BELUM_ADA", "PREDIKAT_JPT_BELUM_ADA", "TIDAK_ADA_KEHADIRAN"];

/** Kandidat = tanpa predikat UNION kehadiran 0 hari sebulan; urutan input dipertahankan. */
export function kandidatAnomali(perPegawai: readonly PegawaiDiperiksa[]): PegawaiDiperiksa[] {
  return perPegawai.filter((p) => p.temuan.some((t) => TEMUAN_ANOMALI.includes(t)));
}

/** Label temuan anomali satu pegawai, untuk ditampilkan di kartu pengecualian. */
export function labelTemuanAnomali(temuan: readonly JenisTemuan[]): string[] {
  return temuan.filter((t) => TEMUAN_ANOMALI.includes(t)).map((t) => TEMUAN[t].label);
}

export function kalimatAnomali(jumlah: number): string {
  return `Terdapat ${jumlah} pegawai tanpa predikat / kehadiran 0 hari yang perlu ditinjau: tagih predikatnya, atau kecualikan bila memang sudah keluar.`;
}

/** Label sumber data dari ambilSumberData - tidak pernah dikarang di sini. */
export function labelSumberData(sistemSumber: string | null | undefined): string {
  const s = (sistemSumber ?? "").trim();
  return s === "" || s === "-" ? "Belum ada data" : s;
}

/** Persen bulat; 0 bila pembaginya nol. */
export function persenTerisi(terisi: number, dari: number): number {
  return dari > 0 ? Math.min(100, Math.round((terisi / dari) * 100)) : 0;
}

// ---------------------------------------------------------------------------
// TAHAP 2 - tab, pencarian, total, potongan
// ---------------------------------------------------------------------------

export type TabKalkulasi = "tukin" | "makan" | "lembur";

/** `?tab=` dari luar: nilai tak dikenal jatuh ke "tukin", tidak melempar. */
export function bacaTab(mentah: string | undefined): TabKalkulasi {
  return mentah === "makan" || mentah === "lembur" ? mentah : "tukin";
}

/**
 * Saring baris menurut `?q=` (nama ATAU NIP, tanpa membedakan huruf besar).
 *
 * HANYA menyaring baris yang tampil. Total, kesiapan, dan syarat kirim dihitung
 * dari seluruh pegawai oleh pemanggil - pencarian tidak boleh mengubah angka
 * yang menentukan boleh-tidaknya rekap dikirim.
 */
export function saringPegawai<T extends { nama: string; nip: string }>(baris: readonly T[], q: string | undefined): T[] {
  const kata = (q ?? "").trim().toLowerCase();
  if (kata === "") return [...baris];
  return baris.filter((b) => b.nama.toLowerCase().includes(kata) || b.nip.includes(kata));
}

/** Σ tukin bersih. Nilai yang bukan angka hingga (null/NaN) dilewati, bukan dianggap 0 diam-diam. */
export function totalTukinBersih(nilai: readonly (number | null | undefined)[]): number {
  return nilai.reduce<number>((jumlah, n) => (typeof n === "number" && Number.isFinite(n) ? jumlah + n : jumlah), 0);
}

export interface PotonganTukin {
  /** penuh - bersih, tidak pernah negatif. */
  nominal: number;
  /** nominal / penuh x 100. */
  persen: number;
}

/**
 * Potongan = (penuh - bersih) / penuh, atas TOTAL tukin (keputusan user).
 *
 * `bersih` adalah nilai tersimpan setelah potongan kehadiran (Pasal 13) dan
 * capaian kinerja (Pasal 5 & Kepsekjen 82/2025) - jadi selisihnya mencakup
 * keduanya sekaligus, BUKAN potongan Pasal 13 saja. null bila tarif penuh tidak
 * diketahui atau tukin belum dihitung: tidak ditebak.
 */
export function potonganTukin(penuh: number | null | undefined, bersih: number | null | undefined): PotonganTukin | null {
  if (typeof penuh !== "number" || typeof bersih !== "number") return null;
  if (!Number.isFinite(penuh) || !Number.isFinite(bersih) || penuh <= 0) return null;
  const nominal = Math.max(0, penuh - bersih);
  return { nominal, persen: (nominal / penuh) * 100 };
}

export interface HasilNominalNol {
  /** Pegawai dengan tukin bersih > 0. */
  valid: number;
  /** Sudah dihitung tapi tukin bersihnya 0 (atau kurang). */
  nol: { nip: string; nama: string }[];
}

/** INFO untuk checklist - tidak pernah menahan pengiriman (keputusan user). */
export function validasiNominalNol(
  pegawai: readonly { nip: string; nama: string; tukinBersih: number | null }[],
): HasilNominalNol {
  const hasil: HasilNominalNol = { valid: 0, nol: [] };
  for (const p of pegawai) {
    if (p.tukinBersih === null) continue; // belum dihitung: urusan syarat "kalkulasi lengkap"
    if (p.tukinBersih > 0) hasil.valid += 1;
    else hasil.nol.push({ nip: p.nip, nama: p.nama });
  }
  return hasil;
}

// ---------------------------------------------------------------------------
// TAHAP 3 - sub-judul dokumen SPTJM
// ---------------------------------------------------------------------------

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

/** "46 Pegawai • Rp 1.234.000" */
export function subSptjmUang(jumlahPegawai: number, total: number): string {
  return `${jumlahPegawai} Pegawai • ${rupiah(total)}`;
}

/** "3 Pegawai • 12 Jam Lembur" - TANPA rupiah selama lembur ditunda. */
export function subSptjmLembur(jumlahPegawai: number, totalJam: number): string {
  const jam = Number.isFinite(totalJam) && totalJam > 0 ? Math.floor(totalJam) : 0;
  return `${jumlahPegawai} Pegawai • ${jam} Jam Lembur`;
}

// ---------------------------------------------------------------------------
// TAHAP 4 - checklist & tombol kirim
// ---------------------------------------------------------------------------

export interface ButirChecklist {
  kunci: "TTE" | "NOMINAL_NOL" | "KALKULASI" | "BASI" | "TABEL";
  label: string;
  nilai: string;
  lolos: boolean;
  /** false = informasi saja, tidak ikut menentukan boleh-tidaknya kirim. */
  menahan: boolean;
}

export interface MasukanChecklist {
  tte: RingkasanSyaratTte;
  nominalNol: HasilNominalNol;
  totalPegawai: number;
  jumlahKalkulasi: number;
  jumlahBasi: number;
  tabelDiverifikasi: readonly JenisTabelKalkulasi[];
}

/** Tabel wajib yang sudah dicentang (yang tak wajib tidak dihitung). */
export function hitungTabelWajibSudah(tabelDiverifikasi: readonly JenisTabelKalkulasi[]): number {
  const punya = new Set(tabelDiverifikasi);
  return TABEL_WAJIB_DIVERIFIKASI.filter((t) => punya.has(t)).length;
}

export function susunChecklist(m: MasukanChecklist): ButirChecklist[] {
  const tabelSudah = hitungTabelWajibSudah(m.tabelDiverifikasi);
  const tabelWajib = TABEL_WAJIB_DIVERIFIKASI.length;
  const butir: ButirChecklist[] = [
    {
      kunci: "TTE",
      label: "Dokumen SPTJM PPK (TTE)",
      nilai: `${m.tte.jumlahSah} / ${m.tte.wajib.length} Selesai`,
      lolos: m.tte.lengkap,
      menahan: true,
    },
    {
      kunci: "NOMINAL_NOL",
      label: "Validasi Nominal Nol",
      nilai: `${m.nominalNol.valid} Pegawai Valid`,
      lolos: m.nominalNol.nol.length === 0,
      menahan: false,
    },
    {
      kunci: "KALKULASI",
      label: "Kalkulasi lengkap",
      nilai: `${m.jumlahKalkulasi} dari ${m.totalPegawai}`,
      lolos: m.totalPegawai > 0 && m.jumlahKalkulasi >= m.totalPegawai,
      menahan: true,
    },
    {
      kunci: "BASI",
      label: "Tidak ada angka basi",
      nilai: m.jumlahBasi === 0 ? "tidak ada" : `${m.jumlahBasi} basi`,
      lolos: m.jumlahBasi === 0,
      menahan: true,
    },
  ];
  // Butir tabel hanya muncul bila memang ada tabel wajib (sekarang tidak ada:
  // TTE SPTJM sudah berarti diperiksa).
  if (tabelWajib > 0) {
    butir.push({
      kunci: "TABEL",
      label: "Tabel wajib diperiksa",
      nilai: `${tabelSudah} dari ${tabelWajib}`,
      lolos: tabelSudah >= tabelWajib,
      menahan: true,
    });
  }
  return butir;
}

/** Semua butir yang MENAHAN sudah lolos (butir informasi diabaikan). */
export function semuaSyaratLolos(butir: readonly ButirChecklist[]): boolean {
  return butir.every((b) => !b.menahan || b.lolos);
}

export function labelTombolKirim(m: { syaratLengkap: boolean; pernyataanDicentang: boolean }): string {
  return m.syaratLengkap && m.pernyataanDicentang ? "Kirim & Kunci ke PPABP" : "Lengkapi TTE, Checklist & Pernyataan";
}

export const CHIP_PENGIRIMAN: Record<KeadaanPengiriman, { label: string; kelas: string }> = {
  BELUM_KIRIM: { label: "Terbuka", kelas: "chip chip-draft" },
  DIKEMBALIKAN: { label: "Dikembalikan", kelas: "chip chip-danger" },
  TERKIRIM: { label: "Terkunci", kelas: "chip chip-ok" },
};

// ---------------------------------------------------------------------------
// STEPPER
// ---------------------------------------------------------------------------

export type StatusLangkah = "SELESAI" | "PERLU_PERHATIAN" | "BELUM";

export const TEKS_STATUS_LANGKAH: Record<StatusLangkah, string> = {
  SELESAI: "Selesai",
  PERLU_PERHATIAN: "Perlu perhatian",
  BELUM: "Belum selesai",
};

export interface LangkahStepper {
  nomor: 1 | 2 | 3 | 4;
  judul: string;
  sub: string;
  status: StatusLangkah;
  href: `#tahap-${number}`;
}

export interface MasukanStepper {
  kesiapan: RingkasKesiapanPegawai;
  /** Semua pegawai aktif sudah punya kalkulasi & tidak ada yang basi. */
  kalkulasiLengkap: boolean;
  tte: RingkasanSyaratTte;
  tabelWajibSudah: number;
  tabelWajib: number;
  keadaan: KeadaanPengiriman;
  /** Pegawai yang dikecualikan pada periode ini. */
  jumlahDikecualikan?: number;
}

const SUB_PENGIRIMAN: Record<KeadaanPengiriman, string> = {
  BELUM_KIRIM: "Menunggu Finalisasi",
  DIKEMBALIKAN: "Dikembalikan PPABP",
  TERKIRIM: "Terkirim & terkunci",
};

export function susunStepper(m: MasukanStepper): LangkahStepper[] {
  const k = m.kesiapan;
  return [
    {
      nomor: 1,
      judul: "Pemeriksaan Data",
      // Sesudah terkirim tidak ada lagi yang bisa ditinjau; yang tersisa
      // keterangan siapa yang dikecualikan.
      sub:
        m.keadaan === "TERKIRIM"
          ? `${k.siap} Siap • ${m.jumlahDikecualikan ?? 0} Dikecualikan`
          : `${k.siap} Siap • ${k.perluTinjau} Perlu Ditinjau`,
      status: k.perluTinjau > 0 ? "PERLU_PERHATIAN" : k.total > 0 ? "SELESAI" : "BELUM",
      href: "#tahap-1",
    },
    {
      nomor: 2,
      judul: "Kalkulasi Pembayaran",
      sub: "Tukin, Makan & Lembur",
      status: m.kalkulasiLengkap ? "SELESAI" : "BELUM",
      href: "#tahap-2",
    },
    {
      nomor: 3,
      judul: "TTE SPTJM",
      sub:
        m.tabelWajib > 0
          ? `${m.tte.jumlahSah}/${m.tte.wajib.length} SPTJM • ${m.tabelWajibSudah}/${m.tabelWajib} Review`
          : `${m.tte.jumlahSah}/${m.tte.wajib.length} SPTJM`,
      status: m.tte.lengkap && m.tabelWajibSudah >= m.tabelWajib ? "SELESAI" : "BELUM",
      href: "#tahap-3",
    },
    {
      nomor: 4,
      judul: "Pengiriman ke PPABP",
      sub: SUB_PENGIRIMAN[m.keadaan],
      status: m.keadaan === "TERKIRIM" ? "SELESAI" : m.keadaan === "DIKEMBALIKAN" ? "PERLU_PERHATIAN" : "BELUM",
      href: "#tahap-4",
    },
  ];
}
