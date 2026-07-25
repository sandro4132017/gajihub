"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../lib/prisma";
import {
  ajukanApprovalTukin,
  DEFAULT_TOTAL_JENJANG_APPROVAL,
} from "../approval/approvalTukinService";
import {
  ajukanApprovalUangMakan,
  DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_MAKAN,
} from "../approval/approvalUangMakanService";
import {
  ajukanApprovalUangLembur,
  DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR,
} from "../approval/approvalUangLemburService";
import type { KeputusanApproval } from "../approval/types";
import { getSessionAccount } from "../auth/getSessionAccount";
import {
  canApproveJenjang1,
  canApproveJenjangFinal,
  type AuthUser,
} from "../auth/permissions";
import { LABEL_ROLE } from "../auth/roleLabel";

export interface AjukanApprovalFormState {
  error?: string;
  success?: string;
}

/**
 * Identitas approver (nip/nama/jabatan) diambil dari session login yang
 * sudah diverifikasi server-side - BUKAN dari form yang dikirim browser.
 * Form cuma boleh ngirim calculationId, jenjang, keputusan, catatan. Ini
 * penting: kalau identitas dibaca dari formData, siapa saja bisa mengaku
 * jadi approver lain lewat DevTools.
 */
async function bacaInputApproval(formData: FormData) {
  const akun = await getSessionAccount();
  if (!akun) {
    throw new Error("Sesi login sudah habis - silakan login ulang.");
  }

  const calculationId = String(formData.get("calculationId") ?? "");
  const jenjang = Number(formData.get("jenjang"));
  const keputusan = String(formData.get("keputusan") ?? "") as KeputusanApproval;
  const catatan = String(formData.get("catatan") ?? "").trim();

  if (!["SETUJU", "TOLAK", "REVISI"].includes(keputusan)) {
    throw new Error("Keputusan tidak valid.");
  }

  return {
    calculationId,
    approverNip: akun.nip,
    approverNama: akun.nama,
    approverJabatan: akun.jabatan,
    jenjang,
    keputusan,
    catatan: catatan || undefined,
  };
}

/**
 * LANGKAH 3 (authorization): sebelum approval Tukin beneran dieksekusi, cek
 * apakah role user yang login berwenang buat jenjang ini - pakai
 * src/auth/permissions.ts (canApproveJenjang1/canApproveJenjangFinal).
 *
 * Sengaja fetch ulang User dari database (bukan percaya field role/
 * satuanKerja di cookie sesi) - keputusan otorisasi buat AKSI YANG MENGUBAH
 * DATA harus pakai data paling baru, jaga-jaga kalau role/satuanKerja user
 * berubah atau akunnya dinonaktifkan di tengah sesi 8 jam yang masih aktif.
 *
 * TODO(confirm): pemetaan "jenjang 1 = KASUBAG_TU, jenjang terakhir = PPABP"
 * ini ngikutin DEFAULT_TOTAL_JENJANG_APPROVAL (2) yang juga masih sementara
 * (lihat TODO di approvalTukinService.ts) - kalau jumlah jenjang berubah,
 * pemetaan ini perlu ditinjau ulang juga.
 */
async function cekOtorisasiApprovalTukin(
  approverNip: string,
  jenjang: number,
  satuanKerjaPegawai: string
): Promise<{ diizinkan: true } | { diizinkan: false; alasan: string }> {
  const user = await prisma.user.findUnique({ where: { nip: approverNip } });
  if (!user) {
    return { diizinkan: false, alasan: "Akun tidak terdaftar sebagai User berwenang." };
  }

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };

  const diizinkan =
    jenjang >= DEFAULT_TOTAL_JENJANG_APPROVAL
      ? canApproveJenjangFinal(authUser, satuanKerjaPegawai)
      : canApproveJenjang1(authUser, satuanKerjaPegawai);

  if (!diizinkan) {
    return {
      diizinkan: false,
      alasan: `Role ${LABEL_ROLE[user.role]} tidak berwenang approve jenjang ${jenjang} untuk satuan kerja "${satuanKerjaPegawai}".`,
    };
  }
  return { diizinkan: true };
}

export async function ajukanApprovalTukinAction(
  _state: AjukanApprovalFormState,
  formData: FormData
): Promise<AjukanApprovalFormState> {
  try {
    const input = await bacaInputApproval(formData);

    const kalkulasi = await prisma.tukinCalculation.findUnique({
      where: { id: input.calculationId },
      include: { pegawai: true },
    });
    if (!kalkulasi) {
      return { error: "Kalkulasi tidak ditemukan." };
    }

    const otorisasi = await cekOtorisasiApprovalTukin(
      input.approverNip,
      input.jenjang,
      kalkulasi.pegawai.satuanKerja
    );
    if (!otorisasi.diizinkan) {
      return { error: otorisasi.alasan };
    }

    const hasil = await ajukanApprovalTukin(prisma, {
      tukinCalculationId: input.calculationId,
      approverNip: input.approverNip,
      approverNama: input.approverNama,
      approverJabatan: input.approverJabatan,
      jenjang: input.jenjang,
      keputusan: input.keputusan,
      catatan: input.catatan,
    });
    revalidatePath("/tukin");
    return { success: `Tersimpan - hasil evaluasi: ${hasil.outcome}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

/**
 * Sama seperti cekOtorisasiApprovalTukin di atas, tapi generik buat Uang
 * Makan & Uang Lembur - keduanya pakai pola jenjang yang sama (jenjang 1 =
 * KASUBAG_TU, jenjang terakhir = PPABP), cuma total jenjangnya per domain
 * (lihat DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_MAKAN/_LEMBUR).
 */
async function cekOtorisasiApprovalJenjang(
  approverNip: string,
  jenjang: number,
  totalJenjang: number,
  satuanKerjaPegawai: string
): Promise<{ diizinkan: true } | { diizinkan: false; alasan: string }> {
  const user = await prisma.user.findUnique({ where: { nip: approverNip } });
  if (!user) {
    return { diizinkan: false, alasan: "Akun tidak terdaftar sebagai User berwenang." };
  }

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };

  const diizinkan =
    jenjang >= totalJenjang
      ? canApproveJenjangFinal(authUser, satuanKerjaPegawai)
      : canApproveJenjang1(authUser, satuanKerjaPegawai);

  if (!diizinkan) {
    return {
      diizinkan: false,
      alasan: `Role ${LABEL_ROLE[user.role]} tidak berwenang approve jenjang ${jenjang} untuk satuan kerja "${satuanKerjaPegawai}".`,
    };
  }
  return { diizinkan: true };
}

export async function ajukanApprovalUangMakanAction(
  _state: AjukanApprovalFormState,
  formData: FormData
): Promise<AjukanApprovalFormState> {
  try {
    const input = await bacaInputApproval(formData);

    const uangMakan = await prisma.uangMakan.findUnique({
      where: { id: input.calculationId },
      include: { pegawai: true },
    });
    if (!uangMakan) {
      return { error: "Kalkulasi tidak ditemukan." };
    }

    const otorisasi = await cekOtorisasiApprovalJenjang(
      input.approverNip,
      input.jenjang,
      DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_MAKAN,
      uangMakan.pegawai.satuanKerja
    );
    if (!otorisasi.diizinkan) {
      return { error: otorisasi.alasan };
    }

    const hasil = await ajukanApprovalUangMakan(prisma, {
      uangMakanId: input.calculationId,
      approverNip: input.approverNip,
      approverNama: input.approverNama,
      approverJabatan: input.approverJabatan,
      jenjang: input.jenjang,
      keputusan: input.keputusan,
      catatan: input.catatan,
    });
    revalidatePath("/uang-makan");
    return { success: `Tersimpan - hasil evaluasi: ${hasil.outcome}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

export async function ajukanApprovalUangLemburAction(
  _state: AjukanApprovalFormState,
  formData: FormData
): Promise<AjukanApprovalFormState> {
  try {
    const input = await bacaInputApproval(formData);

    const uangLembur = await prisma.uangLembur.findUnique({
      where: { id: input.calculationId },
      include: { pegawai: true },
    });
    if (!uangLembur) {
      return { error: "Kalkulasi tidak ditemukan." };
    }

    const otorisasi = await cekOtorisasiApprovalJenjang(
      input.approverNip,
      input.jenjang,
      DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR,
      uangLembur.pegawai.satuanKerja
    );
    if (!otorisasi.diizinkan) {
      return { error: otorisasi.alasan };
    }

    const hasil = await ajukanApprovalUangLembur(prisma, {
      uangLemburId: input.calculationId,
      approverNip: input.approverNip,
      approverNama: input.approverNama,
      approverJabatan: input.approverJabatan,
      jenjang: input.jenjang,
      keputusan: input.keputusan,
      catatan: input.catatan,
    });
    revalidatePath("/uang-lembur");
    return { success: `Tersimpan - hasil evaluasi: ${hasil.outcome}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
