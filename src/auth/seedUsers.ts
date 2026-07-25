// ============================================================================
// Seed akun User contoh, satu per role, buat development/demo.
// Cara pakai: npx tsx src/auth/seedUsers.ts
//
// Login pakai NIP sebagai username SEKALIGUS password (lihat TODO(legal-
// confirm) di src/auth/session.ts soal kenapa ini sementara/tidak aman).
//
// NIP di bawah SENGAJA pakai prefix "0000" (tidak pernah valid sebagai NIP
// asli - tahun lahir 0000 mustahil) supaya PASTI tidak bentrok dengan NIP
// pegawai sungguhan - pernah kejadian NIP contoh bentrok waktu import basis
// data pegawai (lihat src/adapters/MockSiapAdapter.ts untuk insiden itu).
//
// NIP akun PEGAWAI (...101) SENGAJA disamakan dengan NIP pegawai mock
// "Contoh Pegawai Satu" (000000000000000001) di MockSiapAdapter - supaya
// begitu fitur self-service (lihat sendiri Tukin sendiri) dibangun, akun
// ini punya data yang bisa ditampilkan.
// ============================================================================

import { PrismaClient, type Role } from "@prisma/client";

const AKUN_CONTOH: Array<{
  nip: string;
  nama: string;
  role: Role;
  satuanKerja: string | null;
}> = [
  {
    nip: "000000000000000001", // sama dengan NIP "Contoh Pegawai Satu" di MockSiapAdapter
    nama: "Contoh Pegawai Satu",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "000000000000000102",
    nama: "Kasubag TU Demo",
    role: "KASUBAG_TU",
    satuanKerja: "Sekretariat Jenderal",
  },
  {
    nip: "000000000000000103",
    nama: "PPABP Demo",
    role: "PPABP",
    satuanKerja: null, // NULL = berwenang lintas satker (asumsi pilot: 1 PPABP pusat)
  },
  {
    nip: "000000000000000104",
    nama: "Biro OSDMA Demo",
    role: "BIRO_OSDMA",
    satuanKerja: null,
  },
  {
    nip: "000000000000000105",
    nama: "Admin Sistem Demo",
    role: "ADMIN_SISTEM",
    satuanKerja: null,
  },
  {
    nip: "000000000000000106",
    nama: "Itjen Demo",
    role: "ITJEN",
    satuanKerja: null,
  },
  {
    nip: "000000000000000107",
    nama: "Pimpinan Demo",
    role: "PIMPINAN",
    satuanKerja: null,
  },
];

async function main() {
  const prisma = new PrismaClient();

  for (const akun of AKUN_CONTOH) {
    await prisma.user.upsert({
      where: { nip: akun.nip },
      create: {
        nip: akun.nip,
        nama: akun.nama,
        role: akun.role,
        satuanKerja: akun.satuanKerja,
      },
      update: {
        nama: akun.nama,
        role: akun.role,
        satuanKerja: akun.satuanKerja,
      },
    });
    console.log(`Akun User siap: NIP ${akun.nip} (login pakai NIP ini sebagai password juga) - role ${akun.role}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
