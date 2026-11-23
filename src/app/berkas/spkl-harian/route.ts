// ============================================================================
// BUKA SPKL HARIAN (PDF dibentuk on-the-fly, tanpa TTE).
//
// Satu dokumen per (satker, tanggal): semua perintah lembur TERKIRIM hari itu
// dari semua pemberi perintah. Tidak ada berkas tersimpan; PDF disusun dari
// database pada tiap permintaan, jadi isinya selalu sama dengan halaman SPKL
// Harian. Boleh dibuka KAPAN SAJA: sebelum batas 15.00 WIB + tenggang
// (spklHarianSiap) dokumen berlabel SEMENTARA di tiap halaman dan nama
// berkasnya berakhiran -SEMENTARA karena isinya masih bisa bertambah;
// sesudahnya final. Selalu inline dan no-store.
//
// Urutan: sesi (401) -> tanggal sah (400) -> satker + izin
// `canLihatPerintahLemburUnit` (403) -> gerbang pilot (404) -> ada perintah
// (404) -> PDF.
// Satker Kasubag TU DIKUNCI ke akunnya; `?satker=` hanya dibaca untuk role
// lintas-unit (PPABP/ADMIN), pola sama dengan halaman /kasubag/spkl.
// PIMPINAN: satker diambil dari tabel Pegawai lewat NIP dan `?satker=`
// diabaikan (pengecualian lembur user 2026-11-20); tanpa baris Pegawai -> 403.
// KEPALA_TIM dan PEGAWAI tidak boleh membuka.
//
// URL TIDAK BOLEH berakhiran ekstensi gambar/font (matcher middleware).
// ============================================================================

import type { NextRequest } from "next/server";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canLihatPerintahLemburUnit, type AuthUser } from "@/auth/permissions";
import { spklHarianSiap } from "@/business-logic/perintahLembur";
import { resolveSatkerEfektif } from "@/app/dashboardScope";
import { spklAktifDataUntuk, spklAktifUntuk } from "@/lib/lembur/gerbangSpkl";
import { muatKepalaBiro } from "@/lib/lembur/penandatanganSpkl";
import { muatRekapSpklHarian } from "@/lib/lembur/rekapSpklHarian";
import { prisma } from "@/lib/prisma";
import { GALAT, responBerkas, responTeks } from "@/lib/storage/responBerkas";
import { generateNamaFileSpklHarian, generateNomorSpklHarianDefault } from "@/lib/tte/lemburTypes";
import { generateSpklHarianPdf } from "@/lib/tte/spklHarianPdf";

export const dynamic = "force-dynamic";

const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function tanggalSah(iso: string): boolean {
  if (!FORMAT_TANGGAL.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export async function GET(req: NextRequest) {
  const user = await ambilUserSesi();
  if (!user) return GALAT.tanpaSesi();

  const url = new URL(req.url);
  const tanggal = (url.searchParams.get("tanggal") ?? "").trim();
  if (!tanggalSah(tanggal)) return responTeks(400, "Tanggal SPKL tidak valid.");

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  let satkerPegawaiAkun: string | null = null;
  let satker: string;
  if (authUser.role === "PIMPINAN") {
    const pegawai = await prisma.pegawai.findUnique({ where: { nip: authUser.nip }, select: { satuanKerja: true } });
    satkerPegawaiAkun = pegawai?.satuanKerja?.trim() || null;
    if (!satkerPegawaiAkun) return GALAT.tanpaIzin();
    satker = satkerPegawaiAkun;
  } else {
    satker = (resolveSatkerEfektif(authUser, url.searchParams.get("satker")?.trim() || undefined) ?? "").trim();
  }
  if (!satker) {
    // Role lintas-unit yang belum memilih unit: permintaan kurang lengkap.
    // Role lain tidak diberi tahu apa pun selain penolakan.
    return authUser.role === "PPABP" || authUser.role === "ADMIN"
      ? responTeks(400, "Satuan kerja wajib dipilih.")
      : GALAT.tanpaIzin();
  }
  if (!canLihatPerintahLemburUnit(authUser, satker, satkerPegawaiAkun)) return GALAT.tanpaIzin();

  if (!spklAktifUntuk(satker, tanggal)) return GALAT.tidakAda();
  const sementara = !spklHarianSiap(tanggal, new Date());

  const rekap = await muatRekapSpklHarian(prisma, satker, tanggal);
  if (rekap.baris.length === 0) return GALAT.tidakAda();
  const dataSatker = spklAktifDataUntuk(satker);
  const kepalaBiro = await muatKepalaBiro(prisma, satker);

  const pdf = await generateSpklHarianPdf({
    nomorDokumen: generateNomorSpklHarianDefault(tanggal),
    tanggalIso: tanggal,
    satuanKerja: satker,
    namaSingkat: dataSatker?.namaSingkat,
    jabatanPenandatangan: dataSatker?.jabatanPenandatangan,
    baris: rekap.baris,
    kepalaBiro,
    tanpaTte: true,
    sementara,
  });
  return responBerkas(pdf, generateNamaFileSpklHarian(tanggal, satker, sementara), true);
}
