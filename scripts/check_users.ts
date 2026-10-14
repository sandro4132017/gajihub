import { prisma } from '../src/lib/prisma';

async function main() {
  const users = await prisma.user.findMany({
    select: { id: true, nip: true, nama: true, role: true, aktif: true }
  });
  console.log('Daftar Users di database:');
  console.table(users);
  process.exit(0);
}

main().catch(console.error);

