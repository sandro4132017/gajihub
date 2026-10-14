import ExcelJS from 'exceljs';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { bukaPoolSiap } from '../src/lib/siapConfig';

const NAMA_BULAN = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

interface MonthlyRow {
  tahun: string;
  bulan: string;
  id_pegawai: string;
  nama_epresensi: string;
  satker_epresensi: string;
  total_hari_tercatat: string;
  hari_wfo: string;
  hari_wfh_wfa: string;
  hari_dinas_luar: string;
  hari_diklat: string;
  hari_cuti: string;
  hari_tubel: string;
  hari_alpha: string;
  hari_hadir_fisik: string;
  total_menit_kerja: string;
  total_jam_kerja: string;
  avg_jam_kerja_harian: string;
  frek_terlambat: string;
  total_menit_terlambat: string;
  frek_pulang_cepat: string;
  total_menit_pulang_cepat: string;
  lupa_tap_keluar: string;
}

interface SatkerSummary {
  tahun: string;
  satker: string;
  jml_pegawai_bulan: number;
  total_jam_kerja: number;
  avg_jam_kerja_bulan: number;
  total_terlambat_menit: number;
  frek_terlambat: number;
  frek_pulang_cepat: number;
  total_alpha: number;
  total_cuti: number;
  total_dinas: number;
}

function buildYearQuery(startDate: string, endDate: string) {
  return `
    SELECT 
      to_char(p.tanggal, 'YYYY') as tahun,
      to_char(p.tanggal, 'MM') as bulan,
      p.id_pegawai,
      MAX(p.nama_pegawai) as nama_epresensi,
      MAX(p.nama_satker) as satker_epresensi,
      COUNT(*) as total_hari_tercatat,
      SUM(CASE WHEN p.id_sistem_kerja = 'c4871800-8316-4019-bed8-de389735777a' THEN 1 ELSE 0 END) as hari_wfo,
      SUM(CASE WHEN p.id_sistem_kerja IN ('9f4971b9-f67a-4ab2-b149-8c66fbd31ce9', 'ba0089ea-5f36-4839-b046-3584d6ad9ccd') THEN 1 ELSE 0 END) as hari_wfh_wfa,
      SUM(CASE WHEN p.id_sistem_kerja = 'f3ba247c-4853-4f4e-bece-8344fc66b8b0' THEN 1 ELSE 0 END) as hari_dinas_luar,
      SUM(CASE WHEN p.id_sistem_kerja = 'd64ff0db-0247-4dc7-b6c2-72593935f2a3' THEN 1 ELSE 0 END) as hari_diklat,
      SUM(CASE WHEN p.id_sistem_kerja = 'b80c715e-e510-4f7e-91e7-0e513f8f812f' THEN 1 ELSE 0 END) as hari_cuti,
      SUM(CASE WHEN p.id_sistem_kerja = '24a5e185-6651-4063-8c99-d51dbb87a812' THEN 1 ELSE 0 END) as hari_tubel,
      SUM(CASE WHEN p.id_sistem_kerja IN ('f8351e3f-6a45-454b-b855-110821b1416a', '614a9fe0-6ca5-405c-b7fd-6576775dfcc6') THEN 1 ELSE 0 END) as hari_alpha,
      SUM(CASE WHEN (p.jam_masuk IS NOT NULL AND p.jam_masuk != '' AND p.jam_masuk != '00:00') 
                 OR (p.jam_keluar IS NOT NULL AND p.jam_keluar != '' AND p.jam_keluar != '00:00') THEN 1 ELSE 0 END) as hari_hadir_fisik,
      SUM(COALESCE(p.menit_kerja, 0)) as total_menit_kerja,
      ROUND(SUM(COALESCE(p.menit_kerja, 0)) / 60.0, 1) as total_jam_kerja,
      ROUND(AVG(CASE WHEN p.menit_kerja > 0 THEN p.menit_kerja / 60.0 ELSE NULL END), 2) as avg_jam_kerja_harian,
      SUM(CASE WHEN p.jam_masuk > '08:00' AND p.jam_masuk != '00:00' THEN 1 ELSE 0 END) as frek_terlambat,
      SUM(CASE 
        WHEN p.jam_masuk > '08:00' AND p.jam_masuk <= '12:00' AND LENGTH(p.jam_masuk) >= 5 AND p.jam_masuk NOT LIKE '%:%:%:%'
        THEN (SUBSTRING(p.jam_masuk, 1, 2)::int * 60 + SUBSTRING(p.jam_masuk, 4, 2)::int) - 480 
        ELSE 0 
      END) as total_menit_terlambat,
      SUM(CASE WHEN p.jam_keluar < '16:00' AND p.jam_keluar IS NOT NULL AND p.jam_keluar != '' AND p.jam_keluar != '00:00' THEN 1 ELSE 0 END) as frek_pulang_cepat,
      SUM(CASE 
        WHEN p.jam_keluar < '16:00' AND p.jam_keluar >= '12:00' AND LENGTH(p.jam_keluar) >= 5
        THEN 960 - (SUBSTRING(p.jam_keluar, 1, 2)::int * 60 + SUBSTRING(p.jam_keluar, 4, 2)::int) 
        ELSE 0 
      END) as total_menit_pulang_cepat,
      SUM(CASE WHEN (p.jam_masuk IS NOT NULL AND p.jam_masuk != '' AND p.jam_masuk != '00:00') 
                AND (p.jam_keluar IS NULL OR p.jam_keluar = '' OR p.jam_keluar = '00:00') THEN 1 ELSE 0 END) as lupa_tap_keluar
    FROM presensi p
    WHERE p.tanggal >= '${startDate}' AND p.tanggal <= '${endDate}'
    GROUP BY to_char(p.tanggal, 'YYYY'), to_char(p.tanggal, 'MM'), p.id_pegawai
    ORDER BY bulan DESC, satker_epresensi ASC, nama_epresensi ASC;
  `;
}

async function main() {
  const startTime = Date.now();
  console.log('=== MEMULAI EXPORT REVIEW JAM KERJA & ABSENSI PEGAWAI (2024 - 2026) ===');

  // 1. Ambil seluruh mapping NIP & Nama resmi dari SIAP
  console.log('1. Mengambil mapping NIP dari SIAP MSSQL...');
  const mapSiap = new Map<string, { nip: string; nama: string }>();
  try {
    const pool = await bukaPoolSiap();
    const resSiap = await pool.request().query<{
      PEGAWAIID: string;
      NIPBARU: string;
      NAMA: string;
    }>(`
      SELECT LTRIM(RTRIM(PEGAWAIID)) as PEGAWAIID,
             LTRIM(RTRIM(NIPBARU)) as NIPBARU,
             LTRIM(RTRIM(NAMA)) as NAMA
      FROM dbo.PEGAWAI
      WHERE NIPBARU IS NOT NULL AND LEN(LTRIM(RTRIM(NIPBARU))) = 18
    `);
    for (const r of resSiap.recordset) {
      mapSiap.set(r.PEGAWAIID, {
        nip: r.NIPBARU,
        nama: r.NAMA,
      });
    }
    await pool.close();
    console.log(`   -> Berhasil memuat ${mapSiap.size.toLocaleString('id-ID')} mapping NIP dari SIAP.`);
  } catch (err: any) {
    console.warn(`   -> Gagal membaca SIAP: ${err.message}. Lanjut dengan data e-Presensi.`);
  }

  // 2. Hubungkan ke e-Presensi
  console.log('2. Menghubungkan ke PostgreSQL e-Presensi...');
  const pgClient = new pg.Client({
    host: process.env.EPRESENSI_HOST || '192.168.221.96',
    port: Number(process.env.EPRESENSI_PORT || 4020),
    database: process.env.EPRESENSI_DB || 'presensi_kemnaker',
    user: process.env.EPRESENSI_USER || 'biro_keu',
    password: process.env.EPRESENSI_PASSWORD || 'K3mN@ker#2026!Db',
    connectionTimeoutMillis: 15000,
  });
  await pgClient.connect();

  // 3. Query per tahun
  console.log('3. Mengambil data tahun 2026 (Januari - Oktober 2026)...');
  const t0 = Date.now();
  const res2026 = await pgClient.query<MonthlyRow>(buildYearQuery('2026-01-01', '2026-10-31'));
  console.log(`   -> 2026 selesai: ${res2026.rows.length.toLocaleString('id-ID')} baris (${((Date.now() - t0)/1000).toFixed(1)}s)`);

  console.log('   Mengambil data tahun 2025 (Januari - Desember 2025)...');
  const t1 = Date.now();
  const res2025 = await pgClient.query<MonthlyRow>(buildYearQuery('2025-01-01', '2025-12-31'));
  console.log(`   -> 2025 selesai: ${res2025.rows.length.toLocaleString('id-ID')} baris (${((Date.now() - t1)/1000).toFixed(1)}s)`);

  console.log('   Mengambil data tahun 2024 (Januari - Desember 2024)...');
  const t2 = Date.now();
  const res2024 = await pgClient.query<MonthlyRow>(buildYearQuery('2024-01-01', '2024-12-31'));
  console.log(`   -> 2024 selesai: ${res2024.rows.length.toLocaleString('id-ID')} baris (${((Date.now() - t2)/1000).toFixed(1)}s)`);

  await pgClient.end();

  const totalAllRows = res2026.rows.length + res2025.rows.length + res2024.rows.length;
  console.log(`Total data agregasi: ${totalAllRows.toLocaleString('id-ID')} baris pegawai-bulan.`);

  // 4. Hitung Ringkasan Satker per Tahun
  console.log('4. Menghitung ringkasan eksekutif & tren satker...');
  const mapSatker = new Map<string, SatkerSummary>();

  function processSatker(rows: MonthlyRow[]) {
    for (const r of rows) {
      const satkerNama = r.satker_epresensi || 'Tidak Diketahui';
      const key = `${r.tahun}|${satkerNama}`;
      let s = mapSatker.get(key);
      if (!s) {
        s = {
          tahun: r.tahun,
          satker: satkerNama,
          jml_pegawai_bulan: 0,
          total_jam_kerja: 0,
          avg_jam_kerja_bulan: 0,
          total_terlambat_menit: 0,
          frek_terlambat: 0,
          frek_pulang_cepat: 0,
          total_alpha: 0,
          total_cuti: 0,
          total_dinas: 0,
        };
        mapSatker.set(key, s);
      }
      s.jml_pegawai_bulan++;
      s.total_jam_kerja += Number(r.total_jam_kerja || 0);
      s.total_terlambat_menit += Number(r.total_menit_terlambat || 0);
      s.frek_terlambat += Number(r.frek_terlambat || 0);
      s.frek_pulang_cepat += Number(r.frek_pulang_cepat || 0);
      s.total_alpha += Number(r.hari_alpha || 0);
      s.total_cuti += Number(r.hari_cuti || 0);
      s.total_dinas += Number(r.hari_dinas_luar || 0);
    }
  }

  processSatker(res2026.rows);
  processSatker(res2025.rows);
  processSatker(res2024.rows);

  for (const s of mapSatker.values()) {
    if (s.jml_pegawai_bulan > 0) {
      s.avg_jam_kerja_bulan = Number((s.total_jam_kerja / s.jml_pegawai_bulan).toFixed(1));
    }
  }

  // 5. Susun Workbook Excel
  console.log('5. Menyusun berkas Excel Master 2024 - 2026...');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gajihub Kemnaker - Evaluasi Jam Kerja & Presensi';
  wb.created = new Date();

  // SHEET 1: RINGKASAN TREN
  const wsTrend = wb.addWorksheet('Tren Tahunan & Satker', {
    views: [{ state: 'frozen', xSplit: 2, ySplit: 1 }],
  });
  wsTrend.columns = [
    { header: 'Tahun', key: 'tahun', width: 10 },
    { header: 'Satuan Kerja', key: 'satker', width: 45 },
    { header: 'Total Rekap (Pegawai-Bulan)', key: 'jml_pegawai_bulan', width: 28 },
    { header: 'Total Jam Kerja (Jam)', key: 'total_jam_kerja', width: 22 },
    { header: 'Rata2 Jam Kerja / Bulan', key: 'avg_jam_kerja_bulan', width: 24 },
    { header: 'Total Menit Terlambat', key: 'total_terlambat_menit', width: 22 },
    { header: 'Frekuensi Terlambat (x)', key: 'frek_terlambat', width: 22 },
    { header: 'Frekuensi Pulang Cepat (x)', key: 'frek_pulang_cepat', width: 24 },
    { header: 'Total Hari Cuti', key: 'total_cuti', width: 16 },
    { header: 'Total Hari Dinas Luar', key: 'total_dinas', width: 20 },
    { header: 'Total Hari Alpha / Tidak Hadir', key: 'total_alpha', width: 26 },
  ];
  styleHeader(wsTrend, 'FF1E293B');

  const listTrend = Array.from(mapSatker.values()).sort((a, b) => {
    if (a.tahun !== b.tahun) return b.tahun.localeCompare(a.tahun);
    return a.satker.localeCompare(b.satker);
  });

  for (const s of listTrend) {
    const row = wsTrend.addRow(s);
    row.getCell(3).numFmt = '#,##0';
    row.getCell(4).numFmt = '#,##0.0';
    row.getCell(5).numFmt = '#,##0.0';
    row.getCell(6).numFmt = '#,##0';
    row.getCell(7).numFmt = '#,##0';
    row.getCell(8).numFmt = '#,##0';
    row.getCell(9).numFmt = '#,##0';
    row.getCell(10).numFmt = '#,##0';
    row.getCell(11).numFmt = '#,##0';
  }

  // Helper untuk sheet tahunan
  function appendSheetTahunan(sheetName: string, rowsData: MonthlyRow[], headerColor: string) {
    console.log(`   -> Menyusun ${sheetName} (${rowsData.length.toLocaleString('id-ID')} baris)...`);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', xSplit: 5, ySplit: 1 }],
    });

    ws.columns = [
      { header: 'Tahun', key: 'tahun', width: 8 },
      { header: 'Bulan', key: 'bulanNama', width: 12 },
      { header: 'NIP Pegawai', key: 'nip', width: 22 },
      { header: 'Nama Pegawai', key: 'nama', width: 35 },
      { header: 'Satuan Kerja', key: 'satker', width: 40 },
      { header: 'Total Hari Tercatat', key: 'total_hari', width: 16 },
      { header: 'Hadir WFO (Hari)', key: 'hari_wfo', width: 15 },
      { header: 'Hadir WFH/WFA (Hari)', key: 'hari_wfh', width: 18 },
      { header: 'Dinas Luar (Hari)', key: 'hari_dinas', width: 16 },
      { header: 'Diklat (Hari)', key: 'hari_diklat', width: 14 },
      { header: 'Cuti (Hari)', key: 'hari_cuti', width: 14 },
      { header: 'Tugas Belajar (Hari)', key: 'hari_tubel', width: 18 },
      { header: 'Tanpa Keterangan / Alpha', key: 'hari_alpha', width: 22 },
      { header: 'Total Hadir Fisik', key: 'hadir_fisik', width: 16 },
      { header: 'Total Jam Kerja (Jam)', key: 'jam_kerja', width: 20 },
      { header: 'Rata2 Jam Kerja / Hari (Jam)', key: 'avg_jam', width: 24 },
      { header: 'Terlambat (Frekuensi)', key: 'frek_telat', width: 20 },
      { header: 'Total Menit Terlambat', key: 'menit_telat', width: 20 },
      { header: 'Pulang Cepat (Frekuensi)', key: 'frek_cepat', width: 22 },
      { header: 'Total Menit Pulang Cepat', key: 'menit_cepat', width: 22 },
      { header: 'Lupa Tap Pulang (x)', key: 'lupa_pulang', width: 18 },
    ];
    styleHeader(ws, headerColor);

    for (const r of rowsData) {
      const bIdx = parseInt(r.bulan, 10);
      const bulanNama = NAMA_BULAN[bIdx - 1] || r.bulan;
      const siapInfo = mapSiap.get(r.id_pegawai);

      const nip = siapInfo?.nip || '-';
      const nama = siapInfo?.nama || r.nama_epresensi || 'Nama Tidak Tersedia';
      const satker = r.satker_epresensi || '-';

      const row = ws.addRow({
        tahun: r.tahun,
        bulanNama,
        nip,
        nama,
        satker,
        total_hari: Number(r.total_hari_tercatat || 0),
        hari_wfo: Number(r.hari_wfo || 0),
        hari_wfh: Number(r.hari_wfh_wfa || 0),
        hari_dinas: Number(r.hari_dinas_luar || 0),
        hari_diklat: Number(r.hari_diklat || 0),
        hari_cuti: Number(r.hari_cuti || 0),
        hari_tubel: Number(r.hari_tubel || 0),
        hari_alpha: Number(r.hari_alpha || 0),
        hadir_fisik: Number(r.hari_hadir_fisik || 0),
        jam_kerja: Number(r.total_jam_kerja || 0),
        avg_jam: r.avg_jam_kerja_harian ? Number(r.avg_jam_kerja_harian) : null,
        frek_telat: Number(r.frek_terlambat || 0),
        menit_telat: Number(r.total_menit_terlambat || 0),
        frek_cepat: Number(r.frek_pulang_cepat || 0),
        menit_cepat: Number(r.total_menit_pulang_cepat || 0),
        lupa_pulang: Number(r.lupa_tap_keluar || 0),
      });

      row.getCell(3).alignment = { horizontal: 'left' };
      [6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20, 21].forEach(c => {
        row.getCell(c).numFmt = '#,##0';
      });
      row.getCell(15).numFmt = '#,##0.0';
      row.getCell(16).numFmt = '#,##0.00';
    }
  }

  appendSheetTahunan('Rekap Bulanan 2026', res2026.rows, 'FF0F766E'); // Teal
  appendSheetTahunan('Rekap Bulanan 2025', res2025.rows, 'FF1D4ED8'); // Blue
  appendSheetTahunan('Rekap Bulanan 2024', res2024.rows, 'FF475569'); // Slate

  // 6. Simpan File
  const outDir = path.join(process.cwd(), 'public', 'downloads');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outFileName = 'Review_Jam_Kerja_dan_Absensi_Pegawai_Kemnaker_2024_2026.xlsx';
  const outPath = path.join(outDir, outFileName);

  console.log(`6. Menulis file Excel ke ${outPath}...`);
  await wb.xlsx.writeFile(outPath);

  const fileStats = fs.statSync(outPath);
  const sizeMb = (fileStats.size / (1024 * 1024)).toFixed(2);
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('=== SELESAI SUKSES ===');
  console.log(`File: ${outPath}`);
  console.log(`Ukuran: ${sizeMb} MB`);
  console.log(`Durasi total: ${totalDuration}s`);

  process.exit(0);
}

function styleHeader(ws: ExcelJS.Worksheet, hexColor: string) {
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: hexColor },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});

