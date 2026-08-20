import { hitungPotonganKehadiranPersen } from "./tukin";
import type { RincianPotonganKehadiran } from "../types/index";

/** Satu keputusan potongan e-Presensi, sudah dinormalkan jadi POSITIF. */
export interface PotonganEpresensiHarian {
  tanggalIso: string;
  /** Persen yang MEMOTONG, sebagai pecahan (0,02 = 2%). Sumbernya negatif. */
  persen: number;
  keterangan: string;
}

/** Pelanggaran Pasal 13 pada satu hari menurut Gajihub. */
export interface PelanggaranGajihubHarian {
  tanggalIso: string;
  hariAlpha: boolean;
  kejadianTidakPresensi: number;
  menitTerlambat: number;
  menitPulangCepat: number;
  menitMeninggalkanKantor: number;
  tidakIkutUpacara: boolean;
}

export type SebabBeda =
  | "TARIF_LUPA_ABSEN"
  | "KLASIFIKASI_LUPA_ABSEN"
  | "TARIF_TERLAMBAT"
  | "BATAS_HARIAN_EPRESENSI"
  | "HANYA_EPRESENSI"
  | "HANYA_GAJIHUB"
  | "LAINNYA";

export const PENJELASAN_SEBAB: Record<SebabBeda, { judul: string; dasar: string }> = {
  TARIF_LUPA_ABSEN: {
    judul: "Tarif lupa presensi berbeda",
    dasar:
      "e-Presensi memotong 2% flat. Pasal 13 ayat (2) menetapkan 1% SETIAP KALI tidak melakukan presensi, dan ayat itu memisahkan presensi kehadiran dari kepulangan.",
  },
  KLASIFIKASI_LUPA_ABSEN: {
    judul: "e-Presensi menyebutnya lupa presensi, Gajihub tidak",
    dasar:
      "e-Presensi menandai hari yang jam kerjanya kurang dari 7,5 jam sebagai lupa presensi walau kedua tap ADA. Pasal 13 ayat (2) mensyaratkan presensi yang tidak dilakukan; kekurangan jamnya sudah ditagih ayat (3) per menit.",
  },
  TARIF_TERLAMBAT: {
    judul: "Tarif keterlambatan berbeda",
    dasar:
      "e-Presensi memakai tabel berjenjang (0,5 / 1 / 1,5 / 2%). Pasal 13 ayat (3) menetapkan 0,01% setiap menit - dan itu yang dipakai rincian tunkin resmi.",
  },
  BATAS_HARIAN_EPRESENSI: {
    judul: "e-Presensi berhenti di batas 2% per hari",
    dasar: "Batas maksimal harian tidak ada di Pasal 13 manapun, jadi potongan Gajihub bisa melewatinya.",
  },
  HANYA_EPRESENSI: {
    judul: "Hanya e-Presensi yang memotong",
    dasar: "Menurut fakta presensi yang dibaca Gajihub, tidak ada pelanggaran Pasal 13 di tanggal ini.",
  },
  HANYA_GAJIHUB: {
    judul: "Hanya Gajihub yang memotong",
    dasar: "e-Presensi tidak mencatat keputusan potongan untuk tanggal ini.",
  },
  LAINNYA: {
    judul: "Beda yang belum terklasifikasi",
    dasar: "Keterangan e-Presensi tidak cocok dengan pola yang dikenali - perlu dilihat manusia.",
  },
};

export interface BarisBandingPotongan {
  tanggalIso: string;
  /** Pecahan bobot kehadiran, 0,02 = 2%. */
  epresensiPersen: number;
  gajihubPersen: number;
  /** gajihub - epresensi. Positif berarti Gajihub memotong lebih besar. */
  selisihPersen: number;
  keteranganEpresensi: string | null;
  rincianGajihub: RincianPotonganKehadiran[];
  sebab: SebabBeda;
}

export interface HasilBandingPotongan {
  baris: BarisBandingPotongan[];
  /** Hanya yang benar-benar berbeda, urut dari selisih terbesar. */
  beda: BarisBandingPotongan[];
  totalEpresensiPersen: number;
  totalGajihubPersen: number;
  /** Rupiah; null kalau bobot kehadiran tidak diketahui (kelas jabatan kosong). */
  selisihRupiah: number | null;
}

const RE_LUPA = /lupa presensi/i;
const RE_TELAT = /keterlambatan|tukin harian/i;
/** Batas maksimal harian e-Presensi - dipakai HANYA mengenali pola, bukan menghitung. */
const BATAS_HARIAN_EPRESENSI_PERSEN = 0.02;
/** Selisih yang dianggap nol - menghindari beda semu dari pembulatan float. */
const EPSILON = 1e-9;

function klasifikasi(
  e: PotonganEpresensiHarian | undefined,
  g: PelanggaranGajihubHarian | undefined,
  gajihubPersen: number
): SebabBeda {
  const gLupa = (g?.kejadianTidakPresensi ?? 0) > 0;
  const gTelat = (g?.menitTerlambat ?? 0) + (g?.menitPulangCepat ?? 0) > 0;

  if (!e) return "HANYA_GAJIHUB";
  if (gajihubPersen <= EPSILON) return RE_LUPA.test(e.keterangan) ? "KLASIFIKASI_LUPA_ABSEN" : "HANYA_EPRESENSI";
  if (RE_LUPA.test(e.keterangan)) return gLupa ? "TARIF_LUPA_ABSEN" : "KLASIFIKASI_LUPA_ABSEN";

  if (RE_TELAT.test(e.keterangan) && gTelat) {
    // Batas maksimal dicek DULU: kalau e-Presensi mentok di 2% sementara Gajihub jauh
    // di atasnya, sebab utamanya batas itu - bukan bentuk tarifnya.
    return e.persen >= BATAS_HARIAN_EPRESENSI_PERSEN - EPSILON && gajihubPersen > BATAS_HARIAN_EPRESENSI_PERSEN + EPSILON
      ? "BATAS_HARIAN_EPRESENSI"
      : "TARIF_TERLAMBAT";
  }
  return "LAINNYA";
}

/**
 * Susun perbandingan per tanggal.
 *
 * Sisi Gajihub dihitung lewat `hitungPotonganKehadiranPersen` - fungsi yang
 * SAMA yang dipakai membayar. Kalau lapisan ini punya rumusnya sendiri,
 * perbandingannya tidak berarti: beda hasil bisa datang dari beda rumus, bukan
 * beda kebijakan.
 */
export function bandingkanPotongan(input: {
  epresensi: PotonganEpresensiHarian[];
  gajihub: PelanggaranGajihubHarian[];
  /** Rupiah bobot kehadiran (30% x tarif kelas jabatan). null = tidak diketahui. */
  bobotKehadiranRupiah: number | null;
}): HasilBandingPotongan {
  // Satu tanggal bisa punya beberapa baris keputusan di e-Presensi -
  // penyesuaian manual ditulis sebagai baris tersendiri, bukan menimpa.
  const petaE = new Map<string, PotonganEpresensiHarian>();
  for (const e of input.epresensi) {
    const ada = petaE.get(e.tanggalIso);
    petaE.set(
      e.tanggalIso,
      ada
        ? {
            tanggalIso: e.tanggalIso,
            persen: ada.persen + e.persen,
            keterangan: ada.keterangan + "; " + e.keterangan,
          }
        : { ...e }
    );
  }
  const petaG = new Map(input.gajihub.map((g) => [g.tanggalIso, g]));
  const semuaTanggal = [...new Set([...petaE.keys(), ...petaG.keys()])].sort();

  const baris: BarisBandingPotongan[] = semuaTanggal.map((tanggalIso) => {
    const e = petaE.get(tanggalIso);
    const g = petaG.get(tanggalIso);
    const hitung = hitungPotonganKehadiranPersen({
      jumlahHariAlpha: g?.hariAlpha ? 1 : 0,
      jumlahTidakPresensi: g?.kejadianTidakPresensi ?? 0,
      totalMenitTerlambat: g?.menitTerlambat ?? 0,
      totalMenitPulangCepat: g?.menitPulangCepat ?? 0,
      totalMenitMeninggalkanKantor: g?.menitMeninggalkanKantor ?? 0,
      jumlahTidakIkutUpacara: g?.tidakIkutUpacara ? 1 : 0,
    });
    const epresensiPersen = e?.persen ?? 0;
    return {
      tanggalIso,
      epresensiPersen,
      gajihubPersen: hitung.totalPersen,
      selisihPersen: hitung.totalPersen - epresensiPersen,
      keteranganEpresensi: e?.keterangan ?? null,
      rincianGajihub: hitung.rincian,
      sebab: klasifikasi(e, g, hitung.totalPersen),
    };
  });

  const totalEpresensiPersen = baris.reduce((a, b) => a + b.epresensiPersen, 0);
  const totalGajihubPersen = baris.reduce((a, b) => a + b.gajihubPersen, 0);

  return {
    baris,
    beda: baris
      .filter((b) => Math.abs(b.selisihPersen) > EPSILON)
      .sort((a, b) => Math.abs(b.selisihPersen) - Math.abs(a.selisihPersen)),
    totalEpresensiPersen,
    totalGajihubPersen,
    selisihRupiah:
      input.bobotKehadiranRupiah === null
        ? null
        : Math.round((totalGajihubPersen - totalEpresensiPersen) * input.bobotKehadiranRupiah),
  };
}
