import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canBukaHalamanPredikatKinerja, type AuthUser } from "../../../../auth/permissions";

/**
 * Template rekap presensi - CSV, sudah terisi daftar pegawai unit yang
 * bersangkutan supaya NIP-nya tidak perlu diketik ulang (dan tidak salah
 * ketik). Route Handler, bukan Server Action, supaya bisa jadi <a href>
 * biasa yang langsung mengunduh tanpa JavaScript - konsisten dengan Export
 * ADK di /ppabp/adk.
 *
 * Kolomnya sengaja sama persis dengan tabel potongan Pasal 13 supaya orang
 * yang mengisi tahu tiap kolom berujung ke potongan yang mana.
 */
export const dynamic = "force-dynamic";

const KOLOM = [
  "NIP",
  "Nama",
  "Hari Alpha",
  "Tidak Presensi",
  "Menit Terlambat",
  "Menit Pulang Cepat",
  "Menit Meninggalkan Kantor",
  // Kolom "Menit Kekurangan Jam Kerja" DIHAPUS 2026-08-07 - Pasal 13 ayat (3)
  // cuma menyebut tiga pelanggaran bertarif per menit, dan ketiganya sudah
  // punya kolom sendiri di atas. File template lama yang masih memuat kolom
  // itu tetap bisa diupload; kolomnya sekadar diabaikan.
  "Tidak Ikut Upacara",
  // Cuti (Pasal 14). "Jenis Cuti" diisi salah satu label yang dikenali - lihat
  // LABEL_JENIS_CUTI. "Bulan Cuti Ke" WAJIB diisi untuk cuti sakit & cuti
  // besar (penentu tarif 50%/75%/90%); "Hari Cuti" khusus dipakai cuti sakit
  // gugur kandungan yang tarifnya 1% per hari.
  "Jenis Cuti",
  "Bulan Cuti Ke",
  "Hari Cuti",
  "Hari Kerja",
  "Hari Hadir",
  "Hari WFO",
  "Hari WFH/WFA",
  "Hari Diklat",
  "Hari Dinas Luar",
  // Diisi > 0 kalau pegawai menjalani tugas belajar pada periode ini -
  // Tunjangan Kinerja-nya dibayar 80% (Permenaker 15/2024).
  "Hari Tugas Belajar",
  "Jam Lembur",
  "Hari Makan Lembur",
  "Jam Lembur Hari Libur",
  "Hari Makan Lembur Hari Libur",
];

function sel(nilai: string): string {
  return /[",\n]/.test(nilai) ? `"${nilai.replace(/"/g, '""')}"` : nilai;
}

export async function GET(request: Request) {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return new NextResponse("Akses ditolak", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  // KASUBAG_TU dipaksa ke unitnya sendiri, sama seperti halaman-halaman unit.
  const satker =
    authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : searchParams.get("satker");

  const pegawaiList = await prisma.pegawai.findMany({
    where: satker ? { satuanKerja: satker } : {},
    select: { nip: true, nama: true },
    orderBy: { nama: "asc" },
    take: 2000,
  });

  const baris = [
    KOLOM.join(","),
    ...pegawaiList.map((p) =>
      // 6 nol pertama = kolom potongan Pasal 13 (alpha, tidak presensi,
      // terlambat, pulang cepat, meninggalkan kantor, upacara); 3 kolom cuti
      // dikosongkan (kosong = tidak cuti, JANGAN diisi 0 untuk jenisnya);
      // 4 kosong = hari kerja/hadir/WFO/WFH yang wajib diisi manual; 7 nol
      // terakhir = diklat/dinas luar/tugas belajar + empat kolom lembur.
      [
        sel(p.nip), sel(p.nama),
        "0", "0", "0", "0", "0", "0",
        "", "", "0",
        "", "", "", "",
        "0", "0", "0", "0", "0", "0", "0",
      ].join(",")
    ),
  ];

  const namaFile = `template-rekap-presensi${satker ? `-${satker.replace(/[^a-zA-Z0-9]+/g, "-")}` : ""}.csv`;
  return new NextResponse("﻿" + baris.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${namaFile}"`,
    },
  });
}
