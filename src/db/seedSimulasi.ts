// ============================================================================
// SEED SIMULASI - data presensi/kinerja/kalkulasi/approval/banding/SK KGB/
// SK hukuman disiplin/anggaran-realisasi/bukti potong pajak untuk 13 akun
// yang dibuat src/auth/seedUsers.ts (JALANKAN FILE ITU DULU).
// Cara pakai: npx tsx src/db/seedSimulasi.ts
//
// TUJUAN: simulasi/demo presentasi stakeholder - variasi skenario supaya
// dashboard & alur approval kelihatan hidup, BUKAN data produksi. Nominal
// tarif uang makan/lembur di bawah masih angka contoh (sama dengan
// src/jobs/runUangMakanJobDemo.ts / runUangLemburJobDemo.ts) - TODO(confirm)
// SBM resmi, lihat CLAUDE.md item open #8.
//
// Reuse business logic & approval service YANG SUDAH ADA (hitungTukin,
// hitungUangMakan, hitungUangLembur, ajukanApprovalTukin/UangMakan/
// UangLembur) - skrip ini SENGAJA tidak menghitung ulang logika kalkulasi
// atau evaluasi approval sendiri, cuma orchestrate + tulis ke DB, konsisten
// dengan pola job scheduler (src/jobs/hitungTukinPeriodeJob.ts dst).
//
// Approval Banding, SK KGB, SK Hukuman Disiplin BELUM punya service khusus
// (itu bagian dari authorization layer/UI langkah berikutnya) - baris
// ApprovalLog untuk ketiganya ditulis langsung di sini, mengikuti pola
// jenjang yang SUDAH ditetapkan di skema (lihat komentar model Banding/
// SkKgb/SkHukumanDisiplin di schema.prisma).
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { hitungTukin } from "../business-logic/tukin";
import { hitungUangMakan } from "../business-logic/uangMakan";
import { hitungUangLembur } from "../business-logic/uangLembur";
import { validasiTukin, validasiUangMakan, validasiUangLembur } from "../validation/validationGate";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../business-logic/tarifTukinPokok";
import { konversiPredikatKeNilaiPersen, type PredikatKinerja } from "../business-logic/konversiPredikat";
import { ajukanApprovalTukin } from "../approval/approvalTukinService";
import { ajukanApprovalUangMakan } from "../approval/approvalUangMakanService";
import { ajukanApprovalUangLembur } from "../approval/approvalUangLemburService";
import type { RekapKehadiranPeriode, StatusKehadiran } from "../types/index";

const prisma = new PrismaClient();

const TARIF_UANG_MAKAN = 35_000; // TODO(confirm): angka contoh, bukan SBM resmi
const TARIF_UANG_LEMBUR = 25_000; // TODO(confirm): angka contoh, bukan SBM resmi

const PERIODE_LALU = { bulan: 6, tahun: 2026 };
const PERIODE_BERJALAN = { bulan: 7, tahun: 2026 };

// Identitas approver placeholder buat unit yang di simulasi ini belum punya
// akun KASUBAG_TU sendiri (Biro Keuangan dan BMN, Biro OSDMA, Sekretariat
// Jenderal), dan buat jenjang final ketika PPABP-nya sendiri jadi subjek
// kalkulasi (hindari self-approval) - pola sama dengan identitas placeholder
// di src/jobs/runApprovalDemo.ts (approverNip tidak harus akun User asli).
const PLT_KASUBAG = { nip: "000000000000000900", nama: "Plt. Kepala Bagian Umum", jabatan: "Pelaksana Tugas Kepala Bagian" };
const PLT_PPABP = { nip: "000000000000000901", nama: "Plt. Ketua Tim PPABP", jabatan: "Pelaksana Tugas Ketua Tim PPABP" };

const KASUBAG_PUSDATIK = { nip: "199006212015032005", nama: "Ayu Puspita Sari", jabatan: "Kepala Subbagian Tata Usaha" };
const KASUBAG_UMUM = { nip: "197904302011011012", nama: "Luthfi Firdaus", jabatan: "Kepala Bagian Rumah Tangga dan Perlengkapan" };
const PPABP = { nip: "197303072005011001", nama: "Irwan Syafril", jabatan: "Analis Pengelolaan Keuangan APBN Ahli Madya (Tim PPABP Rokeu)" };

type Skenario =
  | "LANCAR"
  | "BANDING_DIAJUKAN"
  | "BANDING_TAHAP1_SELESAI"
  | "LEMBUR_TIDAK_BIASA"
  | "DITOLAK"
  | "BELUM_DIAJUKAN";

interface PresensiOverride {
  offset: number; // index ke hari kerja ke-n (0-based) dalam bulan
  status: StatusKehadiran;
  menitTerlambat?: number;
}

interface Karakter {
  nip: string;
  predikat: PredikatKinerja;
  skenario: Skenario;
  hariAlpha: number;
  tidakPresensi: number;
  menitTerlambat: number;
  jamLembur: number; // periode berjalan
  jamLemburLalu: number; // periode lalu (biar kontras kalau tidak biasa)
  presensiOverride: PresensiOverride[];
  jenjang1: { nip: string; nama: string; jabatan: string };
  jenjang2: { nip: string; nama: string; jabatan: string };
}

const KARAKTER: Karakter[] = [
  {
    nip: "198703232015031002", // Alpha Sandro Adithyaswara - ADMIN
    predikat: "SANGAT_BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 8,
    jamLemburLalu: 6,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "197303072005011001", // Irwan Syafril - PPABP (self, hindari self-approve jenjang 2)
    predikat: "SANGAT_BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 6,
    jamLemburLalu: 6,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PLT_PPABP,
  },
  {
    nip: "198312302009121004", // John Pieter - PEGAWAI, banding baru diajukan
    predikat: "BAIK",
    skenario: "BANDING_DIAJUKAN",
    hariAlpha: 0,
    tidakPresensi: 1,
    menitTerlambat: 0,
    jamLembur: 4,
    jamLemburLalu: 4,
    presensiOverride: [{ offset: 8, status: "TIDAK_PRESENSI" }],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "199611272018121001", // Prasetyo Muhammad Sidqi - PEGAWAI, lembur tidak biasa
    predikat: "BAIK",
    skenario: "LEMBUR_TIDAK_BIASA",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 52, // > batas default 40 jam/bulan -> anomali & dipotong otomatis
    jamLemburLalu: 6,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "198810012011012009", // Kharina Olivia - PEGAWAI, lancar
    predikat: "BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 5,
    jamLemburLalu: 5,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "199006212015032005", // Ayu Puspita Sari - KASUBAG_TU Pusdatik (self, hindari self-approve jenjang 1)
    predikat: "SANGAT_BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 6,
    jamLemburLalu: 6,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "198308052009121004", // Firmansyah - PEGAWAI, Tukin ditolak jenjang 1
    predikat: "BAIK",
    skenario: "DITOLAK",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 3,
    jamLemburLalu: 3,
    presensiOverride: [],
    jenjang1: KASUBAG_PUSDATIK,
    jenjang2: PPABP,
  },
  {
    nip: "197611232006041015", // Farid Arif - PEGAWAI, belum diajukan approval
    predikat: "BAIK",
    skenario: "BELUM_DIAJUKAN",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 2,
    jamLemburLalu: 2,
    presensiOverride: [],
    jenjang1: KASUBAG_PUSDATIK,
    jenjang2: PPABP,
  },
  {
    nip: "197904302011011012", // Luthfi Firdaus - KASUBAG_TU Biro Umum (self)
    predikat: "SANGAT_BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 7,
    jamLemburLalu: 7,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "198604302011011011", // Irvan Ganeva - PEGAWAI, banding tahap 1 selesai
    predikat: "BAIK",
    skenario: "BANDING_TAHAP1_SELESAI",
    hariAlpha: 2,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 4,
    jamLemburLalu: 4,
    presensiOverride: [
      { offset: 5, status: "ALPHA" },
      { offset: 6, status: "ALPHA" },
    ],
    jenjang1: KASUBAG_UMUM,
    jenjang2: PPABP,
  },
  {
    nip: "197508061999031001", // Herry Susanto - PEGAWAI, lancar
    predikat: "BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 10,
    jamLemburLalu: 9,
    presensiOverride: [],
    jenjang1: KASUBAG_UMUM,
    jenjang2: PPABP,
  },
  {
    nip: "197410061999032002", // Dian Kreshnadjati - OSDMA
    predikat: "SANGAT_BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 5,
    jamLemburLalu: 5,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
  {
    nip: "196906241990031004", // Cris Kuntadi - PIMPINAN
    predikat: "SANGAT_BAIK",
    skenario: "LANCAR",
    hariAlpha: 0,
    tidakPresensi: 0,
    menitTerlambat: 0,
    jamLembur: 3,
    jamLemburLalu: 3,
    presensiOverride: [],
    jenjang1: PLT_KASUBAG,
    jenjang2: PPABP,
  },
];

const HARI_KERJA = 22;

function hariKerjaBulan(bulan: number, tahun: number): Date[] {
  const hasil: Date[] = [];
  const tanggal = new Date(Date.UTC(tahun, bulan - 1, 1));
  while (tanggal.getUTCMonth() === bulan - 1) {
    const hari = tanggal.getUTCDay();
    if (hari !== 0 && hari !== 6) hasil.push(new Date(tanggal));
    tanggal.setUTCDate(tanggal.getUTCDate() + 1);
  }
  return hasil;
}

async function buatPresensiHarian(pegawaiId: string, k: Karakter) {
  const hariKerja = hariKerjaBulan(PERIODE_BERJALAN.bulan, PERIODE_BERJALAN.tahun);
  const overrideByOffset = new Map(k.presensiOverride.map((o) => [o.offset, o]));

  for (let i = 0; i < hariKerja.length; i++) {
    const override = overrideByOffset.get(i);
    const status: StatusKehadiran = override?.status ?? "HADIR";
    const menitTerlambat = override?.menitTerlambat ?? 0;
    const tanggal = hariKerja[i];
    const jamMasuk = status === "HADIR" || status === "TERLAMBAT" ? new Date(tanggal.getTime() + 8 * 3600_000) : null;
    const jamKeluar = status === "HADIR" || status === "TERLAMBAT" ? new Date(tanggal.getTime() + 16 * 3600_000) : null;

    await prisma.presensiHarian.upsert({
      where: { pegawaiId_tanggal: { pegawaiId, tanggal } },
      create: {
        pegawaiId,
        tanggal,
        jamMasuk,
        jamKeluar,
        statusKehadiran: status,
        menitTerlambat,
        sourceSyncedAt: new Date(),
      },
      update: {
        jamMasuk,
        jamKeluar,
        statusKehadiran: status,
        menitTerlambat,
        sourceSyncedAt: new Date(),
      },
    });
  }
}

async function hitungDanSimpanPeriode(
  pegawaiId: string,
  pegawaiNip: string,
  kelasJabatan: number,
  periode: { bulan: number; tahun: number },
  k: Karakter,
  jamLembur: number,
  predikat: PredikatKinerja
) {
  await prisma.predikatKinerja.upsert({
    where: {
      pegawaiId_periodeBulan_periodeTahun: {
        pegawaiId,
        periodeBulan: periode.bulan,
        periodeTahun: periode.tahun,
      },
    },
    create: {
      pegawaiId,
      periodeBulan: periode.bulan,
      periodeTahun: periode.tahun,
      predikat,
      nilaiAngka: konversiPredikatKeNilaiPersen(predikat),
      sourceSyncedAt: new Date(),
    },
    update: {
      predikat,
      nilaiAngka: konversiPredikatKeNilaiPersen(predikat),
      sourceSyncedAt: new Date(),
    },
  });

  const hariHadir = HARI_KERJA - k.hariAlpha - (k.tidakPresensi > 0 ? 0 : 0);
  const rekapKehadiran: RekapKehadiranPeriode = {
    pegawaiId: pegawaiNip,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
    jumlahHariAlpha: k.hariAlpha,
    jumlahTidakPresensi: k.tidakPresensi,
    totalMenitTerlambat: k.menitTerlambat,
        totalMenitPulangCepat: 0,
        totalMenitMeninggalkanKantor: 0,
    jumlahTidakIkutUpacara: 0,
    jumlahHariKerja: HARI_KERJA,
    jumlahHariHadir: hariHadir,
    totalJamLembur: jamLembur,
  };

  const tukinPokokKelasJabatan = TUKIN_POKOK_PER_KELAS_JABATAN[kelasJabatan];
  const hasilTukin = hitungTukin({
    pegawaiId: pegawaiNip,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
    tukinPokokKelasJabatan,
    rekapKehadiran,
    capaianKinerja: {
      pegawaiId: pegawaiNip,
      periodeBulan: periode.bulan,
      periodeTahun: periode.tahun,
      nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen(predikat),
    },
  });
  const validasiTukinHasil = validasiTukin(hasilTukin);
  const tukinRow = await prisma.tukinCalculation.upsert({
    where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan: periode.bulan, periodeTahun: periode.tahun } },
    create: {
      pegawaiId,
      periodeBulan: periode.bulan,
      periodeTahun: periode.tahun,
      komponenKehadiran: hasilTukin.komponenKehadiranSetelahPotongan,
      komponenKinerja: hasilTukin.komponenKinerja,
      tukinPokok: hasilTukin.tukinPokok,
      potonganPph: hasilTukin.potonganPph,
      tukinBersih: hasilTukin.tukinBersih,
      status: "DRAFT",
      catatanAnomali: validasiTukinHasil.anomali.length ? validasiTukinHasil.anomali.join("; ") : null,
    },
    update: {
      komponenKehadiran: hasilTukin.komponenKehadiranSetelahPotongan,
      komponenKinerja: hasilTukin.komponenKinerja,
      tukinPokok: hasilTukin.tukinPokok,
      potonganPph: hasilTukin.potonganPph,
      tukinBersih: hasilTukin.tukinBersih,
      status: "DRAFT",
      calculatedAt: new Date(),
      approvedAt: null,
      approvedBy: null,
      catatanAnomali: validasiTukinHasil.anomali.length ? validasiTukinHasil.anomali.join("; ") : null,
    },
  });

  const hasilUm = hitungUangMakan({
    pegawaiId: pegawaiNip,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
    jumlahHariKerja: HARI_KERJA,
    jumlahHariHadir: hariHadir,
    tarifHarianUangMakan: TARIF_UANG_MAKAN,
  });
  const validasiUmHasil = validasiUangMakan(hasilUm);
  const umRow = await prisma.uangMakan.upsert({
    where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan: periode.bulan, periodeTahun: periode.tahun } },
    create: {
      pegawaiId,
      periodeBulan: periode.bulan,
      periodeTahun: periode.tahun,
      jumlahHariKerja: HARI_KERJA,
      jumlahHariHadir: hariHadir,
      tarifHarian: TARIF_UANG_MAKAN,
      totalUangMakan: hasilUm.totalUangMakan,
      status: "DRAFT",
      catatanAnomali: validasiUmHasil.anomali.length ? validasiUmHasil.anomali.join("; ") : null,
    },
    update: {
      jumlahHariKerja: HARI_KERJA,
      jumlahHariHadir: hariHadir,
      tarifHarian: TARIF_UANG_MAKAN,
      totalUangMakan: hasilUm.totalUangMakan,
      status: "DRAFT",
      calculatedAt: new Date(),
      approvedAt: null,
      approvedBy: null,
      catatanAnomali: validasiUmHasil.anomali.length ? validasiUmHasil.anomali.join("; ") : null,
    },
  });

  const hasilLembur = hitungUangLembur({
    pegawaiId: pegawaiNip,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
    totalJamLembur: jamLembur,
    tarifPerJam: TARIF_UANG_LEMBUR,
  });
  const validasiLemburHasil = validasiUangLembur(hasilLembur);
  const lemburRow = await prisma.uangLembur.upsert({
    where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan: periode.bulan, periodeTahun: periode.tahun } },
    create: {
      pegawaiId,
      periodeBulan: periode.bulan,
      periodeTahun: periode.tahun,
      totalJamLembur: jamLembur,
      tarifPerJam: TARIF_UANG_LEMBUR,
      totalUangLembur: hasilLembur.totalUangLembur,
      status: "DRAFT",
      catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
    },
    update: {
      totalJamLembur: jamLembur,
      tarifPerJam: TARIF_UANG_LEMBUR,
      totalUangLembur: hasilLembur.totalUangLembur,
      status: "DRAFT",
      calculatedAt: new Date(),
      approvedAt: null,
      approvedBy: null,
      catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
    },
  });

  return { tukinRow, umRow, lemburRow };
}

async function setujuiDuaJenjang(
  ajukan: (jenjang: number, approver: { nip: string; nama: string; jabatan: string }) => Promise<unknown>,
  jenjang1: { nip: string; nama: string; jabatan: string },
  jenjang2: { nip: string; nama: string; jabatan: string }
) {
  await ajukan(1, jenjang1);
  await ajukan(2, jenjang2);
}

async function main() {
  const userByNip = new Map<string, { id: string; nama: string; nip: string }>();
  for (const k of KARAKTER) {
    const user = await prisma.user.findUnique({ where: { nip: k.nip } });
    if (!user) {
      throw new Error(`User NIP ${k.nip} belum ada - jalankan npx tsx src/auth/seedUsers.ts dulu.`);
    }
    userByNip.set(k.nip, user);
  }

  for (const k of KARAKTER) {
    const pegawai = await prisma.pegawai.findUnique({ where: { nip: k.nip } });
    if (!pegawai || pegawai.kelasJabatan === null) {
      throw new Error(`Pegawai NIP ${k.nip} tidak ditemukan atau kelasJabatan kosong.`);
    }
    console.log(`\n=== ${pegawai.nama} (${pegawai.satuanKerja}) - skenario ${k.skenario} ===`);

    // Periode lalu: semua "lancar" (histori pembayaran yang sudah selesai).
    const lalu = await hitungDanSimpanPeriode(
      pegawai.id,
      k.nip,
      pegawai.kelasJabatan,
      PERIODE_LALU,
      k,
      k.jamLemburLalu,
      k.predikat
    );
    await setujuiDuaJenjang(
      (jenjang, approver) =>
        ajukanApprovalTukin(prisma, {
          tukinCalculationId: lalu.tukinRow.id,
          approverNip: approver.nip,
          approverNama: approver.nama,
          approverJabatan: approver.jabatan,
          jenjang,
          keputusan: "SETUJU",
        }),
      k.jenjang1,
      k.jenjang2
    );
    await setujuiDuaJenjang(
      (jenjang, approver) =>
        ajukanApprovalUangMakan(prisma, {
          uangMakanId: lalu.umRow.id,
          approverNip: approver.nip,
          approverNama: approver.nama,
          approverJabatan: approver.jabatan,
          jenjang,
          keputusan: "SETUJU",
        }),
      k.jenjang1,
      k.jenjang2
    );
    await setujuiDuaJenjang(
      (jenjang, approver) =>
        ajukanApprovalUangLembur(prisma, {
          uangLemburId: lalu.lemburRow.id,
          approverNip: approver.nip,
          approverNama: approver.nama,
          approverJabatan: approver.jabatan,
          jenjang,
          keputusan: "SETUJU",
        }),
      k.jenjang1,
      k.jenjang2
    );

    // Periode berjalan: presensi harian + kalkulasi sesuai skenario masing-masing.
    await buatPresensiHarian(pegawai.id, k);
    const berjalan = await hitungDanSimpanPeriode(
      pegawai.id,
      k.nip,
      pegawai.kelasJabatan,
      PERIODE_BERJALAN,
      k,
      k.jamLembur,
      k.predikat
    );

    if (k.skenario === "LANCAR") {
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalTukin(prisma, {
            tukinCalculationId: berjalan.tukinRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangMakan(prisma, {
            uangMakanId: berjalan.umRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangLembur(prisma, {
            uangLemburId: berjalan.lemburRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      console.log("  -> Tukin/Uang Makan/Uang Lembur periode berjalan: DISETUJUI (2 jenjang).");
    } else if (k.skenario === "DITOLAK") {
      // Cuma Tukin yang ditolak jenjang 1 - Uang Makan/Lembur tetap lancar,
      // supaya kelihatan tiap komponen punya siklus approval independen.
      await ajukanApprovalTukin(prisma, {
        tukinCalculationId: berjalan.tukinRow.id,
        approverNip: k.jenjang1.nip,
        approverNama: k.jenjang1.nama,
        approverJabatan: k.jenjang1.jabatan,
        jenjang: 1,
        keputusan: "TOLAK",
        catatan: "Jumlah jam lembur tidak sesuai rekap presensi unit - mohon dicek ulang sebelum diajukan lagi.",
      });
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangMakan(prisma, {
            uangMakanId: berjalan.umRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangLembur(prisma, {
            uangLemburId: berjalan.lemburRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      console.log("  -> Tukin periode berjalan: DITOLAK jenjang 1. Uang Makan/Lembur: disetujui.");
    } else if (k.skenario === "BELUM_DIAJUKAN") {
      console.log("  -> Tukin/Uang Makan/Uang Lembur periode berjalan: DIBIARKAN belum diajukan approval.");
    } else if (k.skenario === "LEMBUR_TIDAK_BIASA") {
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalTukin(prisma, {
            tukinCalculationId: berjalan.tukinRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangMakan(prisma, {
            uangMakanId: berjalan.umRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      console.log(
        `  -> Uang Lembur periode berjalan: ${k.jamLembur} jam diajukan (batas default 40 jam) - dibiarkan MENUNGGU approval karena anomali, belum di-setujui.`
      );
    } else {
      // BANDING_DIAJUKAN / BANDING_TAHAP1_SELESAI: Tukin dibiarkan menunggu
      // approval (sedang dibanding), UM/Lembur tetap lancar.
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangMakan(prisma, {
            uangMakanId: berjalan.umRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      await setujuiDuaJenjang(
        (jenjang, approver) =>
          ajukanApprovalUangLembur(prisma, {
            uangLemburId: berjalan.lemburRow.id,
            approverNip: approver.nip,
            approverNama: approver.nama,
            approverJabatan: approver.jabatan,
            jenjang,
            keputusan: "SETUJU",
          }),
        k.jenjang1,
        k.jenjang2
      );
      console.log("  -> Tukin periode berjalan: dibiarkan menunggu approval (sedang dibanding).");
    }
  }

  // --------------------------------------------------------------------
  // BANDING - John Pieter (baru diajukan) & Irvan Ganeva (tahap 1 selesai)
  // --------------------------------------------------------------------
  console.log("\n=== Banding ===");
  const johnPieter = userByNip.get("198312302009121004")!;
  const johnPegawai = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "198312302009121004" } });
  const johnTukin = await prisma.tukinCalculation.findUniqueOrThrow({
    where: {
      pegawaiId_periodeBulan_periodeTahun: {
        pegawaiId: johnPegawai.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
      },
    },
  });

  await prisma.$transaction([
    prisma.banding.create({
      data: {
        pegawaiId: johnPegawai.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
        referensiTipe: "TUKIN",
        referensiId: johnTukin.id,
        pengajuId: johnPieter.id,
        alasan:
          "Tanggal 10 Juli 2026 tercatat TIDAK_PRESENSI padahal saya hadir dan sudah tap in/out - mohon dicek ulang ke rekap e-Presensi.",
        status: "DIAJUKAN",
      },
    }),
    prisma.reconciliationStatus.upsert({
      where: {
        pegawaiId_periodeBulan_periodeTahun: {
          pegawaiId: johnPegawai.id,
          periodeBulan: PERIODE_BERJALAN.bulan,
          periodeTahun: PERIODE_BERJALAN.tahun,
        },
      },
      create: {
        pegawaiId: johnPegawai.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
        status: "SANGGAH",
      },
      update: { status: "SANGGAH" },
    }),
  ]);
  console.log(`  -> Banding John Pieter (${johnPegawai.nama}): status DIAJUKAN.`);

  const irvan = userByNip.get("198604302011011011")!;
  const irvanPegawai = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "198604302011011011" } });
  const irvanTukin = await prisma.tukinCalculation.findUniqueOrThrow({
    where: {
      pegawaiId_periodeBulan_periodeTahun: {
        pegawaiId: irvanPegawai.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
      },
    },
  });

  const [irvanBanding] = await prisma.$transaction([
    prisma.banding.create({
      data: {
        pegawaiId: irvanPegawai.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
        referensiTipe: "TUKIN",
        referensiId: irvanTukin.id,
        pengajuId: irvan.id,
        alasan:
          "2 hari yang tercatat ALPHA itu sebenarnya cuti yang telat dilaporkan ke e-Presensi - sudah saya urus ke unit, datanya di Gajihub belum ter-update.",
        status: "MENUNGGU_APPROVAL_FINAL",
      },
    }),
    prisma.reconciliationStatus.upsert({
      where: {
        pegawaiId_periodeBulan_periodeTahun: {
          pegawaiId: irvanPegawai.id,
          periodeBulan: PERIODE_BERJALAN.bulan,
          periodeTahun: PERIODE_BERJALAN.tahun,
        },
      },
      create: {
        pegawaiId: irvanPegawai.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
        status: "SANGGAH",
      },
      update: { status: "SANGGAH" },
    }),
  ]);
  await prisma.approvalLog.create({
    data: {
      referensiTipe: "BANDING",
      referensiId: irvanBanding.id,
      approverNip: KASUBAG_UMUM.nip,
      approverNama: KASUBAG_UMUM.nama,
      approverJabatan: KASUBAG_UMUM.jabatan,
      jenjang: 1,
      keputusan: "SETUJU",
      catatan: "Sudah dicek ke e-Presensi, memang keterlambatan lapor cuti - diteruskan ke OSDMA untuk keputusan final.",
    },
  });
  await prisma.buktiDukung.create({
    data: {
      bandingId: irvanBanding.id,
      jenisDokumen: "SURAT_CUTI_IZIN",
      namaFile: "surat-keterangan-cuti-irvan-ganeva.pdf",
      // TODO(confirm): placeholder - mekanisme penyimpanan file belum
      // diputuskan, lihat komentar model BuktiDukung di schema.prisma.
      fileUrl: "https://placeholder.local/bukti-dukung/irvan-ganeva-surat-cuti.pdf",
      diunggahOlehId: irvan.id,
    },
  });
  console.log(`  -> Banding Irvan Ganeva (${irvanPegawai.nama}): jenjang 1 SETUJU, menunggu approval final OSDMA.`);

  // --------------------------------------------------------------------
  // RECONCILIATION STATUS - SELISIH untuk Kharina Olivia (skenario BARU,
  // buat kebutuhan demo UI PPABP "handle selisih" - sebelumnya cuma ada
  // 2 baris ReconciliationStatus, keduanya status SANGGAH dari Banding di
  // atas, jadi tidak ada contoh kasus SELISIH murni buat didemokan. Upsert
  // (bukan create) supaya aman di-run ulang, konsisten dengan bagian
  // kalkulasi/presensi/kinerja di atas.
  // --------------------------------------------------------------------
  console.log("\n=== Reconciliation Status (SELISIH) ===");
  const kharinaPegawaiRecon = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "198810012011012009" } });
  await prisma.reconciliationStatus.upsert({
    where: {
      pegawaiId_periodeBulan_periodeTahun: {
        pegawaiId: kharinaPegawaiRecon.id,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
      },
    },
    create: {
      pegawaiId: kharinaPegawaiRecon.id,
      periodeBulan: PERIODE_BERJALAN.bulan,
      periodeTahun: PERIODE_BERJALAN.tahun,
      status: "SELISIH",
      detailSelisih: {
        field: "jumlahHariHadir",
        gajihub: 22,
        eAbsensi: 21,
        catatan: "Selisih 1 hari - kemungkinan double sync dari e-Presensi, perlu dicek PPABP sebelum kalkulasi dikirim.",
      },
    },
    update: {
      status: "SELISIH",
      detailSelisih: {
        field: "jumlahHariHadir",
        gajihub: 22,
        eAbsensi: 21,
        catatan: "Selisih 1 hari - kemungkinan double sync dari e-Presensi, perlu dicek PPABP sebelum kalkulasi dikirim.",
      },
    },
  });
  console.log(`  -> ReconciliationStatus ${kharinaPegawaiRecon.nama} periode ${PERIODE_BERJALAN.bulan}/${PERIODE_BERJALAN.tahun}: SELISIH.`);

  // --------------------------------------------------------------------
  // SK KGB - diajukan Kasubag TU Pusdatik untuk Firmansyah
  // --------------------------------------------------------------------
  console.log("\n=== SK KGB ===");
  const ayu = userByNip.get("199006212015032005")!;
  const firmansyahPegawai = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "198308052009121004" } });
  await prisma.skKgb.create({
    data: {
      pegawaiId: firmansyahPegawai.id,
      nomorSk: "SK.KGB/001/PUSDATIK/VII/2026",
      tanggalSk: new Date("2026-07-15"),
      tmtKgb: new Date("2026-08-01"),
      golonganLama: firmansyahPegawai.golongan ?? "IV/a",
      golonganBaru: "IV/b",
      fileUrl: "https://placeholder.local/sk-kgb/firmansyah.pdf",
      diajukanOlehId: ayu.id,
      status: "DIAJUKAN",
    },
  });
  console.log(`  -> SK KGB untuk ${firmansyahPegawai.nama}: diajukan ${KASUBAG_PUSDATIK.nama}, menunggu approval OSDMA.`);

  // --------------------------------------------------------------------
  // SK HUKUMAN DISIPLIN - diajukan Kasubag TU Biro Umum untuk Herry Susanto
  // TODO(confirm): lihat catatan panjang di model SkHukumanDisiplin
  // (schema.prisma) - alur approval OSDMA di sini ASUMSI, belum konfirmasi
  // resmi ke OSDMA/Biro Hukum.
  // --------------------------------------------------------------------
  console.log("\n=== SK Hukuman Disiplin ===");
  const luthfi = userByNip.get("197904302011011012")!;
  const herryPegawai = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "197508061999031001" } });
  await prisma.skHukumanDisiplin.create({
    data: {
      pegawaiId: herryPegawai.id,
      nomorSk: "SK.HD/003/BIRO-UMUM/VII/2026",
      tanggalSk: new Date("2026-07-18"),
      jenisHukuman: "Teguran Tertulis",
      keterangan: "Keterlambatan berulang tanpa keterangan sah pada bulan Juni-Juli 2026.",
      periodeMulaiBulan: 7,
      periodeMulaiTahun: 2026,
      periodeSelesaiBulan: 9,
      periodeSelesaiTahun: 2026,
      fileUrl: "https://placeholder.local/sk-hukuman-disiplin/herry-susanto.pdf",
      diajukanOlehId: luthfi.id,
      status: "DIAJUKAN",
    },
  });
  console.log(`  -> SK Hukuman Disiplin untuk ${herryPegawai.nama}: diajukan ${KASUBAG_UMUM.nama}, menunggu approval OSDMA.`);

  // --------------------------------------------------------------------
  // ANGGARAN REALISASI - upload PPABP, 3 unit, periode berjalan
  // --------------------------------------------------------------------
  console.log("\n=== Anggaran Realisasi ===");
  const irwan = userByNip.get("197303072005011001")!;
  const anggaranData = [
    { satuanKerja: "Biro Keuangan dan Barang Milik Negara", pagu: 3_200_000_000, realisasi: 1_850_000_000 },
    { satuanKerja: "Pusat Data dan Teknologi Informasi Ketenagakerjaan", pagu: 5_100_000_000, realisasi: 2_900_000_000 },
    { satuanKerja: "Biro Umum", pagu: 6_400_000_000, realisasi: 3_700_000_000 },
  ];
  for (const a of anggaranData) {
    await prisma.anggaranRealisasi.upsert({
      where: {
        satuanKerja_periodeBulan_periodeTahun: {
          satuanKerja: a.satuanKerja,
          periodeBulan: PERIODE_BERJALAN.bulan,
          periodeTahun: PERIODE_BERJALAN.tahun,
        },
      },
      create: {
        satuanKerja: a.satuanKerja,
        periodeBulan: PERIODE_BERJALAN.bulan,
        periodeTahun: PERIODE_BERJALAN.tahun,
        pagu: a.pagu,
        realisasi: a.realisasi,
        diunggahOlehId: irwan.id,
      },
      update: {
        pagu: a.pagu,
        realisasi: a.realisasi,
        diunggahOlehId: irwan.id,
      },
    });
    console.log(`  -> ${a.satuanKerja}: pagu Rp${a.pagu.toLocaleString("id-ID")}, realisasi Rp${a.realisasi.toLocaleString("id-ID")}`);
  }

  // --------------------------------------------------------------------
  // BUKTI POTONG PAJAK - hasil upload manual (bukan API), tahun pajak lalu
  // --------------------------------------------------------------------
  console.log("\n=== Bukti Potong Pajak ===");
  const alphaPegawai = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "198703232015031002" } });
  const irwanPegawai = await prisma.pegawai.findUniqueOrThrow({ where: { nip: "197303072005011001" } });
  for (const p of [alphaPegawai, irwanPegawai]) {
    await prisma.buktiPotongPajak.upsert({
      where: { pegawaiId_tahunPajak: { pegawaiId: p.id, tahunPajak: 2025 } },
      create: {
        pegawaiId: p.id,
        tahunPajak: 2025,
        nomorBuktiPotong: `1721-A1/${p.nip.slice(-6)}/2025`,
        fileUrl: `https://placeholder.local/bukti-potong-pajak/${p.nip}-2025.pdf`,
        diunggahOlehId: irwan.id,
      },
      update: {},
    });
    console.log(`  -> Bukti potong pajak 2025 untuk ${p.nama}: siap diunduh.`);
  }

  // --------------------------------------------------------------------
  // USULAN PERUBAHAN ROLE - PPABP mengusulkan, ADMIN belum memutuskan
  // --------------------------------------------------------------------
  console.log("\n=== Usulan Perubahan Role ===");
  const kharina = userByNip.get("198810012011012009")!;
  await prisma.usulanPerubahanRole.create({
    data: {
      userId: kharina.id,
      roleSaatIni: "PEGAWAI",
      roleDiusulkan: "KASUBAG_TU",
      alasan: "Diusulkan promosi jadi Kasubag TU untuk unit baru - menunggu keputusan Admin.",
      diusulkanOlehId: irwan.id,
      status: "MENUNGGU",
    },
  });
  console.log(`  -> Usulan role ${kharina.nama}: PEGAWAI -> KASUBAG_TU, status MENUNGGU (diusulkan ${PPABP.nama}).`);

  await prisma.$disconnect();
  console.log("\nSelesai.");
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
