// ============================================================================
// Seed akun User untuk simulasi/demo - 13 akun lintas 6 role & 3+ satuan
// kerja. Cara pakai: npx tsx src/auth/seedUsers.ts
//
// Login pakai NIP sebagai username SEKALIGUS password (lihat TODO(legal-
// confirm) di src/auth/session.ts soal kenapa ini sementara & tidak aman).
//
// NIP di bawah adalah NIP ASLI dari data pegawai yang sudah diimpor, bukan
// NIP contoh - supaya karakter simulasi punya data kepegawaian (jabatan,
// golongan, kelas jabatan, satuan kerja) yang konsisten dan tidak mengarang
// data pribadi. Detail kalkulasi/presensi/banding untuk akun-akun ini ada di
// src/db/seedSimulasi.ts (jalankan SETELAH file ini).
//
// Daftar karakter & skenarionya ada di tabel CLAUDE.md, bagian "Seed data
// simulasi" - jangan disalin ke sini supaya tidak ada dua daftar yang bisa
// berbeda.
// ============================================================================

import { PrismaClient, type Role } from "@prisma/client";

const AKUN_CONTOH: Array<{
  nip: string;
  nama: string;
  role: Role;
  satuanKerja: string | null;
  /** Role tambahan buat kemudahan testing - lihat model User (schema.prisma). */
  rolesTambahan?: Role[];
}> = [
  {
    nip: "198703232015031002",
    nama: "Alpha Sandro Adithyaswara",
    role: "ADMIN",
    // satuanKerja diisi (padahal ADMIN lintas satker) KHUSUS karena akun ini
    // punya role tambahan KASUBAG_TU: satu akun cuma punya SATU satuanKerja,
    // dan KASUBAG_TU tanpa unit = "buta unit" (tidak bisa lihat data apapun).
    satuanKerja: "Pusat Data dan Teknologi Informasi Ketenagakerjaan",
    // Akun demo ADMIN sengaja dikasih SEMUA role lain supaya penguji bisa
    // keliling semua sudut pandang lewat menu "Ganti role" di tombol akun,
    // tanpa logout-login pakai NIP orang lain. Ini KHUSUS akun demo -
    // jangan jadikan pola default waktu bikin akun production.
    rolesTambahan: ["KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "PEGAWAI"],
  },
  {
    nip: "197303072005011001",
    nama: "Irwan Syafril",
    role: "PPABP",
    satuanKerja: null, // NULL = berwenang lintas satker (asumsi pilot: tim PPABP pusat)
  },
  {
    nip: "198312302009121004",
    nama: "John Pieter",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "199611272018121001",
    nama: "Prasetyo Muhammad Sidqi",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "198810012011012009",
    nama: "Kharina Olivia",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "199006212015032005",
    nama: "Ayu Puspita Sari",
    role: "KASUBAG_TU",
    satuanKerja: "Pusat Data dan Teknologi Informasi Ketenagakerjaan",
  },
  {
    nip: "198308052009121004",
    nama: "Firmansyah",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "197611232006041015",
    nama: "Farid Arif",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "197904302011011012",
    nama: "Luthfi Firdaus",
    role: "KASUBAG_TU",
    satuanKerja: "Biro Umum",
  },
  {
    nip: "198604302011011011",
    nama: "Irvan Ganeva",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "197508061999031001",
    nama: "Herry Susanto",
    role: "PEGAWAI",
    satuanKerja: null,
  },
  {
    nip: "197410061999032002",
    nama: "Dian Kreshnadjati",
    role: "OSDMA",
    satuanKerja: null,
  },
  {
    nip: "196906241990031004",
    nama: "Cris Kuntadi",
    role: "PIMPINAN",
    satuanKerja: null,
  },
];

async function main() {
  const prisma = new PrismaClient();

  for (const akun of AKUN_CONTOH) {
    const pegawai = await prisma.pegawai.findUnique({ where: { nip: akun.nip } });
    if (!pegawai) {
      throw new Error(
        `NIP ${akun.nip} (${akun.nama}) tidak ditemukan di tabel pegawai - ` +
          `pastikan data pegawai asli sudah diimpor (npx tsx src/jobs/importPegawaiXlsx.ts) sebelum jalankan seed ini.`
      );
    }

    await prisma.user.upsert({
      where: { nip: akun.nip },
      create: {
        nip: akun.nip,
        nama: akun.nama,
        role: akun.role,
        satuanKerja: akun.satuanKerja,
        rolesTambahan: akun.rolesTambahan ?? [],
      },
      update: {
        nama: akun.nama,
        role: akun.role,
        satuanKerja: akun.satuanKerja,
        rolesTambahan: akun.rolesTambahan ?? [],
      },
    });
    const catatanRoleTambahan =
      akun.rolesTambahan && akun.rolesTambahan.length > 0 ? ` (+ role tambahan: ${akun.rolesTambahan.join(", ")})` : "";
    console.log(
      `Akun User siap: NIP ${akun.nip} (login pakai NIP ini sebagai password juga) - role ${akun.role}${catatanRoleTambahan} - ${pegawai.satuanKerja}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
