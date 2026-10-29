import ExcelJS from 'exceljs';
import pg from 'pg';
import path from 'path';
import fs from 'fs';

// Kredensial HANYA dari .env - tidak ada nilai cadangan di kode (repo ini publik).
try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  // .env tidak ada - wajibEnv() di bawah yang melapor.
}
function wajibEnv(nama: string): string {
  const nilai = process.env[nama];
  if (!nilai) throw new Error(`${nama} belum diisi di .env`);
  return nilai;
}

async function exportYear(tahun: number, startMonth: number, endMonth: number, outFileName: string) {
  const startTime = Date.now();
  console.log(`\n=== EXPORT TAHUN ${tahun} (Bulan ${startMonth} s.d. ${endMonth}) -> ${outFileName} ===`);

  const client = new pg.Client({
    host: process.env.EPRESENSI_HOST || '192.168.221.96',
    port: Number(process.env.EPRESENSI_PORT || 4020),
    database: process.env.EPRESENSI_DB || 'presensi_kemnaker',
    user: wajibEnv("EPRESENSI_USER"),
    password: wajibEnv("EPRESENSI_PASSWORD"),
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  // Hasil ekspor berisi data presensi pegawai: disimpan di storage/exports (di-ignore git,
  // di luar public/) - JANGAN ke public/, yang disajikan lewat URL.
  fs.mkdirSync(path.join(process.cwd(), 'storage', 'exports'), { recursive: true });
  const outPath = path.join(process.cwd(), 'storage', 'exports', outFileName);
  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
    filename: outPath,
    useStyles: true,
    useSharedStrings: false,
  });

  const ws = wb.addWorksheet(`Presensi ${tahun}`);
  ws.columns = [
    { header: 'nama_pegawai', key: 'nama_pegawai', width: 30 },
    { header: 'nama_satker', key: 'nama_satker', width: 35 },
    { header: 'nama_sistem_kerja', key: 'nama_sistem_kerja', width: 18 },
    { header: 'tanggal', key: 'tanggal', width: 14 },
    { header: 'Full tanggal', key: 'full_tanggal', width: 26 },
    { header: 'jam_masuk', key: 'jam_masuk', width: 12 },
    { header: 'jam_keluar', key: 'jam_keluar', width: 12 },
    { header: 'menit_kerja', key: 'menit_kerja', width: 12 },
  ];

  let totalBaris = 0;

  for (let m = startMonth; m <= endMonth; m++) {
    const padM = String(m).padStart(2, '0');
    const startTgl = `${tahun}-${padM}-01`;
    const endTgl = new Date(Date.UTC(tahun, m, 0)).toISOString().slice(0, 10);

    const t0 = Date.now();
    const query = `
      SELECT 
        TRIM(p.nama_pegawai) as nama_pegawai,
        TRIM(p.nama_satker) as nama_satker,
        COALESCE(sk.nama_sistem_kerja, 'WFO') as nama_sistem_kerja,
        to_char(p.tanggal, 'YYYY-MM-DD') as tanggal_str,
        COALESCE(p.jam_masuk, '00:00') as jam_masuk,
        COALESCE(p.jam_keluar, '00:00') as jam_keluar,
        p.menit_kerja
      FROM presensi p
      LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
      WHERE p.tanggal >= '${startTgl}' AND p.tanggal <= '${endTgl}'
      ORDER BY p.nama_pegawai ASC, p.tanggal ASC;
    `;

    const res = await client.query(query);
    for (const r of res.rows) {
      const [yy, mm, dd] = r.tanggal_str.split('-').map(Number);
      const tgl = new Date(Date.UTC(yy, mm - 1, dd, 0, 0, 0));

      const row = ws.addRow({
        nama_pegawai: r.nama_pegawai,
        nama_satker: r.nama_satker,
        nama_sistem_kerja: r.nama_sistem_kerja,
        tanggal: tgl,
        full_tanggal: tgl,
        jam_masuk: r.jam_masuk,
        jam_keluar: r.jam_keluar,
        menit_kerja: r.menit_kerja !== null && r.menit_kerja !== undefined ? Number(r.menit_kerja) : null,
      });

      row.getCell(4).numFmt = 'yyyy-mm-dd';
      row.getCell(5).numFmt = '[$-13809]dddd, dd mmmm yyyy;@';
      if (r.menit_kerja !== null && r.menit_kerja !== undefined) {
        row.getCell(8).numFmt = '#,##0';
      }
      row.commit();
    }

    totalBaris += res.rows.length;
    console.log(`   -> Bulan ${padM}/${tahun}: ${res.rows.length.toLocaleString('id-ID')} baris (${((Date.now() - t0) / 1000).toFixed(1)}s). Total: ${totalBaris.toLocaleString('id-ID')}`);
  }

  await ws.commit();
  await wb.commit();
  await client.end();


  const stats = fs.statSync(outPath);
  console.log(`Selesai ${outFileName}: ${(stats.size / 1024 / 1024).toFixed(2)} MB, total ${totalBaris.toLocaleString('id-ID')} baris dalam ${((Date.now() - startTime) / 1000).toFixed(1)}s.`);
}

async function main() {
  // Export 2025 Semester 1
  await exportYear(2025, 1, 6, 'presensi-semua-pegawai-kemnaker-2025-semester-1.xlsx');

  // Export 2025 Semester 2
  await exportYear(2025, 7, 12, 'presensi-semua-pegawai-kemnaker-2025-semester-2.xlsx');

  // Export 2024 Penuh (Jan - Des)
  await exportYear(2024, 1, 12, 'presensi-semua-pegawai-kemnaker-2024.xlsx');
}

main().catch(console.error);
