import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";

/**
 * Export ADK Tunjangan Kinerja - CSV berisi baris TukinCalculation yang
 * SUDAH APPROVED untuk periode tertentu, siap diunggah manual ke Web Gaji
 * (belum ada API resmi Web Gaji, lihat CLAUDE.md). Route Handler (bukan
 * Server Action) supaya bisa jadi link `<a href>` biasa (GET, trigger
 * download langsung tanpa JS) - konsisten dengan pola halaman lain yang
 * menghindari client-side JS kalau tidak perlu.
 *
 * Kolom disamakan dengan format ADK "daftar bayar" ASLI (contoh dari user:
 * adk_tunkin-PNS_ROMUM_JUni__2026.xlsx) - Nilai Bruto/Potongan/Bersih persis
 * sama artinya dengan tukinPokok/potonganPph/tukinBersih (tukinBersih =
 * tukinPokok - potonganPph, sudah dicek cocok sama contoh aslinya).
 *
 * KOLOM YANG SENGAJA DIKOSONGKAN (bukan lupa) - datanya TIDAK ADA di skema
 * manapun, jangan diisi asal-asalan:
 *   - Kode Satker: belum ada mapping satuanKerja -> kode satker resmi
 *   - Nomor SK, Nomor Tukin Lama/Baru: TukinCalculation tidak menyimpan
 *     referensi nomor SK sama sekali
 *   - Kode Bank SPAN/Nama Bank/Nomor Rekening/Nama Rekening: Pegawai TIDAK
 *     punya data rekening bank - ini PII finansial, jangan pernah diisi
 *     tebakan/dummy. Kalau nanti ada sumber datanya, tambahkan field baru
 *     ke model Pegawai (migrasi terpisah), JANGAN taruh di sini dulu.
 *   - Bulan Awal/Tahun Awal/Bulan Akhir/Tahun Akhir: di contoh asli
 *     nilainya beda dengan bulan pembayaran (kemungkinan periode cakupan
 *     SK, bukan periode kalkulasi) - artinya belum jelas, dikosongkan
 *     daripada menebak.
 * "Tukin Kali" default 1 (SEMUA baris contoh asli nilainya 1 - bukan
 * ditebak, itu pola yang konsisten di data referensi).
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

  const bulanPad = String(bulan).padStart(2, "0");
  const header = [
    "NO", "Kode Satker", "Bulan", "Tahun", "NIP", "Nama Pegawai", "Nomor SK", "Kode Grade",
    "Nilai Bruto", "Nilai Potongan", "Nilai Bersih",
    "Kode Bank SPAN", "Nama Bank", "Nomor Rekening", "Nama Rekening",
    "Bulan Awal", "Tahun Awal", "Bulan Akhir", "Tahun Akhir", "Tukin Kali",
    "Nomor Tukin Lama", "Nomor Tukin Baru",
  ].join(",");
  const csvRows = rows.map((r, i) =>
    [
      i + 1, "", bulanPad, tahun, r.pegawai.nip, r.pegawai.nama, "", r.pegawai.kelasJabatan ?? "",
      r.tukinPokok, r.potonganPph, r.tukinBersih,
      "", "", "", "",
      "", "", "", "", 1,
      "", "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header, ...csvRows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adk-tukin-${bulan}-${tahun}.csv"`,
    },
  });
}
