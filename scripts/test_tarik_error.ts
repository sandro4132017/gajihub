import { prisma } from '../src/lib/prisma';
import { tarikPresensiPeriode } from '../src/adapters/EpresensiAdapter';
import { muatKendalaPeriode, muatKoreksiPeriode } from '../src/lib/kendalaPresensi';
import { muatHariLiburPeriode } from '../src/lib/hariLibur';
import { simpanHasilPresensi } from '../src/jobs/simpanRekapPresensi';

async function testTarik(bulan: number, tahun: number) {
  console.log(`\n=== TEST TARIK PRESENSI PERIODE ${bulan}/${tahun} ===`);
  try {
    console.log('1. Memuat kendala, koreksi, dan hari libur...');
    const kendala = await muatKendalaPeriode(prisma, bulan, tahun);
    const koreksi = await muatKoreksiPeriode(prisma, bulan, tahun);
    const hariLibur = await muatHariLiburPeriode(bulan, tahun);
    console.log('   -> Sukses muat metadata.');

    console.log('2. Memanggil tarikPresensiPeriode...');
    const t0 = Date.now();
    const tarikan = await tarikPresensiPeriode(
      bulan,
      tahun,
      kendala.untukNip,
      koreksi.untukNip,
      hariLibur
    );
    console.log(`   -> Sukses tarik: ${tarikan.pegawai.length} pegawai ditarik (${((Date.now() - t0)/1000).toFixed(1)}s).`);

    console.log('3. Mencari pegawai di database...');
    const pegawaiDb = await prisma.pegawai.findMany({
      where: { nip: { in: tarikan.pegawai.map((p) => p.nip) } },
      select: { id: true, nip: true, satuanKerja: true },
    });
    console.log(`   -> Ketemu ${pegawaiDb.length} pegawai di DB lokal.`);

    console.log('4. Testing simpan sample 1 pegawai...');
    const sample = tarikan.pegawai[0];
    const peg = pegawaiDb.find(p => p.nip === sample.nip);
    if (peg) {
      await simpanHasilPresensi(prisma, {
        pegawaiId: peg.id,
        periodeBulan: bulan,
        periodeTahun: tahun,
        hasil: sample.hasil,
        diunggahOlehId: peg.id,
        sourceSystem: 'test',
      });
      console.log('   -> Sukses simpan 1 pegawai!');
    }

  } catch (err: any) {
    console.error('ERROR DITEMUKAN:', err);
    console.error('Stack:', err.stack);
  }
}

async function main() {
  await testTarik(10, 2026);
  process.exit(0);
}

main().catch(console.error);

