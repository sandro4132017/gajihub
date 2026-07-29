"use server";

import { revalidatePath } from "next/cache";
// Named import (BUKAN `import XLSX from "xlsx"` seperti di
// src/jobs/importPegawaiXlsx.ts): bundler Next resolve paket ini ke build ESM
// `xlsx.mjs` yang TIDAK punya default export, jadi default import bikin
// `next build` gagal. Skrip di src/jobs/ jalan lewat tsx/CJS makanya aman.
import { read, utils } from "xlsx";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canKelolaGajiInduk, type AuthUser } from "../../../auth/permissions";
import { parseFileGajiInduk, type BarisGajiInduk } from "../../../business-logic/gajiInduk";

/**
 * File yang di-upload TIDAK DISIMPAN ke disk/object storage - cuma dibaca di
 * memori lalu barisnya masuk ke tabel gaji_induk. Ini SENGAJA: mekanisme
 * penyimpanan file (local disk vs object storage) dan kebijakan retensi
 * dokumen masih TODO(confirm) di CLAUDE.md, dan buat kebutuhan slip gaji
 * memang cukup angkanya saja. Yang disimpan cuma NAMA file-nya, sebagai
 * jejak asal data.
 */

/** Batas ukuran file - lihat serverActions.bodySizeLimit di next.config.mjs. */
const MAKS_UKURAN_FILE = 8 * 1024 * 1024;

/** Upsert ditulis per batch supaya satu file 350+ baris tidak jadi satu transaksi raksasa. */
const UKURAN_BATCH = 50;

export interface UploadGajiIndukFormState {
  error?: string;
  success?: string;
  /** Ringkasan per periode yang ditemukan di file - ditampilkan setelah upload. */
  ringkasan?: {
    periodeBulan: number;
    periodeTahun: number;
    jumlahTersimpan: number;
    totalGajiBersih: number;
  }[];
  /** Alasan baris yang tidak diproses, dikelompokkan supaya tidak jadi 300 baris pesan. */
  dilewati?: { alasan: string; jumlah: number; contohNip: string[] }[];
  /** Baris yang komponennya tidak menjumlah ke kolom `bersih` - perlu dicek PPABP. */
  selisih?: { nip: string; selisih: number }[];
}

export interface HonorariumFormState {
  error?: string;
  success?: string;
}

function kelompokkanAlasan(items: { nip: string | null; alasan: string }[]) {
  const peta = new Map<string, string[]>();
  for (const item of items) {
    const daftar = peta.get(item.alasan) ?? [];
    if (item.nip) daftar.push(item.nip);
    peta.set(item.alasan, daftar);
  }
  return [...peta.entries()].map(([alasan, nips]) => ({
    alasan,
    // Jumlah kejadian dihitung dari items, bukan dari nips - baris tanpa NIP
    // tetap kehitung walau tidak punya contoh untuk ditampilkan.
    jumlah: items.filter((i) => i.alasan === alasan).length,
    contohNip: nips.slice(0, 3),
  }));
}

export async function uploadGajiIndukAction(
  _state: UploadGajiIndukFormState,
  formData: FormData
): Promise<UploadGajiIndukFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canKelolaGajiInduk(authUser)) {
      return { error: "Role kamu tidak berwenang mengunggah riwayat gaji." };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Pilih file ADK gaji (.xlsx/.xls) dulu." };
    }
    if (file.size > MAKS_UKURAN_FILE) {
      return { error: `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 8 MB.` };
    }

    // --- Baca file (I/O ada di sini, pemetaannya di business-logic) ---
    let rows: Record<string, unknown>[];
    let header: string[];
    try {
      const wb = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return { error: "File tidak punya sheet yang bisa dibaca." };

      const matriks = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
      if (matriks.length < 2) return { error: "File kosong - tidak ada baris data setelah header." };

      // Header di-normalisasi ke huruf kecil supaya pemetaan kolom tidak
      // patah cuma gara-gara file dari versi GPP lain menulis "NIP"/"Nip".
      header = (matriks[0] as unknown[]).map((h) => String(h ?? "").trim().toLowerCase());
      rows = matriks.slice(1).map((baris) =>
        Object.fromEntries(header.map((kolom, i) => [kolom, (baris as unknown[])[i] ?? null]))
      );
    } catch {
      return { error: "File tidak bisa dibaca sebagai Excel. Pastikan formatnya .xlsx/.xls, bukan .csv atau .xlsm terproteksi." };
    }

    const hasil = parseFileGajiInduk(rows, header);
    if (hasil.kolomHilang.length > 0) {
      return {
        error: `File ini sepertinya bukan ADK gaji dari GPP - kolom wajib tidak ditemukan: ${hasil.kolomHilang.join(", ")}.`,
      };
    }
    if (hasil.baris.length === 0) {
      return { error: "Tidak ada baris gaji induk yang bisa diproses dari file ini." };
    }

    // --- Cocokkan NIP ke data Pegawai ---
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
    const siapSimpan: BarisGajiInduk[] = [];
    for (const baris of hasil.baris) {
      if (!petaPegawai.has(baris.nip)) {
        dilewati.push({ nip: baris.nip, alasan: "NIP tidak ditemukan di data Pegawai Gajihub" });
        continue;
      }
      siapSimpan.push(baris);
    }

    if (siapSimpan.length === 0) {
      return {
        error: "Semua baris dilewati - tidak ada NIP di file ini yang cocok dengan data Pegawai.",
        dilewati: kelompokkanAlasan(dilewati),
      };
    }

    // --- Simpan (upsert - aman kalau file yang sama di-upload ulang) ---
    // honorarium SENGAJA tidak ikut di-update: nilainya diisi manual PPABP
    // setelah upload, jadi upload ulang file GPP yang sama tidak boleh
    // menghapus honorarium yang sudah diketik.
    const operasi = siapSimpan.map((b) => {
      const pegawaiId = petaPegawai.get(b.nip)!;
      const isi = {
        kodeSatker: b.kodeSatker,
        nomorGaji: b.nomorGaji,
        jenisGaji: b.jenisGaji,
        gajiPokok: b.gajiPokok,
        tunjanganIstri: b.tunjanganIstri,
        tunjanganAnak: b.tunjanganAnak,
        tunjanganUmum: b.tunjanganUmum,
        tunjanganStruktural: b.tunjanganStruktural,
        tunjanganFungsional: b.tunjanganFungsional,
        tunjanganBeras: b.tunjanganBeras,
        tunjanganPph: b.tunjanganPph,
        pembulatan: b.pembulatan,
        tunjanganLain: b.tunjanganLain,
        potonganIuranPegawai: b.potonganIuranPegawai,
        potonganPph: b.potonganPph,
        potonganBpjs: b.potonganBpjs,
        potonganLain: b.potonganLain,
        totalPenghasilan: b.totalPenghasilan,
        totalPotongan: b.totalPotongan,
        gajiBersih: b.gajiBersih,
        sourceFileName: file.name,
        diunggahOlehId: user.id,
      };
      return prisma.gajiInduk.upsert({
        where: {
          pegawaiId_periodeBulan_periodeTahun: {
            pegawaiId,
            periodeBulan: b.periodeBulan,
            periodeTahun: b.periodeTahun,
          },
        },
        create: { pegawaiId, periodeBulan: b.periodeBulan, periodeTahun: b.periodeTahun, ...isi },
        update: { ...isi, diunggahPada: new Date() },
      });
    });

    for (let i = 0; i < operasi.length; i += UKURAN_BATCH) {
      await prisma.$transaction(operasi.slice(i, i + UKURAN_BATCH));
    }

    // --- Ringkasan per periode ---
    const petaPeriode = new Map<string, { periodeBulan: number; periodeTahun: number; jumlahTersimpan: number; totalGajiBersih: number }>();
    for (const b of siapSimpan) {
      const kunci = `${b.periodeTahun}-${b.periodeBulan}`;
      const entri = petaPeriode.get(kunci) ?? {
        periodeBulan: b.periodeBulan,
        periodeTahun: b.periodeTahun,
        jumlahTersimpan: 0,
        totalGajiBersih: 0,
      };
      entri.jumlahTersimpan += 1;
      entri.totalGajiBersih += b.gajiBersih;
      petaPeriode.set(kunci, entri);
    }
    const ringkasan = [...petaPeriode.values()].sort(
      (a, b) => b.periodeTahun - a.periodeTahun || b.periodeBulan - a.periodeBulan
    );

    await prisma.auditTrail.create({
      data: {
        entitas: "gaji_induk",
        entitasId: ringkasan.map((r) => `${r.periodeBulan}/${r.periodeTahun}`).join(","),
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          namaFile: file.name,
          jumlahBarisTersimpan: siapSimpan.length,
          jumlahBarisDilewati: dilewati.length,
          periode: ringkasan.map((r) => `${r.periodeBulan}/${r.periodeTahun}`),
        },
      },
    });

    revalidatePath("/ppabp/gaji-induk");
    return {
      success: `${siapSimpan.length} baris gaji induk tersimpan dari "${file.name}".`,
      ringkasan,
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
      selisih: siapSimpan
        .filter((b) => b.selisihAritmatika !== 0)
        .slice(0, 10)
        .map((b) => ({ nip: b.nip, selisih: b.selisihAritmatika })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

/**
 * Edit honorarium satu pegawai untuk satu periode. Honorarium TIDAK ada di
 * file GPP (lihat TODO(confirm) di model GajiInduk) - ini satu-satunya cara
 * mengisinya, dan cuma bisa buat baris gaji induk yang sudah ada.
 */
export async function ubahHonorariumAction(
  _state: HonorariumFormState,
  formData: FormData
): Promise<HonorariumFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canKelolaGajiInduk(authUser)) {
      return { error: "Role kamu tidak berwenang mengubah honorarium." };
    }

    const gajiIndukId = String(formData.get("gajiIndukId") ?? "").trim();
    const honorarium = Number(formData.get("honorarium"));
    if (!gajiIndukId) return { error: "Baris gaji tidak dikenali." };
    if (!Number.isFinite(honorarium) || honorarium < 0) {
      return { error: "Honorarium harus angka >= 0." };
    }

    const sebelum = await prisma.gajiInduk.findUnique({ where: { id: gajiIndukId }, select: { honorarium: true } });
    if (!sebelum) return { error: "Baris gaji induk tidak ditemukan." };

    await prisma.$transaction([
      prisma.gajiInduk.update({ where: { id: gajiIndukId }, data: { honorarium } }),
      prisma.auditTrail.create({
        data: {
          entitas: "gaji_induk",
          entitasId: gajiIndukId,
          aksi: "UPDATE",
          aktor: user.nip,
          dataSebelum: { honorarium: sebelum.honorarium },
          dataSesudah: { honorarium },
        },
      }),
    ]);

    revalidatePath("/ppabp/gaji-induk");
    return { success: "Tersimpan" };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
