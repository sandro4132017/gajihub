import { prisma } from '../src/lib/prisma';
import { simpanHasilPresensi } from '../src/jobs/simpanRekapPresensi';
import { tarikPresensiPeriode } from '../src/adapters/EpresensiAdapter';

async function main() {
  const sandro = await prisma.user.findFirst({
    where: { nip: '198703232015031002' }
  });
  if (!sandro) throw new Error('Sandro not found');

  const peg = await prisma.pegawai.findFirst({
    where: { nip: '198703232015031002' }
  });
  if (!peg) throw new Error('Pegawai Sandro not found');

  const tarikan = await tarikPresensiPeriode(10, 2026);
  const sandroTarikan = tarikan.pegawai.find(p => p.nip === '198703232015031002');
  if (!sandroTarikan) throw new Error('Sandro tarikan not found');

  console.log('Testing simpanHasilPresensi for Sandro with diunggahOlehId = sandro.id...');
  await simpanHasilPresensi(prisma, {
    pegawaiId: peg.id,
    periodeBulan: 10,
    periodeTahun: 2026,
    hasil: sandroTarikan.hasil,
    diunggahOlehId: sandro.id,
    sourceSystem: 'test',
  });
  console.log('SUKSES simpan 1 pegawai!');
  process.exit(0);
}

main().catch(console.error);

