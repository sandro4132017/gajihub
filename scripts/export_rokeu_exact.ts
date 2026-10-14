import ExcelJS from 'exceljs';
import pg from 'pg';
import path from 'path';
import fs from 'fs';

async function main() {
  console.log('=== MEMULAI EXPORT FORMAT PERSIS REFERENSI (BIRO KEUANGAN & BMN 2024-2026) ===');
  const startTime = Date.now();

  const client = new pg.Client({
    host: process.env.EPRESENSI_HOST || '192.168.221.96',
    port: Number(process.env.EPRESENSI_PORT || 4020),
    database: process.env.EPRESENSI_DB || 'presensi_kemnaker',
    user: process.env.EPRESENSI_USER || 'biro_keu',
    password: process.env.EPRESENSI_PASSWORD || 'K3mN@ker#2026!Db',
    connectionTimeoutMillis: 15000,
  });
  await client.connect();

  console.log('1. Mengambil data presensi Biro Keuangan & BMN dari 2024 s.d. saat ini...');
  const res = await client.query(`
    SELECT 
      TRIM(p.nama_pegawai) as nama_pegawai,
      COALESCE(sk.nama_sistem_kerja, 'WFO') as nama_sistem_kerja,
      to_char(p.tanggal, 'YYYY-MM-DD') as tanggal_str,
      COALESCE(p.jam_masuk, '00:00') as jam_masuk,
      COALESCE(p.jam_keluar, '00:00') as jam_keluar,
      p.menit_kerja
    FROM presensi p
    LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
    WHERE (p.id_satker LIKE '010102%' OR p.nama_satker ILIKE '%biro keuangan%')
      AND p.tanggal >= '2024-01-01' AND p.tanggal <= '2026-10-31'
    ORDER BY nama_pegawai ASC, p.tanggal ASC;
  `);
  console.log(`   -> Berhasil mengambil ${res.rows.length.toLocaleString('id-ID')} baris.`);

  await client.end();

  console.log('2. Membuat berkas Excel sesuai format referensi...');
  const outPath = path.join(process.cwd(), 'Excel', 'presensi-biro-keuangan-dan-barang-milik-negara-2024-2026.xlsx');

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1', {
    views: [{ state: 'frozen', xSplit: 0, ySplit: 1 }]
  });

  ws.columns = [
    { header: 'nama_pegawai', key: 'nama_pegawai', width: 28 },
    { header: 'nama_sistem_kerja', key: 'nama_sistem_kerja', width: 18 },
    { header: 'tanggal', key: 'tanggal', width: 14 },
    { header: 'Full tanggal', key: 'full_tanggal', width: 26 },
    { header: 'jam_masuk', key: 'jam_masuk', width: 12 },
    { header: 'jam_keluar', key: 'jam_keluar', width: 12 },
    { header: 'menit_kerja', key: 'menit_kerja', width: 12 },
  ];

  const headerRow = ws.getRow(1);
  headerRow.font = { name: 'Calibri', size: 11, bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left' };

  for (const r of res.rows) {
    const [y, m, d] = r.tanggal_str.split('-').map(Number);
    const tgl = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

    const row = ws.addRow({
      nama_pegawai: r.nama_pegawai,
      nama_sistem_kerja: r.nama_sistem_kerja,
      tanggal: tgl,
      full_tanggal: tgl,
      jam_masuk: r.jam_masuk || '00:00',
      jam_keluar: r.jam_keluar || '00:00',
      menit_kerja: r.menit_kerja !== null && r.menit_kerja !== undefined ? Number(r.menit_kerja) : null,
    });

    row.getCell(3).numFmt = 'yyyy-mm-dd';
    row.getCell(4).numFmt = '[$-13809]dddd, dd mmmm yyyy;@';
    if (r.menit_kerja !== null && r.menit_kerja !== undefined) {
      row.getCell(7).numFmt = '#,##0';
    }
  }

  console.log(`3. Menyimpan ke ${outPath}...`);
  await wb.xlsx.writeFile(outPath);

  const pubPath = path.join(process.cwd(), 'public', 'downloads', 'presensi-biro-keuangan-dan-barang-milik-negara-2024-2026.xlsx');
  fs.copyFileSync(outPath, pubPath);

  const stats = fs.statSync(outPath);
  console.log(`=== SELESAI ===`);
  console.log(`Berkas: ${outPath}`);
  console.log(`Ukuran: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total baris: ${res.rows.length.toLocaleString('id-ID')} baris`);
  console.log(`Waktu: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

