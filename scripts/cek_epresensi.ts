import pg from 'pg';

async function main() {
  const client = new pg.Client({
    host: process.env.EPRESENSI_HOST || '192.168.221.96',
    port: Number(process.env.EPRESENSI_PORT || 4020),
    database: process.env.EPRESENSI_DB || 'presensi_kemnaker',
    user: process.env.EPRESENSI_USER || 'biro_keu',
    password: process.env.EPRESENSI_PASSWORD || 'K3mN@ker#2026!Db',
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
