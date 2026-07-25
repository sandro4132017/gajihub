"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canAjukanSanggahan, type AuthUser } from "../../auth/permissions";

export interface AjukanSanggahanFormState {
  error?: string;
  success?: string;
}

type ReferensiTipe = "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";

function isReferensiTipeValid(value: string): value is ReferensiTipe {
  return value === "TUKIN" || value === "UANG_MAKAN" || value === "UANG_LEMBUR";
}

/** Ambil kalkulasi yang mau disanggah dari tabel yang sesuai referensiTipe-nya. */
function cariKalkulasi(referensiTipe: ReferensiTipe, referensiId: string) {
  switch (referensiTipe) {
    case "TUKIN":
      return prisma.tukinCalculation.findUnique({ where: { id: referensiId } });
    case "UANG_MAKAN":
      return prisma.uangMakan.findUnique({ where: { id: referensiId } });
    case "UANG_LEMBUR":
      return prisma.uangLembur.findUnique({ where: { id: referensiId } });
  }
}

/**
 * Ajukan sanggahan atas kalkulasi Tukin/Uang Makan/Uang Lembur milik sendiri
 * (role matrix PEGAWAI - lihat CLAUDE.md). Sama seperti action approval,
 * fetch ULANG User dari database (bukan percaya cookie sesi) sebelum
 * mengizinkan aksi yang mengubah data.
 *
 * periodeBulan/periodeTahun DIAMBIL DARI kalkulasi yang disanggah, bukan
 * dari input form - supaya tidak bisa dipalsukan lewat DevTools.
 *
 * Sanggahan yang diajukan memicu ReconciliationStatus (pegawai+periode yang
 * sama) pindah ke status "SANGGAH" - lihat catatan "SEHARUSNYA" di model
 * Sanggahan/ReconciliationStatus di schema.prisma. Upsert (bukan update)
 * karena belum ada job/service lain yang membuat baris ReconciliationStatus
 * duluan (belum ada proses rekonsiliasi otomatis di sistem ini). Durasi
 * window verifikasi & aturan hold-pembayaran-vs-koreksi-siklus-berikutnya
 * TETAP belum diisi di sini - itu masih TODO(confirm) kebijakan terpisah.
 */
export async function ajukanSanggahanAction(
  _state: AjukanSanggahanFormState,
  formData: FormData
): Promise<AjukanSanggahanFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) {
      return { error: "Sesi login sudah habis - silakan login ulang." };
    }

    const referensiTipeRaw = String(formData.get("referensiTipe") ?? "");
    const referensiId = String(formData.get("referensiId") ?? "");
    const alasan = String(formData.get("alasan") ?? "").trim();

    if (!isReferensiTipeValid(referensiTipeRaw)) {
      return { error: "Jenis kalkulasi tidak valid." };
    }
    if (!alasan) {
      return { error: "Alasan sanggahan wajib diisi." };
    }

    const user = await prisma.user.findUnique({ where: { nip: akun.nip } });
    if (!user) {
      return { error: "Akun tidak terdaftar sebagai User." };
    }
    const authUser: AuthUser = {
      nip: user.nip,
      role: user.role,
      satuanKerja: user.satuanKerja,
      aktif: user.aktif,
    };
    if (!canAjukanSanggahan(authUser, user.nip)) {
      return { error: "Role kamu tidak berwenang mengajukan sanggahan." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { nip: user.nip } });
    if (!pegawai) {
      return { error: "Data pegawai untuk NIP ini tidak ditemukan." };
    }

    const kalkulasi = await cariKalkulasi(referensiTipeRaw, referensiId);
    if (!kalkulasi) {
      return { error: "Kalkulasi yang mau disanggah tidak ditemukan." };
    }
    if (kalkulasi.pegawaiId !== pegawai.id) {
      return { error: "Kalkulasi ini bukan milik kamu." };
    }

    await prisma.$transaction([
      prisma.sanggahan.create({
        data: {
          pegawaiId: pegawai.id,
          periodeBulan: kalkulasi.periodeBulan,
          periodeTahun: kalkulasi.periodeTahun,
          referensiTipe: referensiTipeRaw,
          referensiId,
          pengajuId: user.id,
          alasan,
        },
      }),
      prisma.reconciliationStatus.upsert({
        where: {
          pegawaiId_periodeBulan_periodeTahun: {
            pegawaiId: pegawai.id,
            periodeBulan: kalkulasi.periodeBulan,
            periodeTahun: kalkulasi.periodeTahun,
          },
        },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan: kalkulasi.periodeBulan,
          periodeTahun: kalkulasi.periodeTahun,
          status: "SANGGAH",
        },
        update: { status: "SANGGAH" },
      }),
    ]);

    revalidatePath("/saya");
    return { success: "Sanggahan berhasil diajukan, menunggu verifikasi." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
