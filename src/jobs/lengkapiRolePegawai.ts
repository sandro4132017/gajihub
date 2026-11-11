// ============================================================================
// LENGKAPI ROLE PEGAWAI: akun yang NIP-nya ada di tabel Pegawai wajib punya
// role PEGAWAI (utama atau tambahan). Akun tanpa data Pegawai tidak disentuh.
//
// BAWAANNYA UJI KERING (hanya melaporkan jumlah per role utama; tanpa NIP/nama).
// Menulis butuh --terapkan (konvensi sama dengan isi:hash-tte).
//
// Jalankan: npm run lengkapi:role-pegawai            (lihat dulu)
//           npm run lengkapi:role-pegawai -- --terapkan
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { jalankanLengkapiRolePegawai, type DbJob } from "./lengkapiRolePegawaiLogic";

const prisma = new PrismaClient();
const terapkan = process.argv.includes("--terapkan");

jalankanLengkapiRolePegawai(prisma as unknown as DbJob, terapkan)
  .catch((err) => {
    console.error("GAGAL:", err instanceof Error ? err.constructor.name : "galat tak dikenal");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
