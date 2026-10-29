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
    host: wajibEnv("EPRESENSI_HOST"),
    port: Number(wajibEnv("EPRESENSI_PORT")),
    database: wajibEnv("EPRESENSI_DB"),
    user: wajibEnv("EPRESENSI_USER"),
    password: wajibEnv("EPRESENSI_PASSWORD")
  });
  await client.connect();

  console.log('--- DISTRIBUSI JENIS SISTEM KERJA BIRO KEUANGAN (2024-2026) ---');
  const resRokeu = await client.query(`
    SELECT 
      COALESCE(sk.nama_sistem_kerja, 'WFO') as jenis_presensi,
      COUNT(*) as jumlah_baris,
      COUNT(DISTINCT p.id_pegawai) as distinct_pegawai
    FROM presensi p
    LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
    WHERE (p.id_satker LIKE '010102%' OR p.nama_satker ILIKE '%biro keuangan%')
      AND p.tanggal >= '2024-01-01' AND p.tanggal <= '2026-10-31'
    GROUP BY COALESCE(sk.nama_sistem_kerja, 'WFO')
    ORDER BY jumlah_baris DESC;
  `);
  console.table(resRokeu.rows);

  console.log('--- DISTRIBUSI JENIS SISTEM KERJA NASIONAL (2024-2026) ---');
  const resNasional = await client.query(`
    SELECT 
      COALESCE(sk.nama_sistem_kerja, 'WFO') as jenis_presensi,
      COUNT(*) as jumlah_baris,
      COUNT(DISTINCT p.id_pegawai) as distinct_pegawai
    FROM presensi p
    LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
    WHERE p.tanggal >= '2024-01-01' AND p.tanggal <= '2026-10-31'
    GROUP BY COALESCE(sk.nama_sistem_kerja, 'WFO')
    ORDER BY jumlah_baris DESC;
  `);
  console.table(resNasional.rows);

  await client.end();
  process.exit(0);
}

main().catch(console.error);

