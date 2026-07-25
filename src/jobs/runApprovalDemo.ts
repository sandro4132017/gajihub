// ============================================================================
// Verifikasi manual end-to-end: jalankan job kalkulasi tukin, lalu ajukan
// approval 2 jenjang untuk salah satu pegawai, cetak status akhirnya.
//
// Cara pakai: npx tsx src/jobs/runApprovalDemo.ts
// Asumsi: sudah pernah jalan npx tsx src/jobs/runTukinJobDemo.ts sebelumnya
// (supaya baris TukinCalculation-nya ada).
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { ajukanApprovalTukin } from "./../approval/approvalTukinService";

async function main() {
  const prisma = new PrismaClient();

  const kalkulasi = await prisma.tukinCalculation.findFirstOrThrow({
    where: { periodeBulan: 7, periodeTahun: 2026 },
    include: { pegawai: true },
  });

  console.log(`Kalkulasi awal: ${kalkulasi.pegawai.nama} - status ${kalkulasi.status}`);

  const hasilJenjang1 = await ajukanApprovalTukin(prisma, {
    tukinCalculationId: kalkulasi.id,
    approverNip: "111",
    approverNama: "Atasan Langsung",
    approverJabatan: "Kepala Subbagian",
    jenjang: 1,
    keputusan: "SETUJU",
  });
  console.log("Setelah jenjang 1:", hasilJenjang1);

  const hasilJenjang2 = await ajukanApprovalTukin(prisma, {
    tukinCalculationId: kalkulasi.id,
    approverNip: "222",
    approverNama: "Pejabat Penetap",
    approverJabatan: "Kepala Biro",
    jenjang: 2,
    keputusan: "SETUJU",
  });
  console.log("Setelah jenjang 2:", hasilJenjang2);

  const kalkulasiAkhir = await prisma.tukinCalculation.findUniqueOrThrow({
    where: { id: kalkulasi.id },
  });
  console.log("Status akhir di DB:", kalkulasiAkhir.status, "| approvedBy:", kalkulasiAkhir.approvedBy);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
