import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canExportRekapUnit } from "../../../../auth/permissions";
import { resolveSatkerEfektif } from "../../../dashboardScope";
import { susunRekapTukinExcel } from "../../../../business-logic/rekapUnitExcel";
import { responseRekapExcel } from "../../../responseRekapExcel";
import { NAMA_BULAN } from "../../../bulan";
import type { AuthUser } from "../../../../auth/permissions";

/**
 * Unduh rekap Tunjangan Kinerja satu unit untuk satu periode, sebagai Excel.
 *
 * Isinya kolom yang sudah tampil di `/kasubag/kalkulasi`: tukin pokok,
 * komponen kehadiran (30%), komponen kinerja (70%), potongan PPh, tukin
 * bersih, status siklus, dan catatan anomali - plus baris TOTAL.
 *
 * SELURUH STATUS IKUT, bukan hanya APPROVED. Itu bedanya yang paling penting
 * dari ADK: ADK hanya boleh memuat baris APPROVED karena berkas itu perintah
 * bayar. Rekap ini justru dipakai MEMERIKSA sebelum menyetujui, jadi baris
 * DRAFT dan SELISIH-lah yang paling perlu dilihat. Kolom "Status" yang
 * membedakannya, dan kolom itu wajib ada supaya tidak ada yang mengira seluruh
 * isi berkas sudah disetujui.
 *
 * Route Handler, bukan Server Action, supaya bisa jadi `<a href>` biasa yang
 * langsung mengunduh tanpa JavaScript.
 */
export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser: AuthUser = {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  // Memakai `resolveSatkerEfektif` yang SAMA dengan halamannya - KASUBAG_TU
  // dipaksa ke unitnya sendiri dan `?satker=` dari luar diabaikan. Dipakai
  // ulang, bukan ditulis lagi, supaya scoping halaman dan scoping unduhan
  // mustahil berbeda.
  const satkerEfektif = resolveSatkerEfektif(authUser, req.nextUrl.searchParams.get("satker") ?? undefined);
  if (!satkerEfektif) {
    return new Response("Pilih satuan kerja dulu sebelum mengunduh.", { status: 400 });
  }
  if (!canExportRekapUnit(authUser, satkerEfektif)) {
    return new Response("Tidak berwenang mengunduh rekap unit ini.", { status: 403 });
  }

  const rows = await prisma.tukinCalculation.findMany({
    where: {
      periodeBulan: bulan,
      periodeTahun: tahun,
      pegawai: { satuanKerja: satkerEfektif },
    },
    include: { pegawai: { select: { nip: true, nama: true, jabatan: true, kelasJabatan: true } } },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const rekap = susunRekapTukinExcel(
    rows.map((r) => ({
      nip: r.pegawai.nip,
      nama: r.pegawai.nama,
      jabatan: r.pegawai.jabatan,
      kelasJabatan: r.pegawai.kelasJabatan,
      tukinPokok: r.tukinPokok,
      komponenKehadiran: r.komponenKehadiran,
      komponenKinerja: r.komponenKinerja,
      potonganPph: r.potonganPph,
      tukinBersih: r.tukinBersih,
      status: r.status,
      catatanAnomali: r.catatanAnomali,
    }))
  );

  return responseRekapExcel({
    rekap,
    namaSheet: "Rekap Tukin",
    namaFile: `rekap-tukin-${namaBerkas(satkerEfektif)}-${NAMA_BULAN[bulan - 1]}-${tahun}`,
  });
}

/** Nama unit jadi potongan nama berkas yang aman di semua sistem berkas. */
function namaBerkas(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
