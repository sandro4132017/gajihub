// ============================================================================
// MENYAJIKAN BUKTI KOREKSI JAM PRESENSI - dengan izin PER KOREKSI.
//
// Bukti memuat foto/tangkapan layar pegawai (wajah, geotag), jadi disimpan di
// penyimpanan privat dan tidak punya URL langsung. Yang boleh membukanya:
// lihat `canLihatBuktiKoreksiPresensi`.
//
// URL RUTE INI TIDAK BOLEH BERAKHIRAN EKSTENSI GAMBAR/FONT: matcher middleware
// membebaskan path seperti itu dari pemeriksaan sesi. Nama unduhan tidak
// memuat NIP/nama pegawai, tetapi menyebut sisinya (masuk/keluar/lembur).
// ============================================================================

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canLihatBuktiKoreksiPresensi, type AuthUser } from "@/auth/permissions";
import { jalurAman, bacaBerkasDalamAkar } from "@/lib/storage/berkasPrivat";
import { GALAT, mintaInline, responBerkas } from "@/lib/storage/responBerkas";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await ambilUserSesi();
  if (!user) return GALAT.tanpaSesi();

  const { id } = await params;

  // ?sisi=masuk|keluar|lembur; bawaan masuk (tautan lama tetap jalan).
  const sisi = new URL(req.url).searchParams.get("sisi") ?? "masuk";
  if (sisi !== "masuk" && sisi !== "keluar" && sisi !== "lembur") return GALAT.tidakAda();

  const koreksi = await prisma.koreksiPresensiHarian
    .findUnique({
      where: { id },
      select: {
        buktiRef: true,
        buktiRefKeluar: true,
        buktiRefLembur: true,
        tanggal: true,
        pegawai: { select: { nip: true, satuanKerja: true } },
      },
    })
    .catch(() => null);
  if (!koreksi) return GALAT.tidakAda();
  const ref = sisi === "masuk" ? koreksi.buktiRef : sisi === "keluar" ? koreksi.buktiRefKeluar : koreksi.buktiRefLembur;
  if (!ref) return GALAT.tidakAda();

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (
    !canLihatBuktiKoreksiPresensi(authUser, {
      nipPegawai: koreksi.pegawai.nip,
      satuanKerjaPegawai: koreksi.pegawai.satuanKerja,
    })
  ) {
    return GALAT.tanpaIzin();
  }

  // Referensi cacat atau berjenis lain (mis. bukti-dukung/tte) = "tidak ada".
  const jalur = jalurAman(ref, "bukti-koreksi");
  if (!jalur) return GALAT.tidakAda();

  let isi: Buffer;
  try {
    isi = await bacaBerkasDalamAkar(jalur, "bukti-koreksi");
  } catch {
    return GALAT.tidakAda();
  }

  const ekstensi = ref.includes(".") ? ref.slice(ref.lastIndexOf(".")) : "";
  const nama = `bukti-koreksi-presensi-${sisi}-${koreksi.tanggal.toISOString().slice(0, 10)}${ekstensi}`;
  return responBerkas(isi, nama, mintaInline(new URL(req.url)));
}
