"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canAjukanSkKgb, type AuthUser } from "../../../auth/permissions";

export interface AjukanSkKgbFormState {
  error?: string;
  success?: string;
}

export async function ajukanSkKgbAction(
  _state: AjukanSkKgbFormState,
  formData: FormData
): Promise<AjukanSkKgbFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const nomorSk = String(formData.get("nomorSk") ?? "").trim();
    const tanggalSk = String(formData.get("tanggalSk") ?? "");
    const tmtKgb = String(formData.get("tmtKgb") ?? "");
    const golonganLama = String(formData.get("golonganLama") ?? "").trim();
    const golonganBaru = String(formData.get("golonganBaru") ?? "").trim();

    if (!pegawaiId || !nomorSk || !tanggalSk || !tmtKgb || !golonganLama || !golonganBaru) {
      return { error: "Semua field wajib diisi." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };
    if (!canAjukanSkKgb(authUser, pegawai.satuanKerja)) {
      return { error: "Role kamu tidak berwenang mengajukan SK KGB pegawai unit ini." };
    }

    await prisma.skKgb.create({
      data: {
        pegawaiId,
        nomorSk,
        tanggalSk: new Date(tanggalSk),
        tmtKgb: new Date(tmtKgb),
        golonganLama,
        golonganBaru,
        diajukanOlehId: user.id,
        status: "DIAJUKAN",
      },
    });

    revalidatePath("/kasubag/sk-kgb");
    return { success: `SK KGB ${pegawai.nama} diajukan, menunggu approval OSDMA.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
