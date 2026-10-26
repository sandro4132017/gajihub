"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { ambilUserSesi } from "../../../auth/getSessionAccount";
import { canMonitorUbahStatusLintasUnit, type AuthUser } from "../../../auth/permissions";
import {
  adalahKeputusanValid,
  CATATAN_ADK_BELUM_MENAHAN,
  STATUS_MENUNGGU_KEPUTUSAN,
} from "./keputusanPembayaran";

export interface PutuskanPembayaranFormState {
  error?: string;
  success?: string;
}

/**
 * PPABP memutuskan tindak lanjut PEMBAYARAN atas pasangan (pegawai, periode)
 * yang dipersoalkan banding: HOLD_PEMBAYARAN atau KOREKSI_SIKLUS_BERIKUTNYA.
 * Ini BUKAN keputusan atas bandingnya (itu OSDMA) - lihat
 * canLihatTembusanBanding di permissions.ts.
 *
 * Hanya mencatat keputusan; Export ADK belum membaca reconciliationStatus.
 * TODO(confirm): kebijakan hold vs koreksi & window verifikasi belum diputuskan.
 */
export async function putuskanPembayaranAction(
  _state: PutuskanPembayaranFormState,
  formData: FormData
): Promise<PutuskanPembayaranFormState> {
  try {
    const id = String(formData.get("id") ?? "");
    const keputusan = String(formData.get("keputusan") ?? "");

    // ambilUserSesi membaca ulang User dari DB: sesi habis, akun nonaktif, dan
    // role aktif yang basi semuanya tertangkap di sini.
    const user = await ambilUserSesi();
    if (!user) return { error: "Sesi login sudah habis atau akun tidak aktif - silakan login ulang." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    if (!adalahKeputusanValid(keputusan)) return { error: "Keputusan tidak valid." };
    if (!id) return { error: "Baris keputusan tidak ditemukan." };

    const recon = await prisma.reconciliationStatus.findUnique({ where: { id } });
    if (!recon) return { error: "Baris keputusan tidak ditemukan." };

    const pegawai = await prisma.pegawai.findUnique({
      where: { id: recon.pegawaiId },
      select: { satuanKerja: true },
    });
    if (!pegawai) return { error: "Pegawai untuk baris ini tidak ditemukan." };
    if (!canMonitorUbahStatusLintasUnit(authUser, pegawai.satuanKerja)) {
      return { error: "Role kamu tidak berwenang memutuskan pembayaran baris ini." };
    }

    // Bersyarat pada status: dua PPABP yang menekan tombol bersamaan tidak
    // saling menimpa - yang kedua mendapat count 0.
    const hasil = await prisma.$transaction(async (tx) => {
      const diubah = await tx.reconciliationStatus.updateMany({
        where: { id, status: { in: [...STATUS_MENUNGGU_KEPUTUSAN] } },
        data: { status: "DIPUTUSKAN", keputusanAkhir: keputusan },
      });
      if (diubah.count === 0) return diubah;

      // Tanpa NIP / nominal: hanya status & keputusan.
      await tx.auditTrail.create({
        data: {
          entitas: "reconciliation_status",
          entitasId: id,
          aksi: "UPDATE",
          aktor: user.nip,
          satuanKerja: pegawai.satuanKerja,
          dataSebelum: { status: recon.status, keputusanAkhir: recon.keputusanAkhir },
          dataSesudah: { status: "DIPUTUSKAN", keputusanAkhir: keputusan },
        },
      });
      return diubah;
    });

    if (hasil.count === 0) {
      return { error: "Baris ini sudah diputuskan orang lain atau tidak lagi menunggu keputusan. Muat ulang halaman." };
    }

    revalidatePath("/ppabp/banding");
    revalidatePath("/ppabp");
    revalidatePath("/ppabp/rekonsiliasi"); // halaman lama, sampai digabung penuh

    if (keputusan === "HOLD_PEMBAYARAN") {
      return { success: `Tercatat: pembayaran ditahan. ${CATATAN_ADK_BELUM_MENAHAN}` };
    }
    return { success: "Tercatat: pembayaran dibayar dulu, dikoreksi di siklus berikutnya." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
