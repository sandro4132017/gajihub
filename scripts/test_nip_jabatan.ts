import { PrismaClient } from '@prisma/client';
import { bukaPoolSiap } from '../src/lib/siapConfig';

async function main() {
  const prisma = new PrismaClient();
  const sampleLocal = await prisma.pegawai.findMany({
    select: { nip: true, nama: true, jabatan: true, satuanKerja: true },
    take: 5
  });
  console.log('Sample local pegawai:');
  console.table(sampleLocal);

  const localCountWithJabatan = await prisma.pegawai.count({
    where: { jabatan: { not: null } }
  });
  console.log(`Local pegawai with jabatan: ${localCountWithJabatan}`);

  console.log('\nTesting SIAP MSSQL query for PEGAWAIID, NIP, JABATAN...');
  const pool = await bukaPoolSiap();
  const resSiap = await pool.request().query(`
    SELECT TOP 5
      LTRIM(RTRIM(p.PEGAWAIID)) as PEGAWAIID,
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
  console.table(resSiap.recordset);

  // Check how long it takes to fetch ALL from SIAP
  console.time('Fetch all from SIAP');
  const allSiap = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(p.PEGAWAIID)) as PEGAWAIID,
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
  console.timeEnd('Fetch all from SIAP');
  console.log(`Loaded ${allSiap.recordset.length} pegawai from SIAP.`);

  await pool.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch(console.error);

