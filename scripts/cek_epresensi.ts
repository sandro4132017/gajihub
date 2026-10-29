import pg from 'pg';

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

async function main() {
  const client = new pg.Client({
    host: process.env.EPRESENSI_HOST || '192.168.221.96',
    port: Number(process.env.EPRESENSI_PORT || 4020),
    database: process.env.EPRESENSI_DB || 'presensi_kemnaker',
    user: wajibEnv("EPRESENSI_USER"),
    password: wajibEnv("EPRESENSI_PASSWORD"),
    connectionTimeoutMillis: 10000,
  });

  await client.connect();

  const res = await client.query(`
    SELECT to_char(tanggal, 'YYYY') as tahun, 
           COUNT(*) as jml_baris,
           COUNT(DISTINCT id_pegawai) as jml_pegawai,
           MIN(tanggal)::text as tgl_pertama,
           MAX(tanggal)::text as tgl_terakhir
      FROM presensi 
     WHERE tanggal >= '2015-01-01' AND tanggal <= '2030-01-01'
     GROUP BY to_char(tanggal, 'YYYY')
     ORDER BY tahun ASC
  `);

  console.log('Distribusi Tahun Data Presensi di Database e-Presensi:');
  console.table(res.rows);

  await client.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
