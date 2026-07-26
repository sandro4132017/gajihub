import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";

/**
 * Export ADK Uang Lembur - lihat catatan lengkap di ../tukin/route.ts.
 *
 * TIDAK disamakan dengan format ADK lembur ASLI (contoh dari user:
 * templatelemburPPPK202606.xlsx, ADK-U.Lembur-PNS-Romum_JUni.2026.xlsm) -
 * format asli itu per-HARI (kolom NIP + JHARI1..JHARI31 + total), sementara
 * UangLembur di skema Gajihub cuma simpan totalJamLembur SATU ANGKA per
 * bulan (tidak ada rincian jam lembur per tanggal di skema manapun - lihat
 * TODO(confirm) di RekapKehadiranPeriode, src/types/index.ts). Bikin
 * kolom JHARI1..31 dari data yang ada berarti mengarang rincian per hari
 * yang sebenarnya tidak tercatat - CSV di bawah tetap format ringkas
 * (total per pegawai) sampai ada sumber data jam lembur harian yang jelas.
 */
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

  const header = "NIP,Nama,Satuan Kerja,Total Jam Lembur,Tarif Per Jam,Total Uang Lembur";
  const csvRows = rows.map((r) =>
    [r.pegawai.nip, r.pegawai.nama, r.pegawai.satuanKerja, r.totalJamLembur, r.tarifPerJam, r.totalUangLembur]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );
  const csv = [header, ...csvRows].join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adk-uang-lembur-${bulan}-${tahun}.csv"`,
    },
  });
}
