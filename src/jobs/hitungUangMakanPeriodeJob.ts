// ============================================================================
// JOB SCHEDULER - hitung uang makan satu periode untuk seluruh pegawai aktif
// Pola sama persis dengan hitungTukinPeriodeJob.ts.
//
// TODO(confirm): tarifHarianUangMakan mengikuti Standar Biaya Masukan (SBM)
// PMK yang terbit tahunan - BELUM ada angka resmi di project knowledge (lihat
// CLAUDE.md item open #8). Config di bawah WAJIB diisi dari sumber resmi
// (Biro Keuangan/DJA) sebelum dipakai ke data production - jangan hardcode.
//
// jumlahHariKerja/jumlahHariHadir diambil dari PresensiAdapter yang sama
// dengan Tukin. TODO(confirm): asumsi bahwa e-Presensi adalah sumber data ini
// belum dikonfirmasi ke pihak terkait (lihat catatan di src/types/index.ts).
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import type { DataSourceBundle } from "../adapters/DataSourceAdapter";
import { hitungUangMakan } from "../business-logic/uangMakan";
import { validasiUangMakan } from "../validation/validationGate";
import type { ValidationResult } from "../validation/types";

export type UangMakanJobPrisma = Pick<
  PrismaClient,
  "pegawai" | "uangMakan" | "auditTrail"
>;

export interface UangMakanJobConfig {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja?: string;
  /** TODO(confirm): dari SBM PMK tahun anggaran berjalan - belum ada angka resmi. */
  tarifHarianUangMakan: number;
}

export type UangMakanJobItemStatus = "DIHITUNG" | "DILEWATI";

export interface UangMakanJobItemResult {
  nip: string;
  status: UangMakanJobItemStatus;
  alasanDilewati?: string;
  validasi?: ValidationResult;
}

export interface UangMakanJobSummary {
  periodeBulan: number;
  periodeTahun: number;
  totalPegawai: number;
  dihitung: number;
  dilewati: number;
  items: UangMakanJobItemResult[];
}

export async function jalankanUangMakanPeriodeJob(
  prisma: UangMakanJobPrisma,
  sumberData: DataSourceBundle,
  config: UangMakanJobConfig
): Promise<UangMakanJobSummary> {
  const pegawaiList = await sumberData.siap.getPegawaiAktif(
    config.satuanKerja
  );

  const items: UangMakanJobItemResult[] = [];

  for (const pegawai of pegawaiList) {
    const rekapKehadiran = await sumberData.presensi.getRekapKehadiranPeriode(
      pegawai.nip,
      config.periodeBulan,
      config.periodeTahun
    );

    const hasilKalkulasi = hitungUangMakan({
      pegawaiId: pegawai.nip,
      periodeBulan: config.periodeBulan,
      periodeTahun: config.periodeTahun,
      jumlahHariKerja: rekapKehadiran.jumlahHariKerja,
      jumlahHariHadir: rekapKehadiran.jumlahHariHadir,
      tarifHarianUangMakan: config.tarifHarianUangMakan,
    });

    const validasi = validasiUangMakan(hasilKalkulasi);

    const pegawaiRow = await prisma.pegawai.upsert({
      where: { nip: pegawai.nip },
      create: {
        nip: pegawai.nip,
        nama: pegawai.nama,
        unitKerja: pegawai.unitKerja,
        satuanKerja: pegawai.satuanKerja,
        statusPegawai: pegawai.statusPegawai,
        jabatan: pegawai.jabatan,
        golongan: pegawai.golongan,
        sourceSystem: "SIAP",
        sourceSyncedAt: new Date(),
      },
      update: {
        nama: pegawai.nama,
        unitKerja: pegawai.unitKerja,
        satuanKerja: pegawai.satuanKerja,
        statusPegawai: pegawai.statusPegawai,
        jabatan: pegawai.jabatan,
        golongan: pegawai.golongan,
        sourceSyncedAt: new Date(),
      },
    });

    const calcRow = await prisma.uangMakan.upsert({
      where: {
        pegawaiId_periodeBulan_periodeTahun: {
          pegawaiId: pegawaiRow.id,
          periodeBulan: config.periodeBulan,
          periodeTahun: config.periodeTahun,
        },
      },
      create: {
        pegawaiId: pegawaiRow.id,
        periodeBulan: config.periodeBulan,
        periodeTahun: config.periodeTahun,
        jumlahHariKerja: rekapKehadiran.jumlahHariKerja,
        jumlahHariHadir: rekapKehadiran.jumlahHariHadir,
        tarifHarian: config.tarifHarianUangMakan,
        totalUangMakan: hasilKalkulasi.totalUangMakan,
        status: "DRAFT",
        catatanAnomali: validasi.anomali.length
          ? validasi.anomali.join("; ")
          : null,
      },
      update: {
        jumlahHariKerja: rekapKehadiran.jumlahHariKerja,
        jumlahHariHadir: rekapKehadiran.jumlahHariHadir,
        tarifHarian: config.tarifHarianUangMakan,
        totalUangMakan: hasilKalkulasi.totalUangMakan,
        status: "DRAFT",
        calculatedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
        catatanAnomali: validasi.anomali.length
          ? validasi.anomali.join("; ")
          : null,
      },
    });

    await prisma.auditTrail.create({
      data: {
        entitas: "uang_makan",
        entitasId: calcRow.id,
        aksi: "SYNC",
        aktor: "SYSTEM",
        dataSesudah: JSON.parse(JSON.stringify(hasilKalkulasi)),
      },
    });

    items.push({ nip: pegawai.nip, status: "DIHITUNG", validasi });
  }

  return {
    periodeBulan: config.periodeBulan,
    periodeTahun: config.periodeTahun,
    totalPegawai: pegawaiList.length,
    dihitung: items.filter((i) => i.status === "DIHITUNG").length,
    dilewati: items.filter((i) => i.status === "DILEWATI").length,
    items,
  };
}
