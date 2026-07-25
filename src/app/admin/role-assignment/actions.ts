"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../../auth/permissions";

export interface UbahAssignmentRoleFormState {
  error?: string;
  success?: string;
}

const ROLE_VALID: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

/**
 * Kelola assignment role LANGSUNG (canKelolaAssignmentRole) - BEDA dari
 * eksekusi usulan PPABP (canEksekusiPerubahanRole, lihat
 * ../usulan-role/actions.ts): ini jalur pintas Admin buat ubah role/
 * satuanKerja/status aktif akun langsung TANPA lewat UsulanPerubahanRole,
 * dipakai buat kebutuhan administratif (nonaktifkan akun, koreksi
 * kesalahan input, dst) - bukan alur "usul-lalu-eksekusi" yang formal.
 * TIDAK membuat baris UsulanPerubahanRole ataupun approval log - cuma
 * dicatat ke AuditTrail buat jejak.
 */
export async function ubahAssignmentRoleAction(
  _state: UbahAssignmentRoleFormState,
  formData: FormData
): Promise<UbahAssignmentRoleFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const admin = await prisma.user.findUnique({ where: { nip: akun.nip } });
    if (!admin) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: admin.nip, role: admin.role, satuanKerja: admin.satuanKerja, aktif: admin.aktif };
    if (!canKelolaAssignmentRole(authUser)) {
      return { error: "Role kamu tidak berwenang mengelola assignment role." };
    }

    const targetUserId = String(formData.get("targetUserId") ?? "");
    const role = String(formData.get("role") ?? "") as Role;
    const satuanKerjaRaw = String(formData.get("satuanKerja") ?? "").trim();
    const aktif = formData.get("aktif") === "on";

    if (!targetUserId || !ROLE_VALID.includes(role)) {
      return { error: "Akun dan role tujuan wajib diisi dengan benar." };
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return { error: "Akun tidak ditemukan." };

    const dataSebelum = { role: target.role, satuanKerja: target.satuanKerja, aktif: target.aktif };
    const satuanKerja = role === "KASUBAG_TU" ? satuanKerjaRaw || target.satuanKerja : null;

    await prisma.$transaction([
      prisma.user.update({ where: { id: targetUserId }, data: { role, satuanKerja, aktif } }),
      prisma.auditTrail.create({
        data: {
          entitas: "app_user",
          entitasId: targetUserId,
          aksi: "UPDATE",
          aktor: admin.nip,
          dataSebelum,
          dataSesudah: { role, satuanKerja, aktif, sumber: "Kelola assignment role (Admin)" },
        },
      }),
    ]);

    revalidatePath("/admin/role-assignment");
    return { success: `Assignment role ${target.nama} diperbarui jadi ${role}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
