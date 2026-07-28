"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canUpdateSkPegawaiStrukturalFungsional, type AuthUser } from "../../../auth/permissions";

export interface UpdateSkStrukturalFormState {
  error?: string;
  success?: string;
}

/**
 * Update langsung jabatan/golongan/kelas jabatan pegawai yang baru dilantik
 * struktural/fungsional atau naik pangkat (BUKAN alur ajukan-lalu-approve
 * seperti SK KGB/Hukdis - role matrix menyebut ini "update SK", satu
 * langkah, OSDMA yang eksekusi langsung). Dicatat ke AuditTrail supaya
 * tetap ada jejak perubahan data master, konsisten dengan konvensi project.
 */
export async function updateSkStrukturalAction(
  _state: UpdateSkStrukturalFormState,
  formData: FormData
): Promise<UpdateSkStrukturalFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canUpdateSkPegawaiStrukturalFungsional(authUser)) {
      return { error: "Role kamu tidak berwenang mengubah SK pegawai." };
    }

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const jabatan = String(formData.get("jabatan") ?? "").trim();
    const golongan = String(formData.get("golongan") ?? "").trim();
    const kelasJabatanRaw = String(formData.get("kelasJabatan") ?? "").trim();
    const tmtSkTerakhir = String(formData.get("tmtSkTerakhir") ?? "").trim();

    if (!pegawaiId || !jabatan || !golongan) {
      return { error: "Pegawai, jabatan, dan golongan wajib diisi." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };

    const kelasJabatan = kelasJabatanRaw ? Number(kelasJabatanRaw) : undefined;
    if (kelasJabatanRaw && Number.isNaN(kelasJabatan)) {
      return { error: "Kelas jabatan harus berupa angka." };
    }

    const dataSebelum = {
      jabatan: pegawai.jabatan,
      golongan: pegawai.golongan,
      kelasJabatan: pegawai.kelasJabatan,
      tmtSkTerakhir: pegawai.tmtSkTerakhir,
    };

    await prisma.$transaction([
      prisma.pegawai.update({
        where: { id: pegawaiId },
        data: {
          jabatan,
          golongan,
          kelasJabatan: kelasJabatan ?? pegawai.kelasJabatan,
          tmtSkTerakhir: tmtSkTerakhir ? new Date(tmtSkTerakhir) : pegawai.tmtSkTerakhir,
        },
      }),
      prisma.auditTrail.create({
        data: {
          entitas: "pegawai",
          entitasId: pegawaiId,
          aksi: "UPDATE",
          aktor: user.nip,
          dataSebelum,
          dataSesudah: { jabatan, golongan, kelasJabatan: kelasJabatan ?? pegawai.kelasJabatan, tmtSkTerakhir, sumber: "Update SK struktural/fungsional (OSDMA)" },
        },
      }),
    ]);

    revalidatePath("/osdma/update-sk");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
  redirect(`/osdma/update-sk?berhasil=1`);
}
