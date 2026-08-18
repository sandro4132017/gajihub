"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { read, utils } from "xlsx";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canKelolaGajiInduk, type AuthUser } from "../../../auth/permissions";
import {
  gabungHasilBasisDataGaji,
  kodeBankBernamaGanda,
  nipGanda,
  parseSheetBasisDataGaji,
  type BarisBasisDataGaji,
} from "../../../business-logic/basisDataGaji";

/**
 * Unggah "basis data gaji Kemnaker" - berkas identitas pembayaran dari Web
 * Gaji Kemenkeu.
 *
 * SATU unggahan mengisi DUA tabel:
 *   - `IdentitasWebGaji`  : nama versi Web Gaji + kode satker (dipakai ADK)
 *   - `RekeningPegawai`   : rekening GAJI dan TUKIN (dipakai pemisahan ADK per bank)
 *
 * Rekening tidak dibuatkan tabel sendiri walau datang dari berkas yang sama:
 * `RekeningPegawai` sudah menjadi sumber pemisahan berkas per bank, dan dua
 * tabel rekening berarti dua kebenaran yang cepat atau lambat berbeda.
 *
 * Berkasnya sendiri TIDAK disimpan - hanya dibaca di memori, sama seperti
 * unggahan lain di aplikasi ini (lihat gaji-induk & rekening).
 *
 * Izin ikut `canKelolaGajiInduk` (PPABP + ADMIN): yang memegang berkas dari
 * Kemenkeu dan memproses pembayaran memang PPABP.
 */

const MAKS_UKURAN_FILE = 8 * 1024 * 1024;
const UKURAN_BATCH = 50;

export interface UploadBasisDataGajiFormState {
  error?: string;
  success?: string;
  ringkasan?: {
    dibaca: number;
    identitasTersimpan: number;
    rekeningTukin: number;
    rekeningGaji: number;
    namaBerbedaDariSiap: number;
    contohBedaNama: { nip: string; siap: string; webGaji: string }[];
    pegawaiAktifBelumTercakup: number;
  };
  peringatan?: string[];
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

const samakan = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

export async function uploadBasisDataGajiAction(
  _state: UploadBasisDataGajiFormState,
  formData: FormData
): Promise<UploadBasisDataGajiFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
    if (!canKelolaGajiInduk(authUser)) {
      return { error: "Role kamu tidak berwenang mengelola basis data gaji." };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { error: "Berkas belum dipilih." };
    if (file.size > MAKS_UKURAN_FILE) {
      return { error: `Berkas terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Batasnya 8 MB.` };
    }

    const wb = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    // raw: true WAJIB - kalau selnya sudah diformat jadi teks, NIP yang rusak
    // karena presisi Excel tidak bisa dibedakan lagi dari NIP yang benar.
    const hasil = gabungHasilBasisDataGaji(
      wb.SheetNames.map((nama) =>
        parseSheetBasisDataGaji(
          utils.sheet_to_json(wb.Sheets[nama]!, { header: 1, defval: "", raw: true }) as unknown[][],
          nama
        )
      )
    );
    if (hasil.error) return { error: hasil.error };
    if (hasil.baris.length === 0) {
      return { error: "Tidak ada baris yang bisa dibaca dari berkas ini.", dilewati: kelompokkanAlasan(hasil.dilewati) };
    }

    // --- Cocokkan ke tabel Pegawai lewat NIP ---
    const pegawai = await prisma.pegawai.findMany({
      where: { nip: { in: [...new Set(hasil.baris.map((b) => b.nip))] } },
      select: { id: true, nip: true, nama: true },
    });
    const byNip = new Map(pegawai.map((p) => [p.nip, p]));

    const dilewati = [...hasil.dilewati];
    const siapSimpan: (BarisBasisDataGaji & { pegawaiId: string; namaSiap: string })[] = [];
    // Baris terakhir untuk satu NIP yang menang - sama seperti upsert. Yang
    // gandanya dilaporkan terpisah supaya keputusannya tidak tersembunyi.
    const perNip = new Map<string, BarisBasisDataGaji>();
    for (const b of hasil.baris) perNip.set(b.nip, b);

    for (const b of perNip.values()) {
      const p = byNip.get(b.nip);
      if (!p) {
        dilewati.push({
          sheet: b.sheet,
          nomorBaris: 0,
          nip: b.nip,
          nama: b.nama,
          alasan: "NIP tidak ada di data pegawai Gajihub (belum tersinkron dari SIAP, atau bukan pegawai Kemnaker).",
        });
        continue;
      }
      siapSimpan.push({ ...b, pegawaiId: p.id, namaSiap: p.nama });
    }

    // --- Simpan: identitas + rekening, per batch ---
    const waktu = new Date();
    let rekeningTukin = 0;
    let rekeningGaji = 0;
    for (let i = 0; i < siapSimpan.length; i += UKURAN_BATCH) {
      const batch = siapSimpan.slice(i, i + UKURAN_BATCH);
      const operasi = batch.flatMap((b) => {
        // Sengaja diberi tipe lebar: satu batch memuat dua model berbeda
        // (identitas + rekening), dan $transaction memang menerima campuran.
        const ops: Prisma.PrismaPromise<unknown>[] = [
          prisma.identitasWebGaji.upsert({
            where: { pegawaiId: b.pegawaiId },
            create: {
              pegawaiId: b.pegawaiId,
              nama: b.nama,
              jenisPegawai: b.jenisPegawai,
              kodeSatker: b.kodeSatker,
              namaSatuanKerja: b.namaSatuanKerja,
              sourceFileName: file.name,
              diunggahOlehId: user.id,
            },
            update: {
              nama: b.nama,
              jenisPegawai: b.jenisPegawai,
              kodeSatker: b.kodeSatker,
              namaSatuanKerja: b.namaSatuanKerja,
              sourceFileName: file.name,
              diunggahOlehId: user.id,
              diunggahPada: waktu,
            },
          }),
        ];
        for (const [jenis, rek] of [
          ["TUKIN", b.tukin],
          ["GAJI", b.gaji],
        ] as const) {
          if (!rek) continue;
          if (jenis === "TUKIN") rekeningTukin++;
          else rekeningGaji++;
          const isi = {
            kodeBankSpan: rek.kodeBankSpan,
            namaBank: rek.namaBank,
            nomorRekening: rek.nomorRekening,
            namaRekening: rek.namaRekening,
            sourceFileName: file.name,
            diunggahOlehId: user.id,
          };
          ops.push(
            prisma.rekeningPegawai.upsert({
              where: { pegawaiId_jenisPembayaran: { pegawaiId: b.pegawaiId, jenisPembayaran: jenis } },
              create: { pegawaiId: b.pegawaiId, jenisPembayaran: jenis, ...isi },
              update: { ...isi, diunggahPada: waktu },
            })
          );
        }
        return ops;
      });
      await prisma.$transaction(operasi);
    }

    // --- Bahan pemeriksaan manusia ---
    const bedaNama = siapSimpan.filter((b) => samakan(b.nama) !== samakan(b.namaSiap));
    const totalAktif = await prisma.pegawai.count({ where: { statusPegawai: "AKTIF" } });
    const tercakup = await prisma.identitasWebGaji.count({ where: { pegawai: { statusPegawai: "AKTIF" } } });

    const peringatan = [...hasil.peringatan];
    const ganda = nipGanda(hasil.baris);
    if (ganda.length > 0) {
      peringatan.push(
        `${ganda.length} NIP muncul lebih dari sekali di berkas (contoh: ${ganda
          .slice(0, 3)
          .map((g) => g.nip)
          .join(", ")}). Yang tersimpan adalah baris TERAKHIR untuk NIP itu.`
      );
    }
    for (const b of kodeBankBernamaGanda(hasil.baris)) {
      peringatan.push(
        `Kode bank ${b.kodeBankSpan} dipakai dengan ${b.nama.length} nama bank berbeda: ` +
          `${b.nama.map((n) => `${n.nama} (${n.jumlah})`).join(", ")}. ` +
          `Pemisahan berkas ADK memakai KODE-nya, jadi semuanya akan masuk satu berkas - perlu diperiksa.`
      );
    }

    await prisma.auditTrail.create({
      data: {
        entitas: "identitas_web_gaji",
        entitasId: file.name,
        aksi: "IMPORT",
        aktor: user.nip,
        dataSesudah: {
          berkas: file.name,
          dibaca: hasil.baris.length,
          tersimpan: siapSimpan.length,
          rekeningTukin,
          rekeningGaji,
          sumber: "Upload basis data gaji Kemnaker",
        },
      },
    });

    revalidatePath("/ppabp/basis-data-gaji");
    return {
      success: `${siapSimpan.length} identitas pegawai tersimpan dari berkas "${file.name}".`,
      ringkasan: {
        dibaca: hasil.baris.length,
        identitasTersimpan: siapSimpan.length,
        rekeningTukin,
        rekeningGaji,
        namaBerbedaDariSiap: bedaNama.length,
        contohBedaNama: bedaNama.slice(0, 5).map((b) => ({ nip: b.nip, siap: b.namaSiap, webGaji: b.nama })),
        pegawaiAktifBelumTercakup: Math.max(0, totalAktif - tercakup),
      },
      peringatan,
      dilewati: kelompokkanAlasan(dilewati),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
