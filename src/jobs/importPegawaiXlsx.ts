// ============================================================================
// Import data pegawai dari file Excel (basis data pegawai) ke tabel Pegawai.
//
// BUKAN live sync ke SIAP - akses API SIAP masih informal (lihat CLAUDE.md).
// Ini snapshot manual yang perlu dijalankan ULANG tiap kali ada file basis
// data pegawai yang lebih baru (sifatnya "nanti di-update" sesuai basis
// data yang diberikan - Januari 2026, belum yang terbaru).
//
// Cara pakai: npx tsx src/jobs/importPegawaiXlsx.ts "<path ke file xlsx>"
//
// Kolom yang DIIMPOR (cuma yang dibutuhkan skema Pegawai - sengaja TIDAK
// import Alamat/No.HP/NPWP/Tempat-Tgl Lahir karena data pribadi itu tidak
// dibutuhkan sistem ini dan skema Pegawai memang tidak punya kolomnya):
//   NIP, Nama, Unit Kerja, GRADE (-> kelasJabatan), Gol (-> golongan), Jabatan
//
// TODO(confirm):
// - satuanKerja diisi SAMA dengan unitKerja - belum ada mapping resmi
//   "Unit Kerja" (82 nilai unik di file sumber) ke Eselon I/satuan kerja
//   yang lebih tinggi. Kalau ada strukturnya, filter satuan kerja di
//   dashboard bisa dibikin lebih rapi (per Eselon I, bukan per unit detail).
// - statusPegawai diisi "AKTIF" untuk SEMUA baris (asumsi: basis data ini
//   representasi pegawai aktif saat file dibuat). Kolom "Status" di file
//   sumber (PNS/PPPK/CPNS) adalah JENIS kepegawaian, BUKAN status aktif/
//   cuti/dst - belum dipetakan ke skema manapun. Perlu didiskusikan apakah
//   tukin berlaku sama untuk PPPK/CPNS seperti PNS (Permenaker 15/2024 perlu
//   dicek ulang soal cakupan subjek penerima).
// - Upsert ini TIDAK menghapus/menonaktifkan pegawai yang ada di database
//   tapi hilang dari file baru (misal karena pensiun/keluar) - itu perlu
//   proses terpisah, jangan diam-diam dihapus.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const SHEET_NAME = "Master Lengkap";
const HEADER_ROW_INDEX = 6; // baris ke-7 di Excel (1-indexed)

interface BarisPegawai {
  NIP: string | number;
  Nama: string;
  "Unit Kerja": string;
  GRADE: number;
  Gol?: string;
  Jabatan?: string;
}

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Pakai: npx tsx src/jobs/importPegawaiXlsx.ts "<path file xlsx>"');
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[SHEET_NAME];
  if (!sheet) {
    throw new Error(
      `Sheet "${SHEET_NAME}" tidak ditemukan. Sheet yang ada: ${workbook.SheetNames.join(", ")}`
    );
  }

  const baris = XLSX.utils.sheet_to_json<BarisPegawai>(sheet, {
    range: HEADER_ROW_INDEX,
  });

  const prisma = new PrismaClient();
  const waktuSync = new Date();

  let tersimpan = 0;
  let dilewati = 0;

  for (const b of baris) {
    const nip = String(b.NIP ?? "").trim();
    if (!nip || !b.Nama) {
      dilewati++;
      continue;
    }

    const kelasJabatan = typeof b.GRADE === "number" ? b.GRADE : Number(b.GRADE);

    await prisma.pegawai.upsert({
      where: { nip },
      create: {
        nip,
        nama: String(b.Nama).trim(),
        unitKerja: String(b["Unit Kerja"] ?? "").trim(),
        satuanKerja: String(b["Unit Kerja"] ?? "").trim(),
        statusPegawai: "AKTIF",
        jabatan: b.Jabatan ? String(b.Jabatan).trim() : null,
        golongan: b.Gol ? String(b.Gol).trim() : null,
        kelasJabatan: Number.isFinite(kelasJabatan) ? kelasJabatan : null,
        sourceSystem: "SIAP_XLSX_IMPORT",
        sourceSyncedAt: waktuSync,
      },
      update: {
        nama: String(b.Nama).trim(),
        unitKerja: String(b["Unit Kerja"] ?? "").trim(),
        satuanKerja: String(b["Unit Kerja"] ?? "").trim(),
        jabatan: b.Jabatan ? String(b.Jabatan).trim() : null,
        golongan: b.Gol ? String(b.Gol).trim() : null,
        kelasJabatan: Number.isFinite(kelasJabatan) ? kelasJabatan : null,
        sourceSyncedAt: waktuSync,
      },
    });
    tersimpan++;
  }

  console.log(
    `Import selesai: ${tersimpan} pegawai tersimpan/diperbarui, ${dilewati} baris dilewati (NIP/Nama kosong).`
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
