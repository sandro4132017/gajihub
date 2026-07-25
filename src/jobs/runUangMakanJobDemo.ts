// ============================================================================
// Verifikasi manual: jalankan jalankanUangMakanPeriodeJob lawan Postgres asli.
// Cara pakai: npx tsx src/jobs/runUangMakanJobDemo.ts
//
// TODO(confirm): tarifHarianUangMakan di bawah adalah ANGKA CONTOH untuk
// keperluan verifikasi pipeline saja - BUKAN nilai resmi dari SBM PMK.
// Jangan dipakai untuk kalkulasi production.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { MockSiapAdapter } from "../adapters/MockSiapAdapter";
import { MockPresensiAdapter } from "../adapters/MockPresensiAdapter";
import { MockEKinerjaAdapter } from "../adapters/MockEKinerjaAdapter";
import { jalankanUangMakanPeriodeJob } from "./hitungUangMakanPeriodeJob";

async function main() {
  const prisma = new PrismaClient();

  const ringkasan = await jalankanUangMakanPeriodeJob(
    prisma,
    {
      siap: new MockSiapAdapter(),
      presensi: new MockPresensiAdapter(),
      eKinerja: new MockEKinerjaAdapter(),
    },
    {
      periodeBulan: 7,
      periodeTahun: 2026,
      tarifHarianUangMakan: 35_000,
    }
  );

  console.log(JSON.stringify(ringkasan, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
