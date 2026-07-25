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

  const header = "NIP,Nama,Satuan Kerja,Komponen Kehadiran,Komponen Kinerja,Tukin Pokok,Potongan PPh,Tukin Bersih";
  const csvRows = rows.map((r) =>
    [r.pegawai.nip, r.pegawai.nama, r.pegawai.satuanKerja, r.komponenKehadiran, r.komponenKinerja, r.tukinPokok, r.potonganPph, r.tukinBersih]
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
