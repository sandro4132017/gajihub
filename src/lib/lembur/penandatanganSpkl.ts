// Penanda tangan SPKL harian = Kepala Biro satker itu (keputusan user
// 2026-11-20, mengikuti template SPKL). Diambil dari tabel Pegawai, tidak
// ditulis di kode. Tepat SATU kandidat -> dipakai; nol atau lebih dari satu
// -> null dan dokumen mencetak garis titik-titik (tidak menebak, termasuk
// Plt/Plh). Jangan mencatat nama/NIP ke log.

import type { PrismaClient } from "@prisma/client";
import { namaBergelarSpkl } from "../../business-logic/namaPegawai";
import { pegawaiBukanUji } from "../dataUji";

export interface KandidatKepalaBiro {
  nip: string;
  nama: string;
  gelarDepan?: string | null;
  gelarBelakang?: string | null;
  jabatan: string | null;
}

export interface KepalaBiro {
  nama: string;
  nip: string;
}

/** Jabatan berawalan "Kepala Biro" (huruf besar/kecil diabaikan). Plt/Plh tidak lolos. */
export function jabatanKepalaBiro(jabatan: string | null | undefined): boolean {
  return /^kepala\s+biro\b/i.test((jabatan ?? "").trim());
}

/** Tepat satu Kepala Biro -> {nama, nip}; selain itu null. */
export function pilihKepalaBiro(kandidat: readonly KandidatKepalaBiro[]): KepalaBiro | null {
  const cocok = kandidat.filter((k) => jabatanKepalaBiro(k.jabatan));
  if (cocok.length !== 1) return null;
  const k = cocok[0];
  return {
    nama: namaBergelarSpkl(k), // bergelar: keputusan user 2026-11-20
    nip: k.nip,
  };
}

/** Pembaca: pegawai AKTIF satker itu, bukan data uji, jabatan diawali "Kepala Biro". */
export async function muatKepalaBiro(
  db: Pick<PrismaClient, "pegawai">,
  satuanKerja: string,
): Promise<KepalaBiro | null> {
  const baris = await db.pegawai.findMany({
    where: {
      statusPegawai: "AKTIF",
      satuanKerja,
      ...pegawaiBukanUji(satuanKerja),
      jabatan: { startsWith: "Kepala Biro", mode: "insensitive" },
    },
    select: { nip: true, nama: true, gelarDepan: true, gelarBelakang: true, jabatan: true },
  });
  return pilihKepalaBiro(baris);
}
