// ============================================================================
// RAPIKAN ROLE UTAMA (sekali jalan): Role Utama tiap akun = role tertinggi yang
// dimilikinya (Pimpinan > Kasubag TU > PPABP > OSDMA > Pegawai > Admin). Role
// lama dipindah ke role tambahan; tidak ada role yang hilang. Sesudahnya Role
// Utama tetap bisa diubah manual di Kelola Role.
//
// BAWAANNYA UJI KERING (hanya jumlah per perpindahan; tanpa NIP/nama).
// Menulis butuh --terapkan.
//
// Jalankan: npm run rapikan:role-utama            (lihat dulu)
//           npm run rapikan:role-utama -- --terapkan
// ============================================================================
import { PrismaClient } from "@prisma/client";
import { jalankanRapikanRoleUtama, type DbJobRoleUtama } from "./rapikanRoleUtamaLogic";

const prisma = new PrismaClient();
const terapkan = process.argv.includes("--terapkan");

jalankanRapikanRoleUtama(prisma as unknown as DbJobRoleUtama, terapkan)
  .catch((err) => {
    console.error("GAGAL:", err instanceof Error ? err.constructor.name : "galat tak dikenal");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
