import { getSessionAccount } from "../../auth/getSessionAccount";
import { resolveSatkerEfektif } from "../dashboardScope";
import type { AuthUser } from "../../auth/permissions";

export interface AksesUnit {
  authUser: AuthUser;
  /** undefined kalau role lintas-satker (ADMIN dkk) belum milih unit lewat ?satker=. */
  satkerEfektif: string | undefined;
}

/**
 * Resolusi identitas + satuan kerja efektif buat semua halaman di bawah
 * src/app/kasubag/. KASUBAG_TU otomatis di-scope ke satuanKerja-nya sendiri
 * (resolveSatkerEfektif, sama pola dengan dashboard Tukin/Uang Makan/Uang
 * Lembur) - ADMIN (privilege lintas unit) WAJIB pilih unit dulu lewat
 * SatkerPicker sebelum bisa lihat data.
 */
export async function ambilAksesUnit(satkerDariQuery: string | undefined): Promise<AksesUnit | null> {
  const akun = await getSessionAccount();
  if (!akun) return null;
  const authUser: AuthUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  return { authUser, satkerEfektif: resolveSatkerEfektif(authUser, satkerDariQuery) };
}
