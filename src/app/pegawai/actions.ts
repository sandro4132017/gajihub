"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { ambilUserSesi } from "../../auth/getSessionAccount";
import {
  canEditDataPegawai,
  canPindahSatuanKerjaPegawai,
  type AuthUser,
} from "../../auth/permissions";

export interface UbahDataPegawaiFormState {
  error?: string;
  success?: string;
}

/**
 * Edit data pokok pegawai (ADMIN/PPABP/KASUBAG_TU) - lihat blok "DATA POKOK
 * PEGAWAI" di src/auth/permissions.ts soal kenapa ini terpisah dari
 * /osdma/update-sk.
 *
 * Izin dicek DUA KALI dengan sengaja:
 *   1. `canEditDataPegawai` terhadap satuan kerja pegawai SAAT INI - boleh
 *      tidak menyentuh baris ini sama sekali;
 *   2. `canPindahSatuanKerjaPegawai` KALAU satuan kerjanya benar-benar
 *      diubah - KASUBAG_TU sengaja tidak boleh memindah pegawai keluar
 *      unitnya (operasi satu arah yang tidak bisa dia batalkan sendiri).
 * Tanpa cek kedua, Kasubag TU bisa "kehilangan" pegawainya sendiri tanpa
 * bisa menariknya balik.
 *
 * NIP SENGAJA TIDAK bisa diubah: NIP adalah kunci penghubung ke akun `User`,
 * presensi, kalkulasi, banding, dan seluruh seed - menggantinya lewat form
 * ini akan memutus relasi itu diam-diam. Kalau NIP memang salah input, itu
 * perbaikan data sumber (SIAP), bukan tambal di sini.
 */
export async function ubahDataPegawaiAction(
  _state: UbahDataPegawaiFormState,
  formData: FormData
): Promise<UbahDataPegawaiFormState> {
  try {
    const user = await ambilUserSesi();
    if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
    const authUser: AuthUser = {
      nip: user.nip,
      role: user.role,
      satuanKerja: user.satuanKerja,
      aktif: user.aktif,
    };

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const nama = String(formData.get("nama") ?? "").trim();
    const satuanKerja = String(formData.get("satuanKerja") ?? "").trim();
    const unitKerja = String(formData.get("unitKerja") ?? "").trim();
    const jabatan = String(formData.get("jabatan") ?? "").trim();
    const golongan = String(formData.get("golongan") ?? "").trim();
    const kelasJabatanRaw = String(formData.get("kelasJabatan") ?? "").trim();
    const statusPegawai = String(formData.get("statusPegawai") ?? "").trim();
    const tmtSkTerakhir = String(formData.get("tmtSkTerakhir") ?? "").trim();

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };

    if (!canEditDataPegawai(authUser, pegawai.satuanKerja)) {
      return { error: `Role kamu tidak berwenang mengubah data pegawai di "${pegawai.satuanKerja}".` };
    }

    if (!nama || !satuanKerja || !unitKerja || !statusPegawai) {
      return { error: "Nama, unit kerja, satuan kerja, dan status pegawai wajib diisi." };
    }

    const pindahSatker = satuanKerja !== pegawai.satuanKerja;
    if (pindahSatker && !canPindahSatuanKerjaPegawai(authUser, pegawai.satuanKerja)) {
      return {
        error:
          "Role kamu tidak berwenang memindahkan pegawai ke satuan kerja lain - " +
          "begitu dipindah keluar unit, kamu tidak bisa menariknya balik sendiri. Minta PPABP atau Admin.",
      };
    }

    const kelasJabatan = kelasJabatanRaw ? Number(kelasJabatanRaw) : null;
    if (kelasJabatanRaw && (Number.isNaN(kelasJabatan) || kelasJabatan! < 1 || kelasJabatan! > 17)) {
      // 1-17 = rentang kelas jabatan resmi di tabel tukin pokok
      // (src/business-logic/tarifTukinPokok.ts) - di luar itu kalkulasi Tukin
      // pasti gagal lookup, jadi lebih baik ditolak di sini.
      return { error: "Kelas jabatan harus angka 1-17 (sesuai tabel tukin pokok Permenaker 15/2024)." };
    }

    const dataSebelum = {
      nama: pegawai.nama,
      satuanKerja: pegawai.satuanKerja,
      unitKerja: pegawai.unitKerja,
      jabatan: pegawai.jabatan,
      golongan: pegawai.golongan,
      kelasJabatan: pegawai.kelasJabatan,
      statusPegawai: pegawai.statusPegawai,
      tmtSkTerakhir: pegawai.tmtSkTerakhir,
    };
    const dataBaru = {
      nama,
      satuanKerja,
      unitKerja,
      jabatan: jabatan || null,
      golongan: golongan || null,
      kelasJabatan,
      statusPegawai,
      tmtSkTerakhir: tmtSkTerakhir ? new Date(tmtSkTerakhir) : null,
    };

    await prisma.$transaction([
      prisma.pegawai.update({ where: { id: pegawaiId }, data: dataBaru }),
      prisma.auditTrail.create({
        data: {
          entitas: "pegawai",
          entitasId: pegawaiId,
          aksi: "UPDATE",
          aktor: user.nip,
          dataSebelum,
          dataSesudah: {
            ...dataBaru,
            tmtSkTerakhir: tmtSkTerakhir || null,
            sumber: `Edit data pegawai (${user.role})`,
          },
        },
      }),
    ]);

    revalidatePath("/pegawai");
    return {
      success: pindahSatker
        ? `Data ${nama} tersimpan. Satuan kerja dipindah dari "${pegawai.satuanKerja}" ke "${satuanKerja}".`
        : `Data ${nama} tersimpan.`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
