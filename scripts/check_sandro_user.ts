import { prisma } from '../src/lib/prisma';

// Cek role & unit satu akun: npx tsx scripts/check_sandro_user.ts <NIP>
// NIP diberikan saat dijalankan - JANGAN ditulis di kode (repo ini publik).
// Yang dicetak hanya role, role tambahan, unit, dan status aktif; bukan seluruh
// baris akun.
async function main() {
  const nip = process.argv[2]?.trim();
  if (!nip) throw new Error('Pakai: npx tsx scripts/check_sandro_user.ts <NIP>');

  const akun = await prisma.user.findUnique({
    where: { nip },
    select: { role: true, rolesTambahan: true, satuanKerja: true, aktif: true },
  });
  if (!akun) {
    console.log('Akun dengan NIP itu tidak ditemukan.');
  } else {
    console.log('Role utama   :', akun.role);
    console.log('Role tambahan:', akun.rolesTambahan.length ? akun.rolesTambahan.join(', ') : '-');
    console.log('Satuan kerja :', akun.satuanKerja ?? '-');
    console.log('Aktif        :', akun.aktif ? 'ya' : 'tidak');
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
