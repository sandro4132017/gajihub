"use server";

import { revalidatePath } from "next/cache";
import { read, utils } from "xlsx";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canKelolaGajiInduk, type AuthUser } from "../../../auth/permissions";
import { parseRekeningPegawai, kelompokkanPerBank } from "../../../business-logic/rekeningPegawai";

/**
 * Upload daftar rekening penerima pembayaran, per jenis (TUKIN / GAJI).
 * File-nya TIDAK disimpan - cuma dibaca di memori, sama seperti upload lain.
 *
 * Izinnya ikut canKelolaGajiInduk (PPABP + ADMIN): yang memegang data
 * rekening & memproses SPP memang PPABP.
 */

const MAKS_UKURAN_FILE = 8 * 1024 * 1024;
const UKURAN_BATCH = 50;

export interface UploadRekeningFormState {
  error?: string;
  success?: string;
  ringkasan?: {
    jenisPembayaran: string;
    jumlahTersimpan: number;
    perBank: { kodeBankSpan: string; namaBank: string; jumlah: number }[];
  };
  dilewati?: { alasan: string; jumlah: number; contohNip: string[] }[];
}

function kelompokkanAlasan(items: { nip: string | null; alasan: string }[]) {
  const urutan: string[] = [];
  const peta = new Map<string, string[]>();
  for (const item of items) {
    if (!peta.has(item.alasan)) {
      peta.set(item.alasan, []);
      urutan.push(item.alasan);
    }
    if (item.nip) peta.get(item.alasan)!.push(item.nip);
  }
  return urutan.map((alasan) => ({
    alasan,
    jumlah: items.filter((i) => i.alasan === alasan).length,
    contohNip: peta.get(alasan)!.slice(0, 3),
  }));
}

export async function uploadRekeningAction(
  _state: UploadRekeningFormState,
  formData: FormData
): Promise<UploadRekeningFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canKelolaGajiInduk(authUser)) {
      return { error: "Role kamu tidak berwenang mengelola data rekening." };
    }

    const jenisPembayaran = String(formData.get("jenisPembayaran") ?? "");
    if (jenisPembayaran !== "TUKIN" && jenisPembayaran !== "GAJI") {
      return { error: "Jenis pembayaran wajib dipilih (Tukin atau Gaji)." };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Pilih file daftar rekening (.xlsx/.xls/.csv) dulu." };
    }
    if (file.size > MAKS_UKURAN_FILE) {
      return { error: `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 8 MB.` };
    }

    let matriks: unknown[][];
    try {
      const wb = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return { error: "File tidak punya sheet yang bisa dibaca." };
      matriks = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
    } catch {
      return { error: "File tidak bisa dibaca. Pastikan formatnya .xlsx, .xls, atau .csv." };
    }

    const hasil = parseRekeningPegawai(matriks);
    if (hasil.error) return { error: hasil.error };
    if (hasil.baris.length === 0) {
      return { error: "Tidak ada baris rekening yang bisa diproses.", dilewati: kelompokkanAlasan(hasil.dilewati) };
    }

    const nipUnik = [...new Set(hasil.baris.map((b) => b.nip))];
    const pegawaiList = await prisma.pegawai.findMany({
      where: { nip: { in: nipUnik } },
      select: { id: true, nip: true },
    });
    const petaPegawai = new Map(pegawaiList.map((p) => [p.nip, p.id]));

    const dilewati: { nip: string | null; alasan: string }[] = hasil.dilewati.map((d) => ({
      nip: d.nip,
      alasan: d.alasan,
    }));
    const siapSimpan = hasil.baris.filter((b) => {
      if (!petaPegawai.has(b.nip)) {
        dilewati.push({ nip: b.nip, alasan: "NIP tidak ditemukan di data Pegawai Gajihub" });
        return false;
      }
      return true;
    });

    if (siapSimpan.length === 0) {
      return {
        error: "Tidak ada baris yang bisa disimpan - semua dilewati, lihat alasannya di bawah.",
        dilewati: kelompokkanAlasan(dilewati),
      };
    }

    const operasi = siapSimpan.map((b) => {
      const pegawaiId = petaPegawai.get(b.nip)!;
      const isi = {
        kodeBankSpan: b.kodeBankSpan,
        namaBank: b.namaBank,
        nomorRekening: b.nomorRekening,
        namaRekening: b.namaRekening,
        sourceFileName: file.name,
        diunggahOlehId: user.id,
      };
      return prisma.rekeningPegawai.upsert({
        where: { pegawaiId_jenisPembayaran: { pegawaiId, jenisPembayaran } },
        create: { pegawaiId, jenisPembayaran, ...isi },
        update: { ...isi, diunggahPada: new Date() },
      });
    });
    for (let i = 0; i < operasi.length; i += UKURAN_BATCH) {
      await prisma.$transaction(operasi.slice(i, i + UKURAN_BATCH));
    }

    await prisma.auditTrail.create({
      data: {
        entitas: "rekening_pegawai",
        entitasId: jenisPembayaran,
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          namaFile: file.name,
          jenisPembayaran,
          jumlahBarisTersimpan: siapSimpan.length,
          jumlahBarisDilewati: dilewati.length,
        },
      },
    });

    revalidatePath("/ppabp/rekening");
    revalidatePath("/ppabp/adk");
    return {
      success: `${siapSimpan.length} rekening ${jenisPembayaran} tersimpan dari "${file.name}".`,
      ringkasan: {
        jenisPembayaran,
        jumlahTersimpan: siapSimpan.length,
        perBank: kelompokkanPerBank(siapSimpan),
      },
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
