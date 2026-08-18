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
 * Lembur) - role lintas unit (PPABP, ADMIN) WAJIB pilih unit dulu lewat
 * filter/SatkerPicker sebelum bisa lihat data.
 *
 * Fungsi ini SENGAJA tidak mengecek role: yang menentukan boleh-tidaknya
 * adalah fungsi izin di tiap halaman (mis. canAjukanKalkulasiTukinMassalUnit
 * di /kasubag/kalkulasi, yang sejak 2026-08-06 juga mengizinkan PPABP). Kalau
 * gate role ditaruh di sini, menambah role baru ke satu halaman akan
 * membukanya untuk SELURUH halaman di bawah /kasubag sekaligus.
 */
export async function ambilAksesUnit(satkerDariQuery: string | undefined): Promise<AksesUnit | null> {
  const akun = await getSessionAccount();
  if (!akun) return null;
  const authUser: AuthUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  return { authUser, satkerEfektif: resolveSatkerEfektif(authUser, satkerDariQuery) };
}
