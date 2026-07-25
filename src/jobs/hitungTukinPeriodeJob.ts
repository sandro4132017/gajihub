// ============================================================================
// JOB SCHEDULER - hitung tukin satu periode untuk seluruh pegawai aktif
//
// Orchestrate: SiapAdapter (identitas & kelas jabatan) + PresensiAdapter
// (rekap kehadiran) + EKinerjaAdapter (capaian kinerja) -> business logic
// engine (hitungTukin) -> validation gate (validasiTukin) -> simpan ke
// Prisma dengan status DRAFT (bukan APPROVED - approval digital adalah
// modul terpisah, roadmap langkah 3).
//
// CATATAN CAKUPAN: job ini BARU mencakup Tukin. Uang Makan & Uang Lembur
// belum diorchestrate di sini karena PresensiAdapter saat ini tidak
// menyediakan jumlahHariKerja/jumlahHariHadir/totalJamLembur - datanya
// belum ada sumbernya di adapter manapun. Jangan menambah field itu ke
// PresensiAdapter dengan menebak-nebak; tunggu kejelasan sumber data
// (kemungkinan adapter terpisah untuk sistem lembur) sebelum dikerjakan.
//
// Job ini punya I/O (Prisma, adapter) dengan sengaja - business logic engine
// & validation gate di baliknya tetap pure function, I/O-nya cuma di layer
// orchestration ini (lihat konvensi di CLAUDE.md).
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import type { DataSourceBundle } from "../adapters/DataSourceAdapter";
import { hitungTukin } from "../business-logic/tukin";
import { validasiTukin } from "../validation/validationGate";
import type { ValidationResult } from "../validation/types";

/** Subset PrismaClient yang benar-benar dipakai job ini - supaya gampang di-mock saat testing. */
export type TukinJobPrisma = Pick<
  PrismaClient,
  "pegawai" | "tukinCalculation" | "auditTrail"
>;

export interface TukinJobConfig {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja?: string;
  /**
   * Nilai tukin pokok per kelas jabatan. Sudah ada tabel resminya di
   * src/business-logic/tarifTukinPokok.ts (TUKIN_POKOK_PER_KELAS_JABATAN,
   * sumber Lampiran Permenaker 15/2024) - pakai itu, jangan hardcode ulang
   * di composition root.
   */
  tukinPokokPerKelasJabatan: Record<number, number>;
  tarifPphEfektif?: number;
}

export type TukinJobItemStatus = "DIHITUNG" | "DILEWATI";

export interface TukinJobItemResult {
  nip: string;
  status: TukinJobItemStatus;
  alasanDilewati?: string;
  validasi?: ValidationResult;
}

export interface TukinJobSummary {
  periodeBulan: number;
  periodeTahun: number;
  totalPegawai: number;
  dihitung: number;
  dilewati: number;
  items: TukinJobItemResult[];
}

export async function jalankanTukinPeriodeJob(
  prisma: TukinJobPrisma,
  sumberData: DataSourceBundle,
  config: TukinJobConfig
): Promise<TukinJobSummary> {
  const pegawaiList = await sumberData.siap.getPegawaiAktif(
    config.satuanKerja
  );

  const items: TukinJobItemResult[] = [];

  for (const pegawai of pegawaiList) {
    const lewati = (alasan: string): TukinJobItemResult => ({
      nip: pegawai.nip,
      status: "DILEWATI",
      alasanDilewati: alasan,
    });

    if (!pegawai.kelasJabatan) {
      items.push(lewati("kelasJabatan tidak diketahui dari data SIAP."));
      continue;
    }

    const tukinPokokKelasJabatan =
      config.tukinPokokPerKelasJabatan[pegawai.kelasJabatan];
    if (tukinPokokKelasJabatan === undefined) {
      items.push(
        lewati(
          `Tarif tukin pokok untuk kelas jabatan ${pegawai.kelasJabatan} belum dikonfigurasi.`
        )
      );
      continue;
    }

    const capaianKinerja = await sumberData.eKinerja.getCapaianKinerjaPeriode(
      pegawai.nip,
      config.periodeBulan,
      config.periodeTahun
    );
    if (!capaianKinerja) {
      items.push(
        lewati(
          "Capaian kinerja belum tersedia (rekap predikat dari e-Kinerja BKN belum diupload untuk periode ini)."
        )
      );
      continue;
    }

    const rekapKehadiran = await sumberData.presensi.getRekapKehadiranPeriode(
      pegawai.nip,
      config.periodeBulan,
      config.periodeTahun
    );

    const hasilKalkulasi = hitungTukin({
      pegawaiId: pegawai.nip,
      periodeBulan: config.periodeBulan,
      periodeTahun: config.periodeTahun,
      tukinPokokKelasJabatan,
      rekapKehadiran,
      capaianKinerja,
      tarifPphEfektif: config.tarifPphEfektif,
    });

    const validasi = validasiTukin(hasilKalkulasi);

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

    const calcRow = await prisma.tukinCalculation.upsert({
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
        komponenKehadiran: hasilKalkulasi.komponenKehadiranSetelahPotongan,
        komponenKinerja: hasilKalkulasi.komponenKinerja,
        tukinPokok: hasilKalkulasi.tukinPokok,
        potonganPph: hasilKalkulasi.potonganPph,
        tukinBersih: hasilKalkulasi.tukinBersih,
        status: "DRAFT",
        catatanAnomali: validasi.anomali.length
          ? validasi.anomali.join("; ")
          : null,
      },
      update: {
        komponenKehadiran: hasilKalkulasi.komponenKehadiranSetelahPotongan,
        komponenKinerja: hasilKalkulasi.komponenKinerja,
        tukinPokok: hasilKalkulasi.tukinPokok,
        potonganPph: hasilKalkulasi.potonganPph,
        tukinBersih: hasilKalkulasi.tukinBersih,
        status: "DRAFT",
        // Recalculation harus refresh calculatedAt - modul approval memakai
        // timestamp ini sebagai batas siklus approval (lihat src/approval/).
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
        entitas: "tukin_calculation",
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
