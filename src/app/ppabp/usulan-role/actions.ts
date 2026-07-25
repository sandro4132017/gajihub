"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUsulkanPerubahanRole, type AuthUser } from "../../../auth/permissions";

export interface UsulkanPerubahanRoleFormState {
  error?: string;
  success?: string;
}

const ROLE_VALID: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

/**
 * PPABP MENGUSULKAN perubahan role - BUKAN eksekusi (itu wewenang ADMIN,
 * lihat canEksekusiPerubahanRole & UsulanPerubahanRole di schema.prisma).
 * Baris ini cuma dibuat status "MENUNGGU", tidak mengubah User.role sama
 * sekali sampai ADMIN memutuskan (langkah 4e).
 */
export async function usulkanPerubahanRoleAction(
  _state: UsulkanPerubahanRoleFormState,
  formData: FormData
): Promise<UsulkanPerubahanRoleFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await prisma.user.findUnique({ where: { nip: akun.nip } });
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canUsulkanPerubahanRole(authUser)) {
      return { error: "Role kamu tidak berwenang mengusulkan perubahan role." };
    }

    const targetUserId = String(formData.get("targetUserId") ?? "");
    const roleDiusulkan = String(formData.get("roleDiusulkan") ?? "") as Role;
    const alasan = String(formData.get("alasan") ?? "").trim();

    if (!targetUserId || !ROLE_VALID.includes(roleDiusulkan)) {
      return { error: "Pilih akun dan role tujuan yang valid." };
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return { error: "Akun tujuan tidak ditemukan." };
    if (targetUser.role === roleDiusulkan) {
      return { error: `Akun ini sudah berrole ${roleDiusulkan}.` };
    }

    await prisma.usulanPerubahanRole.create({
      data: {
        userId: targetUser.id,
        roleSaatIni: targetUser.role,
        roleDiusulkan,
        alasan: alasan || undefined,
        diusulkanOlehId: user.id,
        status: "MENUNGGU",
      },
    });

    revalidatePath("/ppabp/usulan-role");
    return { success: `Usulan perubahan role ${targetUser.nama} -> ${roleDiusulkan} tersimpan, menunggu keputusan Admin.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
