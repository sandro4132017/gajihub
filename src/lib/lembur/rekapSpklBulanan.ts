// Rekap SPKL BULANAN satu satuan kerja: semua perintah lembur harian yang
// TERKIRIM pada bulan itu, disusun jadi lampiran (NO, NAMA/NIP, GOL, TANGGAL,
// KETERANGAN). Bagian penyusunan (`susunRekapSpkl`) murni; pemuatnya
// (`muatRekapSpkl`) hanya membaca database Gajihub.
//
// HANYA perintah berstatus TERKIRIM yang sah (lihat PerintahLembur): baris
// DRAFT/GAGAL tidak pernah masuk. Perintah bertanggal di luar bulan atau di
// luar gerbang pilot (gerbangSpkl) dibuang lagi di sini sebagai pertahanan
// kedua, karena hasilnya dicetak di dokumen resmi.

import type { PrismaClient } from "@prisma/client";
import { namaCetakPegawai } from "../../business-logic/namaPegawai";
import type { AnggotaSpkl } from "../tte/spklBulananPdf";
import { spklAktifUntuk } from "./gerbangSpkl";
import { isoDariTanggalUtc } from "./perintahPeriode";

export interface BarisAnggotaPerintah {
  pegawaiId: string;
  nip: string;
  nama: string;
  golongan: string | null;
  jamDiperintahkan: number;
}

export interface BarisPerintahRekap {
  /** Tanggal lembur ISO YYYY-MM-DD. */
  tanggalIso: string;
  uraianTugas: string;
  dikirimPada: Date | null;
  anggota: readonly BarisAnggotaPerintah[];
}

export interface RingkasanRekapSpkl {
  jumlahPerintah: number;
  jumlahPegawai: number;
  /** Banyaknya tanggal berbeda yang punya perintah. */
  jumlahHari: number;
  /** Jumlah jam yang DIPERINTAHKAN (bukan jam nyata). */
  totalJam: number;
}

export interface RekapSpklBulanan {
  /** Terurut nama lalu NIP; siap diberikan ke generateSpklBulananPdf. */
  anggota: AnggotaSpkl[];
  ringkasan: RingkasanRekapSpkl;
  /** Waktu kirim tiap perintah yang masuk; bahan peringatan "terkirim sesudah SPKL ditandatangani". */
  waktuKirim: Date[];
}

export function susunRekapSpkl(
  perintah: readonly BarisPerintahRekap[],
  satuanKerja: string,
  bulan: number,
  tahun: number,
): RekapSpklBulanan {
  const awalan = `${tahun}-${String(bulan).padStart(2, "0")}-`;
  const perPegawai = new Map<
    string,
    { nip: string; nama: string; golongan: string; entri: { tanggal: number; uraian: string }[] }
  >();
  const hari = new Set<string>();
  const waktuKirim: Date[] = [];
  let jumlahPerintah = 0;
  let totalJam = 0;

  const urut = [...perintah].sort((a, b) => a.tanggalIso.localeCompare(b.tanggalIso));
  for (const p of urut) {
    if (!p.tanggalIso.startsWith(awalan)) continue;
    if (!spklAktifUntuk(satuanKerja, p.tanggalIso)) continue;
    if (p.anggota.length === 0) continue;
    jumlahPerintah++;
    hari.add(p.tanggalIso);
    if (p.dikirimPada) waktuKirim.push(p.dikirimPada);
    const tanggal = Number(p.tanggalIso.slice(8, 10));
    for (const a of p.anggota) {
      totalJam += a.jamDiperintahkan;
      let sudah = perPegawai.get(a.pegawaiId);
      if (!sudah) {
        sudah = {
          nip: a.nip,
          nama: namaCetakPegawai({ nama: a.nama }),
          golongan: a.golongan?.trim() || "-",
          entri: [],
        };
        perPegawai.set(a.pegawaiId, sudah);
      }
      sudah.entri.push({ tanggal, uraian: p.uraianTugas });
    }
  }

  const anggota: AnggotaSpkl[] = [...perPegawai.values()]
    .sort((x, y) => x.nama.localeCompare(y.nama, "id") || x.nip.localeCompare(y.nip))
    .map((p) => ({ nip: p.nip, nama: p.nama, golongan: p.golongan, entri: p.entri }));

  return {
    anggota,
    ringkasan: { jumlahPerintah, jumlahPegawai: anggota.length, jumlahHari: hari.size, totalJam },
    waktuKirim,
  };
}

/** Berapa perintah yang terkirim SESUDAH `signedAt`, yaitu tidak termuat di SPKL yang sudah ditandatangani. */
export function jumlahPerintahSesudah(waktuKirim: readonly Date[], signedAt: Date): number {
  return waktuKirim.filter((w) => w.getTime() > signedAt.getTime()).length;
}

/** Ambil `jumlahPerintah` dari AuditTrail.dataSesudah SPKL bulanan; null bila tidak ada/bukan angka. */
export function jumlahPerintahDiAudit(dataSesudah: unknown): number | null {
  if (typeof dataSesudah !== "object" || dataSesudah === null) return null;
  const n = (dataSesudah as Record<string, unknown>).jumlahPerintah;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Berapa perintah yang TIDAK termuat di SPKL yang sudah ditandatangani.
 *
 * Pembanding utama = jumlah perintah yang tercatat saat rekap dimuat
 * (AuditTrail): tepat walau perintah terkirim selama BSrE menjawab. Rekap
 * dimuat SEBELUM pemeriksaan sertifikat dan pembuatan PDF, sedangkan
 * DokumenTte.createdAt baru ada sesudahnya, jadi perintah yang terkirim di
 * antara keduanya lolos bila hanya memakai waktu. Perintah tidak pernah
 * dihapus, jadi selisih jumlah aman. Tanpa catatan audit (gagal ditulis),
 * jatuh ke perbandingan waktu terhadap `dokumenDibuat`.
 */
export function perintahTidakTermuat(opsi: {
  waktuKirim: readonly Date[];
  jumlahSaatIni: number;
  jumlahDiDokumen: number | null;
  dokumenDibuat: Date;
}): number {
  if (opsi.jumlahDiDokumen !== null) return Math.max(0, opsi.jumlahSaatIni - opsi.jumlahDiDokumen);
  return jumlahPerintahSesudah(opsi.waktuKirim, opsi.dokumenDibuat);
}

/**
 * Muat perintah TERKIRIM satu satker dalam satu bulan: SATU query pada
 * PerintahLembur (indeks satuanKerja+tanggal) dengan anggotanya.
 * Pencocokan satker persis, sama dengan nilai yang ditulis route kirim
 * (Pegawai.satuanKerja milik kepala tim, sudah di-trim).
 */
export async function muatRekapSpkl(
  db: Pick<PrismaClient, "perintahLembur">,
  satuanKerja: string,
  bulan: number,
  tahun: number,
): Promise<RekapSpklBulanan> {
  const baris = await db.perintahLembur.findMany({
    where: {
      satuanKerja,
      status: "TERKIRIM",
      tanggal: { gte: new Date(Date.UTC(tahun, bulan - 1, 1)), lt: new Date(Date.UTC(tahun, bulan, 1)) },
    },
    select: {
      tanggal: true,
      uraianTugas: true,
      dikirimPada: true,
      anggota: {
        where: { terkirim: true },
        select: {
          pegawaiId: true,
          jamDiperintahkan: true,
          pegawai: { select: { nip: true, nama: true, golongan: true } },
        },
      },
    },
  });
  return susunRekapSpkl(
    baris.map((b) => ({
      tanggalIso: isoDariTanggalUtc(b.tanggal),
      uraianTugas: b.uraianTugas,
      dikirimPada: b.dikirimPada,
      anggota: b.anggota.map((a) => ({
        pegawaiId: a.pegawaiId,
        nip: a.pegawai.nip,
        nama: a.pegawai.nama,
        golongan: a.pegawai.golongan,
        jamDiperintahkan: a.jamDiperintahkan,
      })),
    })),
    satuanKerja,
    bulan,
    tahun,
  );
}
