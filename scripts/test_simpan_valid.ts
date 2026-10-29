import { prisma } from '../src/lib/prisma';
import { simpanHasilPresensi } from '../src/jobs/simpanRekapPresensi';
import { tarikPresensiPeriode } from '../src/adapters/EpresensiAdapter';

async function main() {
  const nipTarget = process.argv[2]?.trim();
  // NIP diberikan saat dijalankan - JANGAN ditulis di kode (repo ini publik).
  if (!nipTarget) throw new Error('Pakai: npx tsx scripts/test_simpan_valid.ts <NIP>');
  const sandro = await prisma.user.findFirst({
    where: { nip: nipTarget }
  });
  if (!sandro) throw new Error('Akun tidak ditemukan');

  const peg = await prisma.pegawai.findFirst({
    where: { nip: nipTarget }
  });
  if (!peg) throw new Error('Pegawai tidak ditemukan');

  const tarikan = await tarikPresensiPeriode(10, 2026);
  const sandroTarikan = tarikan.pegawai.find(p => p.nip === nipTarget);
  if (!sandroTarikan) throw new Error('Pegawai tidak ada di tarikan e-Presensi');

  console.log('Menguji simpanHasilPresensi untuk satu pegawai...');
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

