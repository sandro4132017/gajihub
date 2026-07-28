"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canApproveSkHukumanDisiplin, type AuthUser } from "../../../auth/permissions";
import type { SetujuTolakFormState } from "../SetujuTolakForm";

/**
 * TODO(confirm) BESAR: sama seperti canInputSkHukumanDisiplin (Kasubag TU
 * side) - alur approval OSDMA untuk SK Hukuman Disiplin ini ASUMSI dari
 * spesifikasi simulasi, BELUM konfirmasi resmi. Approval di sini CUMA
 * mengubah status baris SkHukumanDisiplin - TIDAK ada efek potongan Tukin
 * otomatis (Pasal 15 belum diimplementasi di business-logic/tukin.ts).
 */
export async function approveSkHukdisAction(
  _state: SetujuTolakFormState,
  formData: FormData
): Promise<SetujuTolakFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const skId = String(formData.get("skId") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");
    if (keputusan !== "SETUJU" && keputusan !== "TOLAK") {
      return { error: "Keputusan tidak valid." };
    }

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canApproveSkHukumanDisiplin(authUser)) {
      return { error: "Role kamu tidak berwenang memberikan approval SK Hukuman Disiplin." };
    }

    const sk = await prisma.skHukumanDisiplin.findUnique({ where: { id: skId }, include: { pegawai: true } });
    if (!sk) return { error: "SK Hukuman Disiplin tidak ditemukan." };
    if (sk.status !== "DIAJUKAN") {
      return { error: `SK ini berstatus ${sk.status} - tidak menunggu approval.` };
    }

    await prisma.skHukumanDisiplin.update({
      where: { id: sk.id },
      data: { status: keputusan === "SETUJU" ? "DISETUJUI" : "DITOLAK" },
    });

    revalidatePath("/osdma/sk-hukuman-disiplin");
    return { success: keputusan === "SETUJU" ? `SK Hukuman Disiplin ${sk.pegawai.nama} disetujui.` : "SK Hukuman Disiplin ditolak." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
