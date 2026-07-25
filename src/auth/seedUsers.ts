// ============================================================================
// Seed akun User untuk simulasi/demo stakeholder - 13 akun lintas 6 role &
// 3+ satuan kerja. Cara pakai: npx tsx src/auth/seedUsers.ts
//
// Login pakai NIP sebagai username SEKALIGUS password (lihat TODO(legal-
// confirm) di src/auth/session.ts soal kenapa ini sementara/tidak aman).
//
// PENTING - beda dari seed sebelumnya: NIP di bawah BUKAN NIP contoh
// (prefix "0000"), tapi NIP ASLI dari data pegawai yang sudah diimpor
// (`prisma.pegawai`, ±5.069 baris - lihat src/jobs/importPegawaiXlsx.ts).
// Sengaja dipilih dari data asli (bukan bikin pegawai fiktif baru) supaya
// karakter simulasi ini punya data kepegawaian (jabatan, golongan, kelas
// jabatan, satuan kerja) yang konsisten dan tidak mengarang data pribadi.
// Detail kalkulasi/presensi/kinerja/banding/dst untuk akun-akun ini ada di
// src/db/seedSimulasi.ts (jalankan SETELAH file ini).
//
// Karakter & skenario (lihat CLAUDE.md "Role matrix" untuk detail role):
//   Biro Keuangan dan Barang Milik Negara:
//     - Alpha Sandro Adithyaswara -> ADMIN (diminta eksplisit oleh user)
//     - Irwan Syafril             -> PPABP (Tim PPABP Rokeu)
//     - John Pieter                -> PEGAWAI, skenario: lagi banding
//     - Prasetyo Muhammad Sidqi    -> PEGAWAI, skenario: uang lembur tidak biasa
//     - Kharina Olivia             -> PEGAWAI, skenario: lancar
//   Pusat Data dan Teknologi Informasi Ketenagakerjaan:
//     - Ayu Puspita Sari  -> KASUBAG_TU
//     - Firmansyah         -> PEGAWAI, skenario: Tukin ditolak jenjang 1
//     - Farid Arif         -> PEGAWAI, skenario: belum diajukan approval
//   Biro Umum:
//     - Luthfi Firdaus -> KASUBAG_TU
//     - Irvan Ganeva    -> PEGAWAI, skenario: banding (tahap 1 selesai)
//     - Herry Susanto   -> PEGAWAI, skenario: lancar
//   Lintas unit:
//     - Dian Kreshnadjati (Biro OSDMA)      -> OSDMA
//     - Cris Kuntadi (Sekretariat Jenderal) -> PIMPINAN
// ============================================================================

import { PrismaClient, type Role } from "@prisma/client";

const AKUN_CONTOH: Array<{
  nip: string;
  nama: string;
  role: Role;
  satuanKerja: string | null;
}> = [
  {
    nip: "198703232015031002",
    nama: "Alpha Sandro Adithyaswara",
    role: "ADMIN",
    satuanKerja: null,
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
      },
      update: {
        nama: akun.nama,
        role: akun.role,
        satuanKerja: akun.satuanKerja,
      },
    });
    console.log(
      `Akun User siap: NIP ${akun.nip} (login pakai NIP ini sebagai password juga) - role ${akun.role} - ${pegawai.satuanKerja}`
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
