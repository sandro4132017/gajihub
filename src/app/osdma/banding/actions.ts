"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canApproveBandingFinal, type AuthUser } from "../../../auth/permissions";
import type { SetujuTolakFormState } from "../SetujuTolakForm";

/**
 * Approval jenjang final (2) Banding - lihat alur 2 jenjang di model Banding
 * (schema.prisma). Sama seperti verifikasiBandingJenjang1Action
 * (src/app/kasubag/banding/actions.ts): fetch ULANG User dari database,
 * bukan percaya cookie sesi, sebelum mengizinkan aksi yang mengubah data.
 */
export async function approveBandingFinalAction(
  _state: SetujuTolakFormState,
  formData: FormData
): Promise<SetujuTolakFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const bandingId = String(formData.get("bandingId") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");
    const catatan = String(formData.get("catatan") ?? "").trim();

    if (keputusan !== "SETUJU" && keputusan !== "TOLAK") {
      return { error: "Keputusan tidak valid." };
    }

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canApproveBandingFinal(authUser)) {
      return { error: "Role kamu tidak berwenang memberikan approval final banding." };
    }

    const banding = await prisma.banding.findUnique({ where: { id: bandingId }, include: { pegawai: true } });
    if (!banding) return { error: "Banding tidak ditemukan." };
    if (banding.status !== "MENUNGGU_APPROVAL_FINAL") {
      return { error: `Banding ini berstatus ${banding.status} - tidak menunggu approval final.` };
    }

    await prisma.$transaction([
      prisma.approvalLog.create({
        data: {
          referensiTipe: "BANDING",
          referensiId: banding.id,
          approverNip: user.nip,
          approverNama: user.nama,
          approverJabatan: akun.jabatan,
          jenjang: 2,
          keputusan,
          catatan: catatan || undefined,
        },
      }),
      prisma.banding.update({
        where: { id: banding.id },
        data: { status: keputusan === "SETUJU" ? "DISETUJUI" : "DITOLAK" },
      }),
    ]);

    revalidatePath("/osdma/banding");
    return { success: keputusan === "SETUJU" ? `Banding ${banding.pegawai.nama} disetujui final.` : "Banding ditolak." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
