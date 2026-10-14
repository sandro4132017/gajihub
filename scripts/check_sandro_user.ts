import { prisma } from '../src/lib/prisma';
import { canUploadRekapPresensi } from '../src/auth/permissions';

async function main() {
  const sandro = await prisma.user.findFirst({
    where: { nip: '198703232015031002' }
  });
  console.log('Alpha Sandro user row:');
  console.log(sandro);

  if (sandro) {
    console.log('Role:', sandro.role);
    console.log('Roles tambahan:', sandro.rolesTambahan);
    console.log('Satker:', sandro.satuanKerja);
  }
  process.exit(0);
}

main().catch(console.error);

