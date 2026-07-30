import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import {
  KOLOM_ADK_TUKIN,
  KOLOM_TOTAL_ADK_TUKIN,
  susunBarisAdkTukin,
  susunBarisTotalAdk,
} from "../../../../business-logic/adk";
import { responseAdk } from "../responseAdk";

/**
 * Export ADK Tunjangan Kinerja - baris TukinCalculation yang SUDAH APPROVED
 * untuk periode tertentu, siap diunggah manual ke Web Gaji (belum ada API
 * resmi, lihat CLAUDE.md).
 *
 * DUA FORMAT lewat query `?format=`:
 *   - `xlsx` (default) - Excel sungguhan, sheet "daftar bayar" seperti file
 *     contoh. Dulu route ini mengeluarkan CSV, bukan Excel.
 *   - `txt` - teks tab-separated, sama seperti hasil "save as text" dari file
 *     contoh, lengkap dengan baris TOTAL di akhir.
 * Barisnya disusun SEKALI di src/business-logic/adk.ts, jadi kedua format
 * mustahil berbeda isi.
 *
 * Tetap Route Handler (bukan Server Action) supaya bisa jadi `<a href>` biasa
 * yang langsung mengunduh tanpa JavaScript.
 */
export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canGenerateAdk(authUser)) return new Response("Tidak berwenang.", { status: 403 });

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  const rows = await prisma.tukinCalculation.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, status: "APPROVED" },
    include: { pegawai: true },
    orderBy: { pegawai: { nama: "asc" } },
  });

  // Kode satker resmi diambil dari gaji induk periode yang sama - itu
  // satu-satunya sumbernya di sistem ini (hasil upload ADK gaji GPP, lihat
  // GajiInduk.kodeSatker). Kalau periode itu belum diupload, kolomnya
  // dikosongkan, TIDAK ditebak.
  const gajiInduk = await prisma.gajiInduk.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, pegawaiId: { in: rows.map((r) => r.pegawaiId) } },
    select: { pegawaiId: true, kodeSatker: true },
  });
  const petaKodeSatker = new Map(gajiInduk.map((g) => [g.pegawaiId, g.kodeSatker]));

  const baris = susunBarisAdkTukin(
    rows.map((r) => ({
      nip: r.pegawai.nip,
      nama: r.pegawai.nama,
      kelasJabatan: r.pegawai.kelasJabatan,
      tukinPokok: r.tukinPokok,
      potonganPph: r.potonganPph,
      tukinBersih: r.tukinBersih,
      kodeSatker: petaKodeSatker.get(r.pegawaiId) ?? null,
    })),
    bulan,
    tahun
  );
  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);

  return responseAdk({
    format: req.nextUrl.searchParams.get("format"),
    header: KOLOM_ADK_TUKIN,
    baris,
    total,
    namaSheet: "daftar bayar",
    namaFile: `adk-tukin-${String(bulan).padStart(2, "0")}-${tahun}`,
  });
}
