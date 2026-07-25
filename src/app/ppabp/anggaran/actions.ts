"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUploadAnggaranRealisasi, type AuthUser } from "../../../auth/permissions";

export interface UploadAnggaranFormState {
  error?: string;
  success?: string;
}

export async function uploadAnggaranRealisasiAction(
  _state: UploadAnggaranFormState,
  formData: FormData
): Promise<UploadAnggaranFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await prisma.user.findUnique({ where: { nip: akun.nip } });
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canUploadAnggaranRealisasi(authUser)) {
      return { error: "Role kamu tidak berwenang mengunggah Anggaran & Realisasi." };
    }

    const satuanKerja = String(formData.get("satuanKerja") ?? "").trim();
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    const pagu = Number(formData.get("pagu"));
    const realisasi = Number(formData.get("realisasi"));

    if (!satuanKerja || !periodeBulan || !periodeTahun || Number.isNaN(pagu) || Number.isNaN(realisasi)) {
      return { error: "Semua field wajib diisi dengan benar." };
    }
    if (pagu < 0 || realisasi < 0) {
      return { error: "Pagu dan realisasi tidak boleh negatif." };
    }

    await prisma.anggaranRealisasi.upsert({
      where: { satuanKerja_periodeBulan_periodeTahun: { satuanKerja, periodeBulan, periodeTahun } },
      create: { satuanKerja, periodeBulan, periodeTahun, pagu, realisasi, diunggahOlehId: user.id },
      update: { pagu, realisasi, diunggahOlehId: user.id },
    });

    revalidatePath("/ppabp/anggaran");
    return { success: `Anggaran & Realisasi ${satuanKerja} periode ${periodeBulan}/${periodeTahun} tersimpan.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
