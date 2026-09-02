"use server";

// ============================================================================
// Menandai & membatalkan pengecualian pegawai untuk satu periode.
//
// Lihat src/business-logic/pengecualianPegawai.ts untuk alasan keberadaannya.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { ambilUserSesi } from "../../../auth/getSessionAccount";
import { canAjukanKalkulasiTukinMassalUnit } from "../../../auth/permissions";
import { statusUnit } from "../../../business-logic/pengirimanUnit";
import { alasanDariKode, validasiPengecualian } from "../../../business-logic/pengecualianPegawai";

export interface PengecualianFormState {
  error?: string;
  success?: string;
}

function bacaPeriode(formData: FormData): { bulan: number; tahun: number } | null {
  const bulan = Number(formData.get("periodeBulan"));
  const tahun = Number(formData.get("periodeTahun"));
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return null;
  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return null;
  return { bulan, tahun };
}

/**
 * Pemeriksaan yang sama untuk kedua aksi: sesi, wewenang atas unit pegawai
 * itu, dan kunci pengiriman.
 *
 * Kunci ikut dicek karena pengecualian MENGUBAH siapa yang ikut terhitung -
 * kalau rekapnya sudah dikirim & terkunci, mengubahnya di belakang berarti
 * angka yang dipegang PPABP tidak lagi sama dengan yang dia terima.
 */
async function siapkan(formData: FormData) {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login ulang." as const };

  const periode = bacaPeriode(formData);
  if (!periode) return { error: "Periode tidak sah." as const };

  const pegawaiId = String(formData.get("pegawaiId") ?? "").trim();
  if (!pegawaiId) return { error: "Pegawai tidak disebut." as const };

  const pegawai = await prisma.pegawai.findUnique({
    where: { id: pegawaiId },
    select: { id: true, nama: true, nip: true, satuanKerja: true },
  });
  if (!pegawai) return { error: "Pegawai tidak ditemukan." as const };

  if (!canAjukanKalkulasiTukinMassalUnit(user, pegawai.satuanKerja)) {
    return { error: `${pegawai.nama} ada di ${pegawai.satuanKerja} - di luar kewenangan kamu.` as const };
  }

  const kiriman = await prisma.pengirimanUnit.findUnique({
    where: {
      satuanKerja_periodeBulan_periodeTahun: {
        satuanKerja: pegawai.satuanKerja,
        periodeBulan: periode.bulan,
        periodeTahun: periode.tahun,
      },
    },
  });
  if (statusUnit(kiriman).terkunci) {
    return {
      error:
        "Rekap periode ini sudah dikirim dan terkunci - daftar pegawainya tidak bisa diubah. Minta PPABP mengembalikannya dulu." as const,
    };
  }

  return { user, periode, pegawai };
}

export async function tandaiPengecualianAction(
  _prev: PengecualianFormState,
  formData: FormData
): Promise<PengecualianFormState> {
  const siap = await siapkan(formData);
  if ("error" in siap) return { error: siap.error };
  const { user, periode, pegawai } = siap;

  const alasanKode = String(formData.get("alasanKode") ?? "").trim();
  const penjelasan = String(formData.get("penjelasan") ?? "").trim();

  const cek = validasiPengecualian(alasanKode, penjelasan);
  if (!cek.boleh) return { error: cek.alasan ?? "Alasan tidak sah." };

  const kunci = {
    pegawaiId: pegawai.id,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
  };
  const isi = {
    alasanKode,
    penjelasan: penjelasan === "" ? null : penjelasan,
    ditandaiOlehId: user.id,
  };

  await prisma.$transaction([
    prisma.pengecualianPegawai.upsert({
      where: { pegawaiId_periodeBulan_periodeTahun: kunci },
      create: { ...kunci, ...isi },
      update: isi,
    }),
    // Kalkulasi yang terlanjur ada IKUT DIHAPUS.
    //
    // Menyatakan seseorang tidak seharusnya ada di periode ini, tapi
    // membiarkan angka Tukin-nya berdiri, menghasilkan persis kekacauan yang
    // baru saja diperbaiki: baris yang sumbernya sudah tidak sah tapi tetap
    // ikut ke ADK. Uang makan & lembur ikut karena dasarnya sama - orangnya
    // memang tidak seharusnya dibayar dari unit ini periode itu.
    prisma.tukinCalculation.deleteMany({ where: kunci }),
    prisma.uangMakan.deleteMany({ where: kunci }),
    prisma.uangLembur.deleteMany({ where: kunci }),
    prisma.auditTrail.create({
      data: {
        entitas: "pengecualian_pegawai",
        entitasId: `${pegawai.nip}|${periode.bulan}|${periode.tahun}`,
        aksi: "CREATE",
        aktor: user.nip,
        satuanKerja: pegawai.satuanKerja,
        dataSesudah: {
          nip: pegawai.nip,
          nama: pegawai.nama,
          alasanKode,
          alasanLabel: alasanDariKode(alasanKode)?.label ?? alasanKode,
          penjelasan: penjelasan === "" ? null : penjelasan,
        },
      },
    }),
  ]);

  revalidatePath("/kasubag/kalkulasi");
  revalidatePath("/kasubag");
  return { success: `${pegawai.nama} dikecualikan dari periode ${periode.bulan}/${periode.tahun}.` };
}

export async function batalkanPengecualianAction(
  _prev: PengecualianFormState,
  formData: FormData
): Promise<PengecualianFormState> {
  const siap = await siapkan(formData);
  if ("error" in siap) return { error: siap.error };
  const { user, periode, pegawai } = siap;

  const kunci = {
    pegawaiId: pegawai.id,
    periodeBulan: periode.bulan,
    periodeTahun: periode.tahun,
  };

  const hasil = await prisma.pengecualianPegawai.deleteMany({ where: kunci });
  if (hasil.count === 0) {
    return { error: `${pegawai.nama} memang tidak sedang dikecualikan pada periode ini.` };
  }

  await prisma.auditTrail.create({
    data: {
      entitas: "pengecualian_pegawai",
      entitasId: `${pegawai.nip}|${periode.bulan}|${periode.tahun}`,
      aksi: "DELETE",
      aktor: user.nip,
      satuanKerja: pegawai.satuanKerja,
      dataSebelum: { nip: pegawai.nip, nama: pegawai.nama },
    },
  });

  revalidatePath("/kasubag/kalkulasi");
  revalidatePath("/kasubag");
  return {
    success: `${pegawai.nama} dikembalikan ke daftar hitung. Jalankan kalkulasi lagi supaya angkanya ada.`,
  };
}
