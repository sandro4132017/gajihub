"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canInputSkHukumanDisiplin, type AuthUser } from "../../../auth/permissions";

export interface InputSkHukdisFormState {
  error?: string;
  success?: string;
}

/**
 * TODO(confirm) BESAR: alur approval OSDMA untuk SK Hukuman Disiplin ini
 * ASUMSI dari spesifikasi simulasi, BELUM konfirmasi resmi ke OSDMA/Biro
 * Hukum - lihat komentar panjang di model SkHukumanDisiplin (schema.prisma)
 * dan canInputSkHukumanDisiplin (permissions.ts).
 */
export async function inputSkHukdisAction(
  _state: InputSkHukdisFormState,
  formData: FormData
): Promise<InputSkHukdisFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const nomorSk = String(formData.get("nomorSk") ?? "").trim();
    const tanggalSk = String(formData.get("tanggalSk") ?? "");
    const jenisHukuman = String(formData.get("jenisHukuman") ?? "").trim();
    const keterangan = String(formData.get("keterangan") ?? "").trim();
    const periodeMulaiBulan = Number(formData.get("periodeMulaiBulan"));
    const periodeMulaiTahun = Number(formData.get("periodeMulaiTahun"));

    if (!pegawaiId || !nomorSk || !tanggalSk || !jenisHukuman || !periodeMulaiBulan || !periodeMulaiTahun) {
      return { error: "Field wajib (pegawai, nomor SK, tanggal SK, jenis hukuman, periode mulai) belum lengkap." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };
    if (!canInputSkHukumanDisiplin(authUser, pegawai.satuanKerja)) {
      return { error: "Role kamu tidak berwenang input SK Hukuman Disiplin unit ini." };
    }

    await prisma.skHukumanDisiplin.create({
      data: {
        pegawaiId,
        nomorSk,
        tanggalSk: new Date(tanggalSk),
        jenisHukuman,
        keterangan: keterangan || undefined,
        periodeMulaiBulan,
        periodeMulaiTahun,
        diajukanOlehId: user.id,
        status: "DIAJUKAN",
      },
    });

    revalidatePath("/kasubag/sk-hukuman-disiplin");
    return { success: `SK Hukuman Disiplin ${pegawai.nama} diinput, menunggu approval OSDMA.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
