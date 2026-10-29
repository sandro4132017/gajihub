import { prisma } from '../src/lib/prisma';
import { canUploadRekapPresensi, type AuthUser } from '../src/auth/permissions';
import { satkerTerkunciUntukAkun } from '../src/app/dashboardScope';

async function main() {
  const nipTarget = process.argv[2]?.trim();
  // NIP diberikan saat dijalankan - JANGAN ditulis di kode (repo ini publik).
  if (!nipTarget) throw new Error('Pakai: npx tsx scripts/test_role_perms.ts <NIP>');
  const sandro = await prisma.user.findFirst({
    where: { nip: nipTarget }
  });
  if (!sandro) throw new Error('Akun tidak ditemukan');

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

