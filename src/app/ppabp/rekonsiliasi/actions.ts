"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canMonitorUbahStatusLintasUnit, type AuthUser } from "../../../auth/permissions";

export interface PutuskanRekonsiliasiFormState {
  error?: string;
  success?: string;
}

/**
 * PPABP memutuskan tindak lanjut kasus SELISIH/SANGGAH: HOLD_PEMBAYARAN
 * (tahan sampai dikoreksi) atau KOREKSI_SIKLUS_BERIKUTNYA (bayar dulu,
 * dikoreksi di periode depan). Status baris jadi "DIPUTUSKAN". Field
 * keputusanAkhir/windowVerifikasiBerakhir sudah disiapkan di schema tapi
 * durasi window & aturan detail masih TODO(confirm) kebijakan terpisah
 * (lihat CLAUDE.md) - di sini cuma mencatat keputusan PPABP-nya.
 */
export async function putuskanRekonsiliasiAction(
  _state: PutuskanRekonsiliasiFormState,
  formData: FormData
): Promise<PutuskanRekonsiliasiFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const id = String(formData.get("id") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");
    if (keputusan !== "HOLD_PEMBAYARAN" && keputusan !== "KOREKSI_SIKLUS_BERIKUTNYA") {
      return { error: "Keputusan tidak valid." };
    }

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const recon = await prisma.reconciliationStatus.findUnique({ where: { id } });
    if (!recon) return { error: "Baris rekonsiliasi tidak ditemukan." };

    const pegawai = await prisma.pegawai.findUnique({ where: { id: recon.pegawaiId } });
    if (!canMonitorUbahStatusLintasUnit(authUser, pegawai?.satuanKerja)) {
      return { error: "Role kamu tidak berwenang mengubah status rekonsiliasi ini." };
    }
    if (recon.status !== "SELISIH" && recon.status !== "SANGGAH") {
      return { error: `Baris ini berstatus ${recon.status} - tidak perlu diputuskan lagi.` };
    }

    await prisma.reconciliationStatus.update({
      where: { id },
      data: { status: "DIPUTUSKAN", keputusanAkhir: keputusan },
    });

    revalidatePath("/ppabp/rekonsiliasi");
    return { success: `Keputusan tersimpan: ${keputusan === "HOLD_PEMBAYARAN" ? "tahan pembayaran" : "koreksi siklus berikutnya"}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
