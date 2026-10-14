import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

async function main() {
  const prisma = new PrismaClient();
  console.log('Mengambil data rekap presensi dari database...');

  const startTime = Date.now();

  // 1. Ambil seluruh data rekap presensi periode beserta info pegawai
  const dataRekap = await prisma.rekapPresensiPeriode.findMany({
    include: {
      pegawai: {
        select: {
          nip: true,
          nama: true,
          satuanKerja: true,
          jabatan: true,
          statusPegawai: true,
        },
      },
    },
    orderBy: [
      { periodeTahun: 'desc' },
      { periodeBulan: 'desc' },
      { pegawai: { satuanKerja: 'asc' } },
      { pegawai: { nama: 'asc' } },
    ],
  });

  console.log(`Berhasil mengambil ${dataRekap.length.toLocaleString('id-ID')} baris rekap dalam ${((Date.now() - startTime) / 1000).toFixed(1)}s.`);

  // 2. Buat Workbook ExcelJS
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gajihub Kemnaker - Sistem Integrasi Belanja Pegawai';
  wb.created = new Date();

  // -------------------------------------------------------------------------
  // SHEET 1: REKAP BULANAN PEGAWAI (Detail per Orang per Bulan)
  // -------------------------------------------------------------------------
  const wsPegawai = wb.addWorksheet('Rekap Pegawai Bulanan', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 1 }],
  });

  wsPegawai.columns = [
    { header: 'Tahun', key: 'tahun', width: 8 },
    { header: 'Bulan', key: 'bulan', width: 12 },
    { header: 'NIP', key: 'nip', width: 22 },
    { header: 'Nama Pegawai', key: 'nama', width: 35 },
    { header: 'Satuan Kerja', key: 'satker', width: 38 },
    { header: 'Status Pegawai', key: 'statusPegawai', width: 15 },
    { header: 'Hari Kerja', key: 'hariKerja', width: 11 },
    { header: 'Total Hadir', key: 'hadir', width: 12 },
    { header: 'Hadir WFO', key: 'wfo', width: 11 },
    { header: 'Hadir WFH/WFA', key: 'wfh', width: 13 },
    { header: 'Dinas Luar', key: 'dinasLuar', width: 12 },
    { header: 'Diklat', key: 'diklat', width: 10 },
    { header: 'Tugas Belajar', key: 'tugasBelajar', width: 13 },
    { header: 'Cuti', key: 'cuti', width: 10 },
    { header: 'Jenis Cuti', key: 'jenisCuti', width: 18 },
    { header: 'Alpha (Hari)', key: 'alpha', width: 12 },
    { header: 'Lupa Presensi (x)', key: 'lupaPresensi', width: 16 },
    { header: 'Terlambat (Menit)', key: 'terlambat', width: 16 },
    { header: 'Pulang Cepat (Menit)', key: 'pulangCepat', width: 18 },
    { header: 'Meninggalkan Kantor (Menit)', key: 'keluarKantor', width: 22 },
    { header: 'Tidak Ikut Upacara', key: 'upacara', width: 16 },
    { header: 'Jam Lembur (Hari Kerja)', key: 'lemburKerja', width: 20 },
    { header: 'Jam Lembur (Hari Libur)', key: 'lemburLibur', width: 20 },
    { header: 'Total Jam Lembur', key: 'totalLembur', width: 16 },
    { header: 'Makan Lembur (Hari)', key: 'makanLembur', width: 16 },
  ];

  // Format Header Sheet 1
  const headerRow1 = wsPegawai.getRow(1);
  headerRow1.height = 26;
  headerRow1.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow1.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Slate 800 Navy
  };
  headerRow1.alignment = { vertical: 'middle', horizontal: 'center' };

  for (const r of dataRekap) {
    const row = wsPegawai.addRow({
      tahun: r.periodeTahun,
      bulan: NAMA_BULAN[r.periodeBulan - 1] ?? r.periodeBulan,
      nip: r.pegawai.nip,
      nama: r.pegawai.nama,
      satker: r.pegawai.satuanKerja,
      statusPegawai: r.pegawai.statusPegawai,
      hariKerja: r.jumlahHariKerja,
      hadir: r.jumlahHariHadir,
      wfo: r.jumlahHariWfo,
      wfh: r.jumlahHariWfhWfa,
      dinasLuar: r.jumlahHariDinasLuar,
      diklat: r.jumlahHariDiklat,
      tugasBelajar: r.jumlahHariTugasBelajar,
      cuti: r.jumlahHariCuti,
      jenisCuti: r.jenisCutiAktif ?? '-',
      alpha: r.jumlahHariAlpha,
      lupaPresensi: r.jumlahTidakPresensi,
      terlambat: r.totalMenitTerlambat,
      pulangCepat: r.totalMenitPulangCepat,
      keluarKantor: r.totalMenitMeninggalkanKantor,
      upacara: r.jumlahTidakIkutUpacara > 0 ? `${r.jumlahTidakIkutUpacara}x` : '-',
      lemburKerja: r.totalJamLembur,
      lemburLibur: r.totalJamLemburHariLibur,
      totalLembur: r.totalJamLembur + r.totalJamLemburHariLibur,
      makanLembur: r.jumlahHariMakanLembur + r.jumlahHariMakanLemburHariLibur,
    });

    // Formatting numbers
    [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 19, 20, 22, 23, 24, 25].forEach((colIdx) => {
      row.getCell(colIdx).numFmt = '#,##0';
    });
  }

  // -------------------------------------------------------------------------
  // SHEET 2: REKAP AGREGAT PER SATUAN KERJA (Tingkat Disiplin & Kehadiran)
  // -------------------------------------------------------------------------
  const wsSatker = wb.addWorksheet('Rekap per Satuan Kerja', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });

  wsSatker.columns = [
    { header: 'Tahun', key: 'tahun', width: 8 },
    { header: 'Bulan', key: 'bulan', width: 12 },
    { header: 'Satuan Kerja', key: 'satker', width: 40 },
    { header: 'Jumlah Pegawai', key: 'jmlPegawai', width: 14 },
    { header: 'Rata2 Kehadiran', key: 'persenHadir', width: 15 },
    { header: 'Total Terlambat (Menit)', key: 'totalTerlambat', width: 20 },
    { header: 'Rata2 Terlambat/Orang (Mnt)', key: 'avgTerlambat', width: 24 },
    { header: 'Total Pulang Cepat (Menit)', key: 'totalPulangCepat', width: 22 },
    { header: 'Total Lupa Presensi (x)', key: 'totalLupa', width: 18 },
    { header: 'Total Hari Alpha', key: 'totalAlpha', width: 15 },
    { header: 'Total Jam Lembur', key: 'totalLembur', width: 16 },
  ];

  const headerRow2 = wsSatker.getRow(1);
  headerRow2.height = 26;
  headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow2.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F766E' }, // Teal 700
  };
  headerRow2.alignment = { vertical: 'middle', horizontal: 'center' };

  // Hitung agregat per satker per periode
  const mapSatker = new Map<string, {
    tahun: number;
    bulan: number;
    satker: string;
    jmlPegawai: number;
    totalHariKerja: number;
    totalHariHadir: number;
    totalTerlambat: number;
    totalPulangCepat: number;
    totalLupa: number;
    totalAlpha: number;
    totalLembur: number;
  }>();

  for (const r of dataRekap) {
    const key = `${r.periodeTahun}-${r.periodeBulan}-${r.pegawai.satuanKerja}`;
    let stat = mapSatker.get(key);
    if (!stat) {
      stat = {
        tahun: r.periodeTahun,
        bulan: r.periodeBulan,
        satker: r.pegawai.satuanKerja,
        jmlPegawai: 0,
        totalHariKerja: 0,
        totalHariHadir: 0,
        totalTerlambat: 0,
        totalPulangCepat: 0,
        totalLupa: 0,
        totalAlpha: 0,
        totalLembur: 0,
      };
      mapSatker.set(key, stat);
    }
    stat.jmlPegawai++;
    stat.totalHariKerja += r.jumlahHariKerja;
    stat.totalHariHadir += r.jumlahHariHadir;
    stat.totalTerlambat += r.totalMenitTerlambat;
    stat.totalPulangCepat += r.totalMenitPulangCepat;
    stat.totalLupa += r.jumlahTidakPresensi;
    stat.totalAlpha += r.jumlahHariAlpha;
    stat.totalLembur += r.totalJamLembur + r.totalJamLemburHariLibur;
  }

  const listAgregat = Array.from(mapSatker.values()).sort((a, b) => {
    if (a.tahun !== b.tahun) return b.tahun - a.tahun;
    if (a.bulan !== b.bulan) return b.bulan - a.bulan;
    return a.satker.localeCompare(b.satker, 'id-ID');
  });

  for (const s of listAgregat) {
    const persenHadir = s.totalHariKerja > 0 ? (s.totalHariHadir / s.totalHariKerja) : 0;
    const avgTerlambat = s.jmlPegawai > 0 ? Math.round(s.totalTerlambat / s.jmlPegawai) : 0;

    const row = wsSatker.addRow({
      tahun: s.tahun,
      bulan: NAMA_BULAN[s.bulan - 1] ?? s.bulan,
      satker: s.satker,
      jmlPegawai: s.jmlPegawai,
      persenHadir: persenHadir,
      totalTerlambat: s.totalTerlambat,
      avgTerlambat: avgTerlambat,
      totalPulangCepat: s.totalPulangCepat,
      totalLupa: s.totalLupa,
      totalAlpha: s.totalAlpha,
      totalLembur: s.totalLembur,
    });

    row.getCell(4).numFmt = '#,##0';
    row.getCell(5).numFmt = '0.0%';
    row.getCell(6).numFmt = '#,##0';
    row.getCell(7).numFmt = '#,##0';
    row.getCell(8).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0';
    row.getCell(10).numFmt = '#,##0';
    row.getCell(11).numFmt = '#,##0.0';
  }

  // -------------------------------------------------------------------------
  // SHEET 3: RINGKASAN TREN KEMENTERIAN
  // -------------------------------------------------------------------------
  const wsTren = wb.addWorksheet('Tren Kementerian', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  wsTren.columns = [
    { header: 'Tahun', key: 'tahun', width: 8 },
    { header: 'Bulan', key: 'bulan', width: 14 },
    { header: 'Total Pegawai Aktif', key: 'totalPegawai', width: 18 },
    { header: 'Tingkat Kehadiran', key: 'tingkatHadir', width: 16 },
    { header: 'Total Jam Hadir Kerja', key: 'totalJamHadir', width: 20 },
    { header: 'Total Keterlambatan (Jam)', key: 'jamTerlambat', width: 22 },
    { header: 'Total Pulang Cepat (Jam)', key: 'jamPulangCepat', width: 22 },
    { header: 'Total Hari Alpha (Kasus)', key: 'totalAlpha', width: 20 },
    { header: 'Total Jam Lembur', key: 'totalLembur', width: 18 },
  ];

  const headerRow3 = wsTren.getRow(1);
  headerRow3.height = 26;
  headerRow3.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow3.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A8A' }, // Blue 900
  };
  headerRow3.alignment = { vertical: 'middle', horizontal: 'center' };

  // Kelompokkan per tahun-bulan
  const mapPeriode = new Map<string, {
    tahun: number;
    bulan: number;
    totalPegawai: number;
    totalHariKerja: number;
    totalHariHadir: number;
    totalTerlambatMenit: number;
    totalPulangCepatMenit: number;
    totalAlpha: number;
    totalLembur: number;
  }>();

  for (const r of dataRekap) {
    const key = `${r.periodeTahun}-${r.periodeBulan}`;
    let p = mapPeriode.get(key);
    if (!p) {
      p = {
        tahun: r.periodeTahun,
        bulan: r.periodeBulan,
        totalPegawai: 0,
        totalHariKerja: 0,
        totalHariHadir: 0,
        totalTerlambatMenit: 0,
        totalPulangCepatMenit: 0,
        totalAlpha: 0,
        totalLembur: 0,
      };
      mapPeriode.set(key, p);
    }
    p.totalPegawai++;
    p.totalHariKerja += r.jumlahHariKerja;
    p.totalHariHadir += r.jumlahHariHadir;
    p.totalTerlambatMenit += r.totalMenitTerlambat;
    p.totalPulangCepatMenit += r.totalMenitPulangCepat;
    p.totalAlpha += r.jumlahHariAlpha;
    p.totalLembur += r.totalJamLembur + r.totalJamLemburHariLibur;
  }

  const listTren = Array.from(mapPeriode.values()).sort((a, b) => {
    if (a.tahun !== b.tahun) return a.tahun - b.tahun;
    return a.bulan - b.bulan;
  });

  for (const t of listTren) {
    const tingkatHadir = t.totalHariKerja > 0 ? (t.totalHariHadir / t.totalHariKerja) : 0;
    const jamHadir = t.totalHariHadir * 7.5; // Estimasi 7.5 jam/hari
    const jamTerlambat = Math.round(t.totalTerlambatMenit / 60);
    const jamPulangCepat = Math.round(t.totalPulangCepatMenit / 60);

    const row = wsTren.addRow({
      tahun: t.tahun,
      bulan: NAMA_BULAN[t.bulan - 1] ?? t.bulan,
      totalPegawai: t.totalPegawai,
      tingkatHadir: tingkatHadir,
      totalJamHadir: jamHadir,
      jamTerlambat: jamTerlambat,
      jamPulangCepat: jamPulangCepat,
      totalAlpha: t.totalAlpha,
      totalLembur: t.totalLembur,
    });

    row.getCell(3).numFmt = '#,##0';
    row.getCell(4).numFmt = '0.0%';
    row.getCell(5).numFmt = '#,##0';
    row.getCell(6).numFmt = '#,##0';
    row.getCell(7).numFmt = '#,##0';
    row.getCell(8).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0.0';
  }

  // 3. Simpan file Excel ke folder public/downloads/
  const outputDir = path.join(process.cwd(), 'public', 'downloads');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputPath = path.join(outputDir, 'Review_Jam_Kerja_dan_Absensi_Pegawai_Kemnaker_2026.xlsx');
  console.log('Menulis file Excel ke:', outputPath);
  await wb.xlsx.writeFile(outputPath);

  const stats = fs.statSync(outputPath);
  console.log(`\nBERHASIL! File Excel berhasil dibuat:`);
  console.log(`Path: ${outputPath}`);
  console.log(`Ukuran File: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Waktu proses: ${((Date.now() - startTime) / 1000).toFixed(1)} detik.`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

