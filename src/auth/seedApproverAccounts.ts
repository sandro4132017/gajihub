// ============================================================================
// Seed akun approver contoh buat development/demo.
// Cara pakai: npx tsx src/auth/seedApproverAccounts.ts
//
// TODO(confirm): NIP di bawah sengaja sama dengan NIP di MockSiapAdapter
// supaya konsisten dengan data demo lainnya. Password di sini CUMA buat
// development lokal - jangan pernah pakai password contoh di lingkungan
// manapun yang bisa diakses orang lain.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const AKUN_CONTOH = [
  {
    nip: "111",
    nama: "Atasan Langsung",
    jabatan: "Kepala Subbagian",
    password: "approver123",
  },
  {
    nip: "222",
    nama: "Pejabat Penetap",
    jabatan: "Kepala Biro",
    password: "approver123",
  },
];

async function main() {
  const prisma = new PrismaClient();

  for (const akun of AKUN_CONTOH) {
    const passwordHash = await bcrypt.hash(akun.password, 10);
    await prisma.akunApprover.upsert({
      where: { nip: akun.nip },
      create: {
        nip: akun.nip,
        nama: akun.nama,
        jabatan: akun.jabatan,
        passwordHash,
      },
      update: {
        nama: akun.nama,
        jabatan: akun.jabatan,
        passwordHash,
      },
    });
    console.log(`Akun approver siap: NIP ${akun.nip} / password ${akun.password}`);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
