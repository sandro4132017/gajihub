import { prisma } from '../src/lib/prisma';
import { canUploadRekapPresensi, type AuthUser } from '../src/auth/permissions';
import { satkerTerkunciUntukAkun } from '../src/app/dashboardScope';

async function main() {
  const sandro = await prisma.user.findFirst({
    where: { nip: '198703232015031002' }
  });
  if (!sandro) throw new Error('Sandro not found');

  const roles = ['ADMIN', 'KASUBAG_TU', 'OSDMA', 'PPABP', 'PEGAWAI'] as const;
  for (const role of roles) {
    const authUser: AuthUser = {
      nip: sandro.nip,
      role: role as any,
      satuanKerja: sandro.satuanKerja,
      aktif: sandro.aktif
    };
    const canUploadRokeu = canUploadRekapPresensi(authUser, 'Biro Keuangan dan Barang Milik Negara');
    const canUploadOther = canUploadRekapPresensi(authUser, 'Balai Besar Pelatihan Vokasi dan Produktivitas Serang');
    const terkunci = satkerTerkunciUntukAkun(authUser);
    console.log(`Role: ${role.padEnd(10)} | canUpload (Rokeu): ${canUploadRokeu} | canUpload (Other): ${canUploadOther} | Terkunci: ${terkunci}`);
  }

  process.exit(0);
}

main().catch(console.error);

