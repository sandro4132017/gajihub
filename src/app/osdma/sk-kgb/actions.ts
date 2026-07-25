"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canApproveSkKgb, type AuthUser } from "../../../auth/permissions";
import type { SetujuTolakFormState } from "../SetujuTolakForm";

/**
 * Approval SK KGB (jenjang tunggal, OSDMA). SETUJU langsung meng-update
 * Pegawai.golongan ke golonganBaru + isi appliedAt/appliedBy - ini
 * melengkapi bagian yang CLAUDE.md tandai "baru schema, service layer
 * belum diimplementasikan" (langkah 1/2 skema & seed) - sekarang jadi
 * kesempatan pertama field appliedAt/appliedBy itu benar-benar dipakai,
 * konsisten dengan kolomnya yang memang disiapkan buat ini. Dicatat juga
 * ke AuditTrail (entitas "pegawai") sesuai konvensi project.
 */
export async function approveSkKgbAction(
  _state: SetujuTolakFormState,
  formData: FormData
): Promise<SetujuTolakFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const skKgbId = String(formData.get("skKgbId") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");
    if (keputusan !== "SETUJU" && keputusan !== "TOLAK") {
      return { error: "Keputusan tidak valid." };
    }

    const user = await prisma.user.findUnique({ where: { nip: akun.nip } });
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canApproveSkKgb(authUser)) {
      return { error: "Role kamu tidak berwenang memberikan approval SK KGB." };
    }

    const sk = await prisma.skKgb.findUnique({ where: { id: skKgbId }, include: { pegawai: true } });
    if (!sk) return { error: "SK KGB tidak ditemukan." };
    if (sk.status !== "DIAJUKAN") {
      return { error: `SK KGB ini berstatus ${sk.status} - tidak menunggu approval.` };
    }

    if (keputusan === "TOLAK") {
      await prisma.skKgb.update({ where: { id: sk.id }, data: { status: "DITOLAK" } });
      revalidatePath("/osdma/sk-kgb");
      return { success: `SK KGB ${sk.pegawai.nama} ditolak.` };
    }

    await prisma.$transaction([
      prisma.skKgb.update({
        where: { id: sk.id },
        data: { status: "DISETUJUI", appliedAt: new Date(), appliedBy: user.nip },
      }),
      prisma.pegawai.update({ where: { id: sk.pegawaiId }, data: { golongan: sk.golonganBaru } }),
      prisma.auditTrail.create({
        data: {
          entitas: "pegawai",
          entitasId: sk.pegawaiId,
          aksi: "UPDATE",
          aktor: user.nip,
          dataSebelum: { golongan: sk.golonganLama },
          dataSesudah: { golongan: sk.golonganBaru, sumber: "SK KGB", nomorSk: sk.nomorSk },
        },
      }),
    ]);

    revalidatePath("/osdma/sk-kgb");
    return { success: `SK KGB ${sk.pegawai.nama} disetujui - golongan diperbarui jadi ${sk.golonganBaru}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
