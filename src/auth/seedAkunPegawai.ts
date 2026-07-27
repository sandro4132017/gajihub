// ============================================================================
// SEED AKUN PEGAWAI MASSAL - bikin baris User (role PEGAWAI) buat SEMUA
// baris Pegawai yang belum punya akun.
// Cara pakai: npx tsx src/auth/seedAkunPegawai.ts
//
// TUJUAN: supaya SEMUA pegawai (±5.069) bisa login & dites, dan pengelolaan
// role tinggal MENGUBAH role akun yang sudah ada (PEGAWAI -> KASUBAG_TU/
// OSDMA/dst lewat halaman Admin "Kelola Assignment Role"), BUKAN bikin akun
// dari nol satu-satu.
//
// IDEMPOTEN & TIDAK MERUSAK: cuma membuat akun buat NIP yang BELUM punya
// User sama sekali. Akun yang sudah ada (termasuk 13 akun demo dari
// seedUsers.ts dengan role non-PEGAWAI) TIDAK disentuh/di-reset sama
// sekali - aman dijalankan berkali-kali, termasuk setelah ada penambahan
// data Pegawai baru (mis. setelah importPegawaiXlsx.ts di-run ulang).
//
// URUTAN JALANNYA: setelah seedUsers.ts (biar 13 akun demo dapat role
// khususnya duluan, tidak ke-set jadi PEGAWAI oleh skrip ini).
//
// TODO(legal-confirm): password = NIP (konvensi login sementara yang sama,
// lihat catatan panjang di src/auth/session.ts) - artinya SETIAP pegawai
// di basis data otomatis bisa login pakai NIP-nya sendiri. Ini DISENGAJA
// buat kebutuhan testing internal (akses cuma lewat jaringan kantor/VPN),
// TAPI wajib diganti begitu SSO Kemnaker tersambung - jangan dibiarkan
// begini pas sistem dibuka ke jaringan publik.
// ============================================================================

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [pegawaiList, userRows] = await Promise.all([
    prisma.pegawai.findMany({ select: { nip: true, nama: true } }),
    prisma.user.findMany({ select: { nip: true } }),
  ]);

  const nipSudahPunyaAkun = new Set(userRows.map((u) => u.nip));
  const perluDibuat = pegawaiList.filter((p) => !nipSudahPunyaAkun.has(p.nip));

  console.log(`Total pegawai        : ${pegawaiList.length}`);
  console.log(`Sudah punya akun     : ${pegawaiList.length - perluDibuat.length}`);
  console.log(`Akan dibuat (PEGAWAI): ${perluDibuat.length}`);

  if (perluDibuat.length === 0) {
    console.log("\nTidak ada akun baru yang perlu dibuat - selesai.");
    return;
  }

  const hasil = await prisma.user.createMany({
    data: perluDibuat.map((p) => ({
      nip: p.nip,
      nama: p.nama,
      role: "PEGAWAI" as const,
      // NULL sesuai konvensi skema: scoping PEGAWAI ke data sendiri lewat
      // relasi NIP ke Pegawai, bukan lewat User.satuanKerja (lihat komentar
      // di model User, schema.prisma).
      satuanKerja: null,
      aktif: true,
    })),
    skipDuplicates: true,
  });

  console.log(`\n-> ${hasil.count} akun PEGAWAI dibuat.`);

  const ringkasan = await prisma.user.groupBy({ by: ["role"], _count: { role: true } });
  console.log("\nRingkasan akun per role sekarang:");
  for (const r of ringkasan.sort((a, b) => b._count.role - a._count.role)) {
    console.log(`  ${r.role.padEnd(12)}: ${r._count.role}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
