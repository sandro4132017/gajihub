"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canEksekusiPerubahanRole, type AuthUser } from "../../../auth/permissions";

export interface EksekusiUsulanFormState {
  error?: string;
  success?: string;
}

/**
 * Eksekusi FINAL usulan perubahan role dari PPABP (canEksekusiPerubahanRole
 * - SENGAJA cuma ADMIN, TANPA bypass PPABP, lihat komentar di
 * permissions.ts). EKSEKUSI beneran mengubah User.role, TOLAK cuma ubah
 * status usulan, User.role tidak disentuh.
 */
export async function eksekusiUsulanRoleAction(
  _state: EksekusiUsulanFormState,
  formData: FormData
): Promise<EksekusiUsulanFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const admin = await ambilUserSesi();
    if (!admin) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: admin.nip, role: admin.role, satuanKerja: admin.satuanKerja, aktif: admin.aktif };
    if (!canEksekusiPerubahanRole(authUser)) {
      return { error: "Role kamu tidak berwenang mengeksekusi usulan perubahan role." };
    }

    const usulanId = String(formData.get("usulanId") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");
    if (keputusan !== "EKSEKUSI" && keputusan !== "TOLAK") {
      return { error: "Keputusan tidak valid." };
    }

    const usulan = await prisma.usulanPerubahanRole.findUnique({ where: { id: usulanId }, include: { user: true } });
    if (!usulan) return { error: "Usulan tidak ditemukan." };
    if (usulan.status !== "MENUNGGU") {
      return { error: `Usulan ini berstatus ${usulan.status} - sudah diputuskan sebelumnya.` };
    }

    if (keputusan === "TOLAK") {
      await prisma.usulanPerubahanRole.update({
        where: { id: usulanId },
        data: { status: "DITOLAK", diputuskanOlehId: admin.id, diputuskanPada: new Date() },
      });
      revalidatePath("/admin/usulan-role");
      return { success: `Usulan perubahan role ${usulan.user.nama} ditolak.` };
    }

    await prisma.$transaction([
      prisma.usulanPerubahanRole.update({
        where: { id: usulanId },
        data: { status: "DIEKSEKUSI", diputuskanOlehId: admin.id, diputuskanPada: new Date() },
      }),
      prisma.user.update({ where: { id: usulan.userId }, data: { role: usulan.roleDiusulkan } }),
      prisma.auditTrail.create({
        data: {
          entitas: "app_user",
          entitasId: usulan.userId,
          aksi: "UPDATE",
          aktor: admin.nip,
          dataSebelum: { role: usulan.roleSaatIni },
          dataSesudah: { role: usulan.roleDiusulkan, sumber: "Eksekusi Usulan Perubahan Role", usulanId },
        },
      }),
    ]);

    revalidatePath("/admin/usulan-role");
    return { success: `Role ${usulan.user.nama} berhasil diubah jadi ${usulan.roleDiusulkan}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
