import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import { susunBarisTotalAdk, type SelAdk } from "../../../../business-logic/adk";
import { responseAdk } from "../responseAdk";

/**
 * Export ADK Uang Lembur - dua format (xlsx & txt), lihat catatan lengkap di
 * ../tukin/route.ts.
 *
 * TETAP TIDAK disamakan dengan format ADK lembur ASLI (contoh dari user:
 * templatelemburPPPK202606.xlsx, ADK-U.Lembur-PNS-Romum_JUni.2026.xlsm) -
 * format asli itu per-HARI (kolom NIP + JHARI1..JHARI31 + total), sementara
 * UangLembur di skema Gajihub menyimpan TOTAL jam per bulan, bukan rincian
 * per tanggal. Membuat kolom JHARI1..31 dari data yang ada berarti mengarang
 * rincian harian yang tidak tercatat. Yang ditampilkan di bawah adalah kolom
 * ringkas berisi dasar perhitungannya, termasuk pemisahan hari kerja vs hari
 * libur (yang dibayar 2x) supaya angkanya bisa ditelusuri.
 */
const KOLOM = [
  "NO", "Bulan", "Tahun", "NIP", "Nama Pegawai", "Satuan Kerja",
  "Jam Lembur Hari Kerja", "Jam Lembur Hari Libur", "Tarif Per Jam",
  "Hari Makan Lembur", "Tarif Makan Lembur", "Uang Lembur", "Uang Makan Lembur",
  "Total Uang Lembur",
] as const;
const KOLOM_TOTAL = [11, 12, 13];

export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canGenerateAdk(authUser)) return new Response("Tidak berwenang.", { status: 403 });

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  const rows = await prisma.uangLembur.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, status: "APPROVED" },
    include: { pegawai: true },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const bulanPad = String(bulan).padStart(2, "0");
  const baris: SelAdk[][] = rows.map((r, i) => [
    i + 1, bulanPad, String(tahun), r.pegawai.nip, r.pegawai.nama, r.pegawai.satuanKerja,
    r.jamLemburHariKerja, r.jamLemburHariLibur, r.tarifPerJam,
    r.jumlahHariMakanLembur, r.tarifMakanLemburPerHari, r.uangLembur, r.uangMakanLembur,
    r.totalUangLembur,
  ]);
  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL, KOLOM.length);

  return responseAdk({
    format: req.nextUrl.searchParams.get("format"),
    header: KOLOM,
    baris,
    total,
    namaSheet: "uang lembur",
    namaFile: `adk-uang-lembur-${bulanPad}-${tahun}`,
  });
}
