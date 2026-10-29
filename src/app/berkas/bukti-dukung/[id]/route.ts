// ============================================================================
// MENYAJIKAN BERKAS BUKTI DUKUNG BANDING - dengan izin PER DOKUMEN.
//
// Bukti dukung berisi dokumen pribadi pegawai (SK, surat sakit), jadi tidak
// disimpan di `public/` dan tidak punya URL langsung. Sesi saja tidak cukup:
// yang boleh membukanya hanya pihak yang memang berurusan dengan banding itu
// (lihat `canLihatBuktiDukung`).
//
// URL RUTE INI TIDAK BOLEH BERAKHIRAN EKSTENSI GAMBAR/FONT: matcher middleware
// membebaskan path seperti itu dari pemeriksaan sesi.
// ============================================================================

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canLihatBuktiDukung, type AuthUser } from "@/auth/permissions";
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

  const bukti = await prisma.buktiDukung
    .findUnique({
      where: { id },
      select: {
        namaFile: true,
        fileUrl: true,
        banding: {
          select: {
            pengaju: { select: { nip: true } },
            pegawai: { select: { satuanKerja: true } },
          },
        },
      },
    })
    .catch(() => null);
  if (!bukti) return GALAT.tidakAda();

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (
    !canLihatBuktiDukung(authUser, {
      pengajuNip: bukti.banding.pengaju.nip,
      satuanKerjaPegawai: bukti.banding.pegawai.satuanKerja,
    })
  ) {
    return GALAT.tanpaIzin();
  }

  // Baris seed menyimpan URL palsu (`https://placeholder.local/...`) dan
  // referensi cacat lain: ditolak sebagai "tidak ada", tanpa menyentuh disk.
  const jalur = jalurAman(bukti.fileUrl, "bukti-dukung");
  if (!jalur) return GALAT.tidakAda();

  let isi: Buffer;
  try {
    isi = await bacaBerkasDalamAkar(jalur, "bukti-dukung");
  } catch {
    return GALAT.tidakAda();
  }

  return responBerkas(isi, bukti.namaFile, mintaInline(new URL(req.url)));
}
