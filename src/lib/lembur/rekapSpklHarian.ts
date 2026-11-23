// Rekap SPKL HARIAN satu satuan kerja: semua perintah lembur yang TERKIRIM pada
// satu tanggal dari SEMUA Kepala Tim, disusun jadi baris lampiran (nama, NIP,
// golongan, jam, uraian; satu baris per pegawai). Penyusunan (`susunRekapSpklHarian`,
// `susunDaftarSpklHarian`) murni; pemuatnya (`muatRekapSpklHarian`,
// `muatDaftarSpklHarian`) hanya membaca database Gajihub.
//
// HANYA perintah berstatus TERKIRIM yang sah (lihat PerintahLembur): baris
// DRAFT/GAGAL tidak pernah masuk. Perintah di luar tanggal atau di luar gerbang
// pilot (gerbangSpkl) dibuang lagi di sini sebagai pertahanan kedua, karena
// hasilnya dicetak di dokumen resmi.

import type { PrismaClient } from "@prisma/client";
import { namaBergelarSpkl, namaCetakPegawai } from "../../business-logic/namaPegawai";
import { golonganPppkKeKurungSbm, golonganRomawi, PADANAN_GOLONGAN_PPPK } from "../../business-logic/tarifSbm";
import type { BarisSpklHarian } from "../tte/spklHarianPdf";
import { spklAktifUntuk } from "./gerbangSpkl";
import { isoDariTanggalUtc } from "./perintahPeriode";

export interface BarisAnggotaPerintah {
  pegawaiId: string;
  nip: string;
  nama: string;
  gelarDepan?: string | null;
  gelarBelakang?: string | null;
  golongan: string | null;
  jamDiperintahkan: number;
}

export interface BarisPerintahHarian {
  /** Tanggal lembur ISO YYYY-MM-DD. */
  tanggalIso: string;
  kepalaTimNama: string;
  uraianTugas: string;
  anggota: readonly BarisAnggotaPerintah[];
}

export interface RingkasanSpklHarian {
  jumlahPerintah: number;
  /** Pegawai berbeda (satu pegawai di dua perintah dihitung sekali). */
  jumlahPegawai: number;
  /** Jumlah jam yang DIPERINTAHKAN (bukan jam nyata). */
  totalJam: number;
}

/** Ringkasan per pemberi perintah (Kepala Tim / pimpinan) pada tanggal itu. */
export interface RingkasanPemberi {
  nama: string;
  jumlahPegawai: number;
  totalJam: number;
}

export interface RekapSpklHarian {
  tanggalIso: string;
  /** Satu baris per pegawai, urut golongan (lihat urutanGolongan); siap untuk generateSpklHarianPdf. */
  baris: BarisSpklHarian[];
  ringkasan: RingkasanSpklHarian;
  perPemberi: RingkasanPemberi[];
}

const URUTAN_PPPK = Object.keys(PADANAN_GOLONGAN_PPPK);
const RANGKING_ROMAWI: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 };

/**
 * Kunci urut golongan: PNS tertinggi dulu (IV/e ... I/a), lalu PPPK
 * (jenjang tertinggi dulu), lalu yang tanpa golongan. Pembaca golongan
 * dipinjam dari tarifSbm.ts (golonganRomawi, golonganPppkKeKurungSbm).
 */
export function urutanGolongan(golongan: string | null | undefined): [number, number] {
  const romawi = golonganRomawi(golongan);
  if (romawi) {
    const huruf = /\/\s*([A-E])\b/i.exec(golongan!.trim())?.[1].toUpperCase() ?? "A";
    return [0, -(RANGKING_ROMAWI[romawi] * 10 + (huruf.charCodeAt(0) - 64))];
  }
  if (golonganPppkKeKurungSbm(golongan)) {
    return [1, -URUTAN_PPPK.indexOf(golongan!.trim().toUpperCase())];
  }
  return [2, 0];
}

export function susunRekapSpklHarian(
  perintah: readonly BarisPerintahHarian[],
  satuanKerja: string,
  tanggalIso: string,
): RekapSpklHarian {
  const perNip = new Map<string, BarisSpklHarian>();
  const perPemberi = new Map<string, { nips: Set<string>; totalJam: number }>();
  let jumlahPerintah = 0;
  let totalJam = 0;

  if (spklAktifUntuk(satuanKerja, tanggalIso)) {
    for (const p of perintah) {
      if (p.tanggalIso !== tanggalIso) continue;
      if (p.anggota.length === 0) continue;
      jumlahPerintah++;
      const pemberi = namaCetakPegawai({ nama: p.kepalaTimNama });
      const grup = perPemberi.get(pemberi) ?? { nips: new Set<string>(), totalJam: 0 };
      perPemberi.set(pemberi, grup);
      const uraian = p.uraianTugas.trim();
      for (const a of p.anggota) {
        totalJam += a.jamDiperintahkan;
        grup.totalJam += a.jamDiperintahkan;
        grup.nips.add(a.nip);
        const ada = perNip.get(a.nip);
        if (ada) {
          ada.jam += a.jamDiperintahkan;
          if (uraian && !ada.uraian.includes(uraian)) ada.uraian.push(uraian);
        } else {
          perNip.set(a.nip, {
            nip: a.nip,
            nama: namaBergelarSpkl(a), // bergelar: keputusan user 2026-11-20
            golongan: a.golongan?.trim() || "-",
            jam: a.jamDiperintahkan,
            uraian: uraian ? [uraian] : [],
          });
        }
      }
    }
  }

  const baris = [...perNip.values()].sort((x, y) => {
    const [kx, rx] = urutanGolongan(x.golongan);
    const [ky, ry] = urutanGolongan(y.golongan);
    return kx - ky || rx - ry || x.nama.localeCompare(y.nama, "id") || x.nip.localeCompare(y.nip);
  });
  return {
    tanggalIso,
    baris,
    ringkasan: { jumlahPerintah, jumlahPegawai: baris.length, totalJam },
    perPemberi: [...perPemberi.entries()]
      .map(([nama, g]) => ({ nama, jumlahPegawai: g.nips.size, totalJam: g.totalJam }))
      .sort((x, y) => x.nama.localeCompare(y.nama, "id")),
  };
}

export interface BarisDaftarSpklHarian extends RingkasanSpklHarian {
  tanggalIso: string;
  perPemberi: RingkasanPemberi[];
}

/** Satu baris per tanggal yang punya perintah, terurut naik; tanggal di luar gerbang dibuang. */
export function susunDaftarSpklHarian(
  perintah: readonly BarisPerintahHarian[],
  satuanKerja: string,
): BarisDaftarSpklHarian[] {
  const tanggal = [...new Set(perintah.map((p) => p.tanggalIso))].sort();
  const hasil: BarisDaftarSpklHarian[] = [];
  for (const t of tanggal) {
    const { ringkasan, perPemberi } = susunRekapSpklHarian(perintah, satuanKerja, t);
    if (ringkasan.jumlahPerintah > 0) hasil.push({ tanggalIso: t, ...ringkasan, perPemberi });
  }
  return hasil;
}

const PILIH_PERINTAH = {
  tanggal: true,
  uraianTugas: true,
  kepalaTim: { select: { nama: true } },
  anggota: {
    where: { terkirim: true },
    select: {
      pegawaiId: true,
      jamDiperintahkan: true,
      pegawai: { select: { nip: true, nama: true, gelarDepan: true, gelarBelakang: true, golongan: true } },
    },
  },
} as const;

type BarisDb = {
  tanggal: Date;
  uraianTugas: string;
  kepalaTim: { nama: string };
  anggota: {
    pegawaiId: string;
    jamDiperintahkan: number;
    pegawai: { nip: string; nama: string; gelarDepan: string | null; gelarBelakang: string | null; golongan: string | null };
  }[];
};

function keBarisPerintah(baris: readonly BarisDb[]): BarisPerintahHarian[] {
  return baris.map((b) => ({
    tanggalIso: isoDariTanggalUtc(b.tanggal),
    kepalaTimNama: b.kepalaTim.nama,
    uraianTugas: b.uraianTugas,
    anggota: b.anggota.map((a) => ({
      pegawaiId: a.pegawaiId,
      nip: a.pegawai.nip,
      nama: a.pegawai.nama,
      gelarDepan: a.pegawai.gelarDepan,
      gelarBelakang: a.pegawai.gelarBelakang,
      golongan: a.pegawai.golongan,
      jamDiperintahkan: a.jamDiperintahkan,
    })),
  }));
}

/**
 * Muat perintah TERKIRIM satu satker pada satu tanggal: SATU query pada
 * PerintahLembur (indeks satuanKerja+tanggal) dengan anggotanya. Pencocokan
 * satker persis, sama dengan nilai yang ditulis route kirim
 * (Pegawai.satuanKerja milik kepala tim, sudah di-trim).
 */
export async function muatRekapSpklHarian(
  db: Pick<PrismaClient, "perintahLembur">,
  satuanKerja: string,
  tanggalIso: string,
): Promise<RekapSpklHarian> {
  const [y, m, d] = tanggalIso.split("-").map(Number);
  const baris = await db.perintahLembur.findMany({
    where: { satuanKerja, status: "TERKIRIM", tanggal: new Date(Date.UTC(y, m - 1, d)) },
    orderBy: [{ dikirimPada: "asc" }, { id: "asc" }],
    select: PILIH_PERINTAH,
  });
  return susunRekapSpklHarian(keBarisPerintah(baris), satuanKerja, tanggalIso);
}

/** Daftar tanggal ber-perintah dalam satu bulan (satu query), terurut naik. */
export async function muatDaftarSpklHarian(
  db: Pick<PrismaClient, "perintahLembur">,
  satuanKerja: string,
  bulan: number,
  tahun: number,
): Promise<BarisDaftarSpklHarian[]> {
  const baris = await db.perintahLembur.findMany({
    where: {
      satuanKerja,
      status: "TERKIRIM",
      tanggal: { gte: new Date(Date.UTC(tahun, bulan - 1, 1)), lt: new Date(Date.UTC(tahun, bulan, 1)) },
    },
    select: PILIH_PERINTAH,
  });
  return susunDaftarSpklHarian(keBarisPerintah(baris), satuanKerja);
}
