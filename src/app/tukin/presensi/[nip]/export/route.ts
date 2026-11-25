import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "../../../../../lib/prisma";
import { getSessionAccount } from "../../../../../auth/getSessionAccount";
import {
  canBukaHalamanPredikatKinerja,
  canUploadRekapPresensi,
  type AuthUser,
} from "../../../../../auth/permissions";
import { NAMA_BULAN } from "../../../../../lib/format/bulan";
import { HEADER_EXCEL_PRESENSI_PEGAWAI, susunBarisExcelPresensiPegawai } from "../barisExcelPresensi";
import { susunBarisHarianPegawai } from "../barisHarianPegawai";
import { muatHariLiburPeriode } from "../../../../../lib/hariLibur";

/**
 * Unduh rincian harian presensi SATU pegawai untuk satu periode, sebagai Excel.
 * Kolomnya sama dengan tabel "Rincian harian" di halaman pegawai.
 *
 * Izinnya SAMA PERSIS dengan halaman `/tukin/presensi/[nip]`: peran yang boleh
 * membuka halaman itu, dan pegawai di dalam kewenangan satuan kerjanya
 * (Kasubag TU hanya unitnya sendiri). Satker diambil dari baris Pegawai di
 * database, bukan dari URL.
 *
 * exceljs, bukan `xlsx`: kolom tanggal butuh format angka per kolom.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ nip: string }> }) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser: AuthUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canBukaHalamanPredikatKinerja(authUser)) {
    return new Response("Peran kamu tidak berwenang melihat data presensi pegawai.", { status: 403 });
  }

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!Number.isInteger(bulan) || !Number.isInteger(tahun) || bulan < 1 || bulan > 12 || tahun < 2000) {
    return new Response("Parameter bulan (1-12) dan tahun wajib diisi.", { status: 400 });
  }

  const { nip } = await params;
  const pegawai = await prisma.pegawai.findUnique({
    where: { nip },
    select: { id: true, nip: true, nama: true, satuanKerja: true, unitKerja: true },
  });
  if (!pegawai) return new Response("Pegawai tidak ditemukan.", { status: 404 });
  if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja)) {
    return new Response("Pegawai ini di luar kewenangan kamu.", { status: 403 });
  }

  const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
  const akhir = new Date(Date.UTC(tahun, bulan, 1));
  const [harian, koreksi, kendala, hariLibur] = await Promise.all([
    prisma.presensiHarian.findMany({
      where: { pegawaiId: pegawai.id, tanggal: { gte: awal, lt: akhir } },
      orderBy: { tanggal: "asc" },
      select: {
        tanggal: true,
        statusKehadiran: true,
        jamMasuk: true,
        jamKeluar: true,
        menitTerlambat: true,
        menitPulangCepat: true,
        menitMeninggalkanKantor: true,
        tidakIkutUpacara: true,
        jamLembur: true,
      },
    }),
    prisma.koreksiPresensiHarian.findMany({
      where: { pegawaiId: pegawai.id, tanggal: { gte: awal, lt: akhir } },
      select: { tanggal: true, jamMasuk: true, jamKeluar: true, jamLembur: true },
    }),
    prisma.kendalaEpresensi.findMany({
      where: {
        tanggal: { gte: awal, lt: akhir },
        OR: [{ satuanKerja: null }, { satuanKerja: pegawai.satuanKerja }],
      },
      select: { tanggal: true },
    }),
    muatHariLiburPeriode(bulan, tahun),
  ]);

  const petaKoreksi = new Map(koreksi.map((k) => [k.tanggal.toISOString().slice(0, 10), k]));
  // Potongan per hari disusun fungsi yang SAMA dengan halaman pegawai.
  const potongan = susunBarisHarianPegawai(harian, {
    petaKoreksi,
    tanggalKendala: new Set(kendala.map((k) => k.tanggal.toISOString().slice(0, 10))),
    hariLibur,
  });
  const baris = susunBarisExcelPresensiPegawai(harian, petaKoreksi, potongan);

  const periode = `${NAMA_BULAN[bulan - 1]} ${tahun}`;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Rincian harian");
  ws.addRow(["Rincian presensi pegawai"]).font = { bold: true, size: 13 };
  ws.addRow(["Nama", pegawai.nama]);
  // NIP sebagai teks - 18 digit melewati presisi angka Excel.
  ws.addRow(["NIP", pegawai.nip]);
  ws.addRow(["Unit kerja", pegawai.unitKerja]);
  ws.addRow(["Satuan kerja", pegawai.satuanKerja]);
  ws.addRow(["Periode", periode]);
  ws.addRow([]);
  const barisHeader = ws.addRow([...HEADER_EXCEL_PRESENSI_PEGAWAI]);
  barisHeader.font = { bold: true };
  barisHeader.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EDF5" } };
    c.border = { bottom: { style: "thin" } };
  });
  if (baris.length === 0) ws.addRow(["Periode ini belum dilakukan sinkronisasi."]);
  for (const b of baris) ws.addRow(b);

  ws.getColumn(1).numFmt = "dd/mm/yyyy";
  const lebar = [12, 10, 16, 9, 9, 13, 26, 10, 13, 60, 13, 40];
  lebar.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="presensi-${pegawai.nip}-${NAMA_BULAN[bulan - 1]}-${tahun}.xlsx"`,
      // Data presensi pribadi - jangan tersimpan di cache proxy bersama.
      "Cache-Control": "private, no-store",
    },
  });
}
