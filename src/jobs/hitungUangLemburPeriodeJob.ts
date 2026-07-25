// ============================================================================
// JOB SCHEDULER - hitung uang lembur satu periode untuk seluruh pegawai aktif
// Pola sama persis dengan hitungTukinPeriodeJob.ts.
//
// TODO(confirm): tarifPerJam & batasMaksimalJamLembur mengikuti Standar
// Biaya Masukan (SBM) PMK yang terbit tahunan - BELUM ada angka resmi di
// project knowledge (lihat CLAUDE.md item open #8). Config di bawah WAJIB
// diisi dari sumber resmi (Biro Keuangan/DJA) sebelum dipakai ke data
// production - jangan hardcode.
//
// totalJamLembur diambil dari PresensiAdapter yang sama dengan Tukin.
// TODO(confirm): asumsi bahwa e-Presensi adalah sumber data jam lembur
// belum dikonfirmasi ke pihak terkait (lihat catatan di src/types/index.ts) -
// bisa jadi datanya sebenarnya dari sistem/mekanisme lembur terpisah yang
// belum ada adapternya di project ini.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import type { DataSourceBundle } from "../adapters/DataSourceAdapter";
import { hitungUangLembur } from "../business-logic/uangLembur";
import { validasiUangLembur } from "../validation/validationGate";
import type { ValidationResult } from "../validation/types";

export type UangLemburJobPrisma = Pick<
  PrismaClient,
  "pegawai" | "uangLembur" | "auditTrail"
>;

export interface UangLemburJobConfig {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja?: string;
  /** TODO(confirm): dari SBM PMK tahun anggaran berjalan - belum ada angka resmi. */
  tarifPerJam: number;
  batasMaksimalJamLembur?: number;
}

export type UangLemburJobItemStatus = "DIHITUNG" | "DILEWATI";

export interface UangLemburJobItemResult {
  nip: string;
  status: UangLemburJobItemStatus;
  alasanDilewati?: string;
  validasi?: ValidationResult;
}

export interface UangLemburJobSummary {
  periodeBulan: number;
  periodeTahun: number;
  totalPegawai: number;
  dihitung: number;
  dilewati: number;
  items: UangLemburJobItemResult[];
}

export async function jalankanUangLemburPeriodeJob(
  prisma: UangLemburJobPrisma,
  sumberData: DataSourceBundle,
  config: UangLemburJobConfig
): Promise<UangLemburJobSummary> {
  const pegawaiList = await sumberData.siap.getPegawaiAktif(
    config.satuanKerja
  );

  const items: UangLemburJobItemResult[] = [];

  for (const pegawai of pegawaiList) {
    const rekapKehadiran = await sumberData.presensi.getRekapKehadiranPeriode(
      pegawai.nip,
      config.periodeBulan,
      config.periodeTahun
    );

    const hasilKalkulasi = hitungUangLembur({
      pegawaiId: pegawai.nip,
      periodeBulan: config.periodeBulan,
      periodeTahun: config.periodeTahun,
      totalJamLembur: rekapKehadiran.totalJamLembur,
      tarifPerJam: config.tarifPerJam,
      batasMaksimalJamLembur: config.batasMaksimalJamLembur,
    });

    const validasi = validasiUangLembur(hasilKalkulasi);

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

    const calcRow = await prisma.uangLembur.upsert({
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
        totalJamLembur: hasilKalkulasi.jamLemburDihitung,
        tarifPerJam: config.tarifPerJam,
        totalUangLembur: hasilKalkulasi.totalUangLembur,
        status: "DRAFT",
        catatanAnomali: validasi.anomali.length
          ? validasi.anomali.join("; ")
          : null,
      },
      update: {
        totalJamLembur: hasilKalkulasi.jamLemburDihitung,
        tarifPerJam: config.tarifPerJam,
        totalUangLembur: hasilKalkulasi.totalUangLembur,
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
        entitas: "uang_lembur",
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
