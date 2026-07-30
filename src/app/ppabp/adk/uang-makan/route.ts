import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import { susunBarisTotalAdk, type SelAdk } from "../../../../business-logic/adk";
import { responseAdk } from "../responseAdk";

/**
 * Export ADK Uang Makan - dua format (xlsx & txt), lihat catatan lengkap di
 * ../tukin/route.ts.
 *
 * Kolomnya BUKAN format "daftar bayar" resmi seperti ADK Tukin - belum ada
 * contoh file ADK uang makan dari user, jadi yang dipakai adalah kolom
 * ringkas berisi dasar perhitungannya. Struktur & baris totalnya mengikuti
 * pola yang sama dengan ADK Tukin supaya kedua file terasa satu keluarga.
 * TODO(confirm): minta contoh ADK uang makan asli kalau formatnya memang
 * sudah baku di Web Gaji.
 */
const KOLOM = [
  "NO", "Bulan", "Tahun", "NIP", "Nama Pegawai", "Satuan Kerja",
  "Hari Kerja", "Hari Hadir", "Hari Dibayar", "Tarif Harian", "Total Uang Makan",
] as const;
const KOLOM_TOTAL = [10];

export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canGenerateAdk(authUser)) return new Response("Tidak berwenang.", { status: 403 });

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  const rows = await prisma.uangMakan.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, status: "APPROVED" },
    include: { pegawai: true },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const bulanPad = String(bulan).padStart(2, "0");
  const baris: SelAdk[][] = rows.map((r, i) => [
    i + 1, bulanPad, String(tahun), r.pegawai.nip, r.pegawai.nama, r.pegawai.satuanKerja,
    r.jumlahHariKerja, r.jumlahHariHadir, r.jumlahHariDibayar, r.tarifHarian, r.totalUangMakan,
  ]);
  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL, KOLOM.length);

  return responseAdk({
    format: req.nextUrl.searchParams.get("format"),
    header: KOLOM,
    baris,
    total,
    namaSheet: "uang makan",
    namaFile: `adk-uang-makan-${bulanPad}-${tahun}`,
  });
}
