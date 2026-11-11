// Penyimpanan bukti koreksi jam presensi - dipakai KEDUA jalur koreksi
// (halaman presensi pegawai dan Kalkulasi unit). Hanya sisi server.

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { akarStorage, cocokTandaTangan, jalurAman, kunciBuktiKoreksi } from "./berkasPrivat";
import { validasiBuktiKoreksi } from "../../business-logic/koreksiPresensi";

export type BuktiSiap =
  | { status: "tidak-ada" }
  | { status: "galat"; error: string }
  | { status: "siap"; buffer: Buffer; ekstensi: string; nama: string };

/**
 * Memeriksa berkas bukti dari form TANPA menulis apa pun ke disk.
 * Kolom berkas yang tidak dipilih (tanpa nama / ukuran 0) = `tidak-ada`.
 */
export async function periksaBuktiKoreksi(entri: FormDataEntryValue | null): Promise<BuktiSiap> {
  if (!entri || typeof entri === "string") return { status: "tidak-ada" };
  const berkas = entri as File;
  if (!berkas.name && berkas.size === 0) return { status: "tidak-ada" };

  const v = validasiBuktiKoreksi({ nama: berkas.name, ukuran: berkas.size });
  if (!v.ok) return { status: "galat", error: v.error };

  const buffer = Buffer.from(await berkas.arrayBuffer());
  if (!cocokTandaTangan(buffer, v.ekstensi)) {
    return { status: "galat", error: "Isi berkas bukti tidak sesuai formatnya. Pastikan berkas benar-benar JPG, PNG, atau PDF." };
  }
  return { status: "siap", buffer, ekstensi: v.ekstensi, nama: berkas.name };
}

/**
 * Menulis bukti ke penyimpanan privat dan mengembalikan kuncinya, atau `null`
 * bila lokasi tidak lolos pemeriksaan jalur. Panggil PALING AKHIR, setelah
 * semua validasi lolos.
 */
export async function tulisBuktiKoreksi(arg: {
  buffer: Buffer;
  ekstensi: string;
  satuanKerja: string;
  tanggal: Date;
  /** Penanda sisi di nama berkas (tanpa NIP). */
  sisi?: "masuk" | "keluar" | "lembur";
}): Promise<string | null> {
  const tanggalIso = arg.tanggal.toISOString().slice(0, 10);
  const kunci = kunciBuktiKoreksi(
    arg.satuanKerja,
    arg.tanggal.getUTCFullYear(),
    arg.tanggal.getUTCMonth() + 1,
    tanggalIso,
    Date.now(),
    crypto.randomBytes(4).toString("hex"),
    arg.ekstensi,
    arg.sisi
  );
  const target = jalurAman(kunci, "bukti-koreksi", akarStorage());
  if (!target) return null;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, arg.buffer);
  return kunci;
}
