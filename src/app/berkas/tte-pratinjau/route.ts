// ============================================================================
// PRATINJAU DRAFT SPTJM yang belum punya baris di database.
//
// Letak berkas DIHITUNG ULANG di server dari jenis + periode + unit, memakai
// fungsi penamaan yang sama dengan pembuatnya - nama berkas tidak pernah
// diambil dari URL. Izinnya `canLihatDokumenSptjm` atas unit yang diminta.
//
// URL TIDAK BOLEH berakhiran ekstensi gambar/font (matcher middleware).
// ============================================================================

import type { NextRequest } from "next/server";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canLihatDokumenSptjm, type AuthUser } from "@/auth/permissions";
import { jalurAman, kunciPratinjauTte, bacaBerkasDalamAkar } from "@/lib/storage/berkasPrivat";
import { GALAT, mintaInline, responBerkas, responTeks } from "@/lib/storage/responBerkas";
import { generateNamaFileSptjm, type JenisSptjm } from "@/lib/tte/sptjmTypes";

export const dynamic = "force-dynamic";

const JENIS_SPTJM: readonly JenisSptjm[] = ["SPTJM_TUKIN", "SPTJM_UANG_MAKAN", "SPTJM_LEMBUR"];

export async function GET(req: NextRequest) {
  const user = await ambilUserSesi();
  if (!user) return GALAT.tanpaSesi();

  const q = new URL(req.url).searchParams;
  const jenis = q.get("jenis") ?? "";
  const bulan = Number(q.get("bulan"));
  const tahun = Number(q.get("tahun"));
  const satker = (q.get("satker") ?? "").trim();

  if (!(JENIS_SPTJM as readonly string[]).includes(jenis) || !satker) {
    return responTeks(400, "Permintaan pratinjau tidak lengkap.");
  }

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (!canLihatDokumenSptjm(authUser, satker)) return GALAT.tanpaIzin();

  let jalur: string | null;
  let nama: string;
  try {
    nama = generateNamaFileSptjm(jenis as JenisSptjm, bulan, tahun, satker);
    jalur = jalurAman(kunciPratinjauTte(satker, tahun, bulan, nama), "tte");
  } catch {
    // Periode di luar rentang sah.
    return responTeks(400, "Permintaan pratinjau tidak lengkap.");
  }
  if (!jalur) return GALAT.tidakAda();

  let isi: Buffer;
  try {
    isi = await bacaBerkasDalamAkar(jalur, "tte");
  } catch {
    return GALAT.tidakAda();
  }

  return responBerkas(isi, `Draft - ${nama}`, mintaInline(new URL(req.url)));
}
