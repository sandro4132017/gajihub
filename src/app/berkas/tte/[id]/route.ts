// ============================================================================
// MENYAJIKAN PDF SPTJM (draft atau bertanda tangan) kepada yang berwenang.
//
// Isinya agregasi nominal unit, jadi tidak punya URL langsung. Izinnya
// `canLihatDokumenSptjm` terhadap unit pada baris dokumen - bukan unit yang
// dikirim klien. Dokumen TERTANDATANGANI yang diperiksa publik lewat
// /tte/verify/[id]/berkas adalah rute lain dan tidak terpengaruh.
//
// URL TIDAK BOLEH berakhiran ekstensi gambar/font (matcher middleware).
// ============================================================================

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canLihatDokumenLembur, canLihatDokumenSptjm, type AuthUser } from "@/auth/permissions";
import { apakahJenisLembur } from "@/lib/tte/lemburTypes";
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

  const dokumen = await prisma.dokumenTte
    .findUnique({
      where: { id },
      select: {
        jenisDokumen: true,
        penandatanganNip: true,
        status: true,
        satuanKerja: true,
        fileDraftPath: true,
        fileSignedPath: true,
      },
    })
    .catch(() => null);
  if (!dokumen) return GALAT.tidakAda();

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  // Dokumen lembur punya aturan sendiri (penandatangan boleh mengunduh
  // suratnya); jenis lainnya memakai izin SPTJM seperti sebelumnya.
  const boleh = apakahJenisLembur(dokumen.jenisDokumen)
    ? canLihatDokumenLembur(authUser, {
        jenis: dokumen.jenisDokumen,
        satuanKerja: dokumen.satuanKerja,
        penandatanganNip: dokumen.penandatanganNip,
      })
    : canLihatDokumenSptjm(authUser, dokumen.satuanKerja);
  if (!boleh) return GALAT.tanpaIzin();

  // Yang sudah tertandatangani menyajikan berkas bertanda tangan; selain itu draft.
  const ref =
    dokumen.status === "TERTANDATANGANI" && dokumen.fileSignedPath
      ? dokumen.fileSignedPath
      : dokumen.fileDraftPath;
  if (!ref) return GALAT.tidakAda();

  const jalur = jalurAman(ref, "tte");
  if (!jalur) return GALAT.tidakAda();

  let isi: Buffer;
  try {
    isi = await bacaBerkasDalamAkar(jalur, "tte");
  } catch {
    return GALAT.tidakAda();
  }

  const nama = jalur.split(/[\\/]/).pop() ?? "SPTJM.pdf";
  return responBerkas(isi, nama, mintaInline(new URL(req.url)));
}
