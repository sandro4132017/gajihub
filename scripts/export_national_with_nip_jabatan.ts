import ExcelJS from 'exceljs';
import pg from 'pg';
import path from 'path';
import fs from 'fs';
import { bukaPoolSiap } from '../src/lib/siapConfig';

interface SiapEmployee {
  nip: string;
  nama: string;
  jabatan: string;
}

async function loadSiapEmployees(): Promise<Map<string, SiapEmployee>> {
  console.log('1. Mengambil data kepegawaian (NIP & Jabatan) dari SIAP MSSQL...');
  const pool = await bukaPoolSiap();
  const res = await pool.request().query<{
    PEGAWAIID: string;
    NIPBARU: string;
    NAMA: string;
    JABATAN: string;
  }>(`
    SELECT LTRIM(RTRIM(p.PEGAWAIID)) as PEGAWAIID,
           LTRIM(RTRIM(p.NIPBARU)) as NIPBARU,
           LTRIM(RTRIM(p.NAMA)) as NAMA,
           rj.NAMAJABATAN as JABATAN
    FROM dbo.PEGAWAI p
    OUTER APPLY (
      SELECT TOP 1 x.NAMAJABATAN
      FROM dbo.RIWAYATJABATAN x
      WHERE x.PEGAWAIID = p.PEGAWAIID AND x.NAMAJABATAN IS NOT NULL
      ORDER BY x.TMTJABATAN DESC
    ) rj
    WHERE p.NIPBARU IS NOT NULL AND LEN(LTRIM(RTRIM(p.NIPBARU))) = 18;
  `);
  await pool.close();

  const map = new Map<string, SiapEmployee>();
  for (const r of res.recordset) {
    map.set(r.PEGAWAIID, {
      nip: r.NIPBARU,
      nama: r.NAMA,
      jabatan: r.JABATAN || '-',
    });
  }
  console.log(`   -> Berhasil memuat ${map.size.toLocaleString('id-ID')} pegawai dengan NIP dan Jabatan dari SIAP.`);
  return map;
}

async function streamSheet(
  wb: ExcelJS.stream.xlsx.WorkbookWriter,
  sheetName: string,
  client: pg.Client,
  mapSiap: Map<string, SiapEmployee>,
  startTgl: string,
  endTgl: string
) {
  const startTime = Date.now();
  console.log(`\n--- Memulai Sheet '${sheetName}' (${startTgl} s.d. ${endTgl}) ---`);

  const ws = wb.addWorksheet(sheetName);
  ws.columns = [
    { header: 'nip', key: 'nip', width: 22 },
    { header: 'nama_pegawai', key: 'nama_pegawai', width: 32 },
    { header: 'jabatan', key: 'jabatan', width: 35 },
    { header: 'nama_satker', key: 'nama_satker', width: 38 },
    { header: 'nama_sistem_kerja', key: 'nama_sistem_kerja', width: 18 },
    { header: 'tanggal', key: 'tanggal', width: 14 },
    { header: 'Full tanggal', key: 'full_tanggal', width: 26 },
    { header: 'jam_masuk', key: 'jam_masuk', width: 12 },
    { header: 'jam_keluar', key: 'jam_keluar', width: 12 },
    { header: 'menit_kerja', key: 'menit_kerja', width: 12 },
  ];

  const [startYear, startMonth] = startTgl.split('-').map(Number);
  const [endYear, endMonth] = endTgl.split('-').map(Number);

  let totalBarisSheet = 0;

  for (let m = startMonth; m <= endMonth; m++) {
    const padM = String(m).padStart(2, '0');
    const mStart = `${startYear}-${padM}-01`;
    const mEnd = new Date(Date.UTC(startYear, m, 0)).toISOString().slice(0, 10);

    const t0 = Date.now();
    const query = `
      SELECT 
        p.id_pegawai,
        TRIM(p.nama_pegawai) as nama_pegawai,
        TRIM(p.nama_satker) as nama_satker,
        COALESCE(sk.nama_sistem_kerja, 'WFO') as nama_sistem_kerja,
        to_char(p.tanggal, 'YYYY-MM-DD') as tanggal_str,
        COALESCE(p.jam_masuk, '00:00') as jam_masuk,
        COALESCE(p.jam_keluar, '00:00') as jam_keluar,
        p.menit_kerja
      FROM presensi p
      LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
      WHERE p.tanggal >= '${mStart}' AND p.tanggal <= '${mEnd}'
      ORDER BY p.nama_pegawai ASC, p.tanggal ASC;
    `;

    const res = await client.query(query);
    for (const r of res.rows) {
      const [yy, mm, dd] = r.tanggal_str.split('-').map(Number);
      const tgl = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0));

      const siap = r.id_pegawai ? mapSiap.get(r.id_pegawai.trim()) : undefined;
      const nip = siap?.nip || '-';
      const jabatan = siap?.jabatan || '-';

      const row = ws.addRow({
        nip,
        nama_pegawai: r.nama_pegawai,
        jabatan,
        nama_satker: r.nama_satker,
        nama_sistem_kerja: r.nama_sistem_kerja,
        tanggal: tgl,
        full_tanggal: tgl,
        jam_masuk: r.jam_masuk,
        jam_keluar: r.jam_keluar,
        menit_kerja: r.menit_kerja !== null && r.menit_kerja !== undefined ? Number(r.menit_kerja) : null,
      });

      row.getCell(1).alignment = { horizontal: 'left' };
      row.getCell(6).numFmt = 'yyyy-mm-dd';
      row.getCell(7).numFmt = '[$-13809]dddd, dd mmmm yyyy;@';
      if (r.menit_kerja !== null && r.menit_kerja !== undefined) {
        row.getCell(10).numFmt = '#,##0';
      }
      row.commit();
    }

    totalBarisSheet += res.rows.length;
    console.log(`   -> [${sheetName}] Bulan ${padM}/${startYear}: ${res.rows.length.toLocaleString('id-ID')} baris (${((Date.now() - t0) / 1000).toFixed(1)}s).`);
  }

  await ws.commit();
  console.log(`--- Selesai Sheet '${sheetName}': ${totalBarisSheet.toLocaleString('id-ID')} baris (${((Date.now() - startTime) / 1000).toFixed(1)}s) ---`);
  return totalBarisSheet;
}

async function main() {
  const globalStart = Date.now();
  console.log('=== MEMULAI EXPORT PRESENSI DENGAN NIP DAN JABATAN (SATU FILE MASTER NASIONAL) ===');

  // 1. Ambil data SIAP
  const mapSiap = await loadSiapEmployees();

  // 2. Hubungkan ke e-Presensi
  console.log('2. Menghubungkan ke PostgreSQL e-Presensi...');
  const client = new pg.Client({
    host: process.env.EPRESENSI_HOST || '192.168.221.96',
    port: Number(process.env.EPRESENSI_PORT || 4020),
    database: process.env.EPRESENSI_DB || 'presensi_kemnaker',
    user: process.env.EPRESENSI_USER || 'biro_keu',
    password: process.env.EPRESENSI_PASSWORD || 'K3mN@ker#2026!Db',
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  const outPath = path.join(process.cwd(), 'Excel', 'presensi-semua-pegawai-kemnaker-2024-2026-satu-file.xlsx');
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outPath,
    useStyles: true,
    useSharedStrings: false,
  });

  let totalGrand = 0;

  // Sheet 1: Tahun 2026
  totalGrand += await streamSheet(wb, 'Tahun 2026', client, mapSiap, '2026-01-01', '2026-10-31');

  // Sheet 2: Tahun 2025 Semester 2
  totalGrand += await streamSheet(wb, 'Tahun 2025 - Semester 2', client, mapSiap, '2025-07-01', '2025-12-31');

  // Sheet 3: Tahun 2025 Semester 1
  totalGrand += await streamSheet(wb, 'Tahun 2025 - Semester 1', client, mapSiap, '2025-01-01', '2025-06-30');

  // Sheet 4: Tahun 2024
  totalGrand += await streamSheet(wb, 'Tahun 2024', client, mapSiap, '2024-01-01', '2024-12-31');

  await wb.commit();
  await client.end();

  // Salin ke public/downloads/
  const pubPath = path.join(process.cwd(), 'public', 'downloads', 'presensi-semua-pegawai-kemnaker-2024-2026-satu-file.xlsx');
  fs.copyFileSync(outPath, pubPath);

  const stats = fs.statSync(outPath);
  console.log('\n=== SUKSES SELESAI SATU FILE MASTER NASIONAL (DILENGKAPI NIP & JABATAN) ===');
  console.log(`Berkas: ${outPath}`);
  console.log(`Ukuran: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Semua Baris: ${totalGrand.toLocaleString('id-ID')} baris`);
  console.log(`Total Waktu: ${((Date.now() - globalStart) / 1000).toFixed(1)} detik`);

  process.exit(0);
}

main().catch(console.error);

