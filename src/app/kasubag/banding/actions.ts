"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canVerifikasiBandingJenjang1, type AuthUser } from "../../../auth/permissions";

export interface VerifikasiBandingFormState {
  error?: string;
  success?: string;
}

/**
 * Verifikasi jenjang 1 (Kasubag TU) atas Banding pegawai unitnya. SETUJU ->
 * status "MENUNGGU_APPROVAL_FINAL" (lanjut ke OSDMA), TOLAK -> status
 * "DITOLAK" (selesai, tidak lanjut). Sama seperti approval Tukin/Uang
 * Makan/Uang Lembur, fetch ULANG User dari database (bukan percaya cookie
 * sesi) sebelum mengizinkan aksi yang mengubah data.
 */
export async function verifikasiBandingJenjang1Action(
  _state: VerifikasiBandingFormState,
  formData: FormData
): Promise<VerifikasiBandingFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) {
      return { error: "Sesi login sudah habis - silakan login ulang." };
    }

    const bandingId = String(formData.get("bandingId") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");
    const catatan = String(formData.get("catatan") ?? "").trim();

    if (keputusan !== "SETUJU" && keputusan !== "TOLAK") {
      return { error: "Keputusan tidak valid." };
    }

    const user = await ambilUserSesi();
    if (!user) {
      return { error: "Akun tidak terdaftar sebagai User." };
    }
    const authUser: AuthUser = {
      nip: user.nip,
      role: user.role,
      satuanKerja: user.satuanKerja,
      aktif: user.aktif,
    };

    const banding = await prisma.banding.findUnique({
      where: { id: bandingId },
      include: { pegawai: true, pengaju: true },
    });
    if (!banding) {
      return { error: "Banding tidak ditemukan." };
    }
    if (banding.status !== "DIAJUKAN") {
      return { error: `Banding ini sudah berstatus ${banding.status} - tidak bisa diverifikasi lagi di jenjang 1.` };
    }
    if (!canVerifikasiBandingJenjang1(authUser, { pengajuNip: banding.pengaju.nip, satuanKerjaPegawai: banding.pegawai.satuanKerja })) {
      return { error: "Role kamu tidak berwenang memverifikasi banding ini." };
    }

    await prisma.$transaction([
      prisma.approvalLog.create({
        data: {
          referensiTipe: "BANDING",
          referensiId: banding.id,
          approverNip: user.nip,
          approverNama: user.nama,
          approverJabatan: akun.jabatan,
          jenjang: 1,
          keputusan,
          catatan: catatan || undefined,
        },
      }),
      prisma.banding.update({
        where: { id: banding.id },
        data: { status: keputusan === "SETUJU" ? "MENUNGGU_APPROVAL_FINAL" : "DITOLAK" },
      }),
    ]);

    revalidatePath("/kasubag/banding");
    return { success: keputusan === "SETUJU" ? "Banding disetujui, diteruskan ke OSDMA." : "Banding ditolak." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
