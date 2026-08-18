"use server";

import { revalidatePath } from "next/cache";
import { read, utils } from "xlsx";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canUploadRekapPresensi, type AuthUser } from "../../../auth/permissions";
import { parseRekapPresensi } from "../../../business-logic/rekapPresensi";

/**
 * Upload rekap presensi bulanan (komponen 30% Tukin). Sama seperti upload
 * gaji induk & predikat kinerja: FILE-NYA TIDAK DISIMPAN, cuma dibaca di
 * memori. Otorisasi dicek PER BARIS terhadap satuan kerja pegawainya.
 */

const MAKS_UKURAN_FILE = 8 * 1024 * 1024;
const UKURAN_BATCH = 50;

export interface UploadPresensiFormState {
  error?: string;
  success?: string;
  ringkasan?: {
    periodeBulan: number;
    periodeTahun: number;
    jumlahTersimpan: number;
    perSatuanKerja: { satuanKerja: string; jumlah: number }[];
  };
  dilewati?: { alasan: string; jumlah: number; contohNip: string[] }[];
  perluHitungUlang?: number;
}

function kelompokkanAlasan(items: { nip: string | null; alasan: string }[]) {
  const urutan: string[] = [];
  const peta = new Map<string, string[]>();
  for (const item of items) {
    if (!peta.has(item.alasan)) {
      peta.set(item.alasan, []);
      urutan.push(item.alasan);
    }
    if (item.nip) peta.get(item.alasan)!.push(item.nip);
  }
  return urutan.map((alasan) => ({
    alasan,
    jumlah: items.filter((i) => i.alasan === alasan).length,
    contohNip: peta.get(alasan)!.slice(0, 3),
  }));
}

export async function uploadRekapPresensiAction(
  _state: UploadPresensiFormState,
  formData: FormData
): Promise<UploadPresensiFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    if (!Number.isInteger(periodeBulan) || periodeBulan < 1 || periodeBulan > 12) {
      return { error: "Bulan periode wajib diisi (1-12)." };
    }
    if (!Number.isInteger(periodeTahun) || periodeTahun < 2000) {
      return { error: "Tahun periode wajib diisi." };
    }

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Pilih file rekap presensi (.xlsx/.xls/.csv) dulu." };
    }
    if (file.size > MAKS_UKURAN_FILE) {
      return { error: `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 8 MB.` };
    }

    let matriks: unknown[][];
    try {
      const wb = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return { error: "File tidak punya sheet yang bisa dibaca." };
      matriks = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
    } catch {
      return { error: "File tidak bisa dibaca sebagai Excel. Pastikan formatnya .xlsx, .xls, atau .csv." };
    }

    const hasil = parseRekapPresensi(matriks);
    if (hasil.error) return { error: hasil.error };
    if (hasil.baris.length === 0) {
      return { error: "Tidak ada baris presensi yang bisa diproses.", dilewati: kelompokkanAlasan(hasil.dilewati) };
    }

    const nipUnik = [...new Set(hasil.baris.map((b) => b.nip))];
    const pegawaiList = await prisma.pegawai.findMany({
      where: { nip: { in: nipUnik } },
      select: { id: true, nip: true, satuanKerja: true },
    });
    const petaPegawai = new Map(pegawaiList.map((p) => [p.nip, p]));

    const dilewati: { nip: string | null; alasan: string }[] = hasil.dilewati.map((d) => ({
      nip: d.nip,
      alasan: d.alasan,
    }));
    const siapSimpan: { pegawaiId: string; satuanKerja: string; data: (typeof hasil.baris)[number] }[] = [];

    for (const baris of hasil.baris) {
      const pegawai = petaPegawai.get(baris.nip);
      if (!pegawai) {
        dilewati.push({ nip: baris.nip, alasan: "NIP tidak ditemukan di data Pegawai Gajihub" });
        continue;
      }
      // Guard per baris - sama alasannya dengan upload predikat kinerja:
      // satu file bisa memuat pegawai lintas unit.
      if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja)) {
        dilewati.push({ nip: baris.nip, alasan: `di luar kewenangan kamu (pegawai ${pegawai.satuanKerja})` });
        continue;
      }
      if (baris.jumlahHariHadir > baris.jumlahHariKerja && baris.jumlahHariKerja > 0) {
        dilewati.push({
          nip: baris.nip,
          alasan: `hari hadir (${baris.jumlahHariHadir}) melebihi hari kerja (${baris.jumlahHariKerja})`,
        });
        continue;
      }
      siapSimpan.push({ pegawaiId: pegawai.id, satuanKerja: pegawai.satuanKerja, data: baris });
    }

    if (siapSimpan.length === 0) {
      return {
        error: "Tidak ada baris yang bisa disimpan - semua dilewati, lihat alasannya di bawah.",
        dilewati: kelompokkanAlasan(dilewati),
      };
    }

    const operasi = siapSimpan.map(({ pegawaiId, data }) => {
      const isi = {
        jumlahHariAlpha: Math.round(data.jumlahHariAlpha),
        jumlahTidakPresensi: Math.round(data.jumlahTidakPresensi),
        totalMenitTerlambat: Math.round(data.totalMenitTerlambat),
        totalMenitPulangCepat: Math.round(data.totalMenitPulangCepat),
        totalMenitMeninggalkanKantor: Math.round(data.totalMenitMeninggalkanKantor),
        jumlahTidakIkutUpacara: Math.round(data.jumlahTidakIkutUpacara),
        jumlahHariKerja: Math.round(data.jumlahHariKerja),
        jumlahHariHadir: Math.round(data.jumlahHariHadir),
        jumlahHariWfo: Math.round(data.jumlahHariWfo),
        jumlahHariWfhWfa: Math.round(data.jumlahHariWfhWfa),
        jumlahHariDiklat: Math.round(data.jumlahHariDiklat),
        jumlahHariDinasLuar: Math.round(data.jumlahHariDinasLuar),
        jumlahHariTugasBelajar: Math.round(data.jumlahHariTugasBelajar),
        jenisCutiAktif: data.jenisCutiAktif,
        bulanCutiKeberapa: data.bulanCutiKeberapa,
        jumlahHariCuti: Math.round(data.jumlahHariCuti),
        totalJamLembur: data.totalJamLembur,
        totalJamLemburHariLibur: data.totalJamLemburHariLibur,
        jumlahHariMakanLembur: Math.round(data.jumlahHariMakanLembur),
        jumlahHariMakanLemburHariLibur: Math.round(data.jumlahHariMakanLemburHariLibur),
        sourceSystem: "UPLOAD_MANUAL",
        sourceFileName: file.name,
        diunggahOlehId: user.id,
      };
      return prisma.rekapPresensiPeriode.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan, periodeTahun } },
        create: { pegawaiId, periodeBulan, periodeTahun, ...isi },
        update: { ...isi, diunggahPada: new Date() },
      });
    });
    for (let i = 0; i < operasi.length; i += UKURAN_BATCH) {
      await prisma.$transaction(operasi.slice(i, i + UKURAN_BATCH));
    }

    const perluHitungUlang = await prisma.tukinCalculation.count({
      where: { periodeBulan, periodeTahun, pegawaiId: { in: siapSimpan.map((s) => s.pegawaiId) } },
    });

    const perSatker = new Map<string, number>();
    for (const s of siapSimpan) perSatker.set(s.satuanKerja, (perSatker.get(s.satuanKerja) ?? 0) + 1);

    await prisma.auditTrail.create({
      data: {
        entitas: "rekap_presensi_periode",
        entitasId: `${periodeBulan}/${periodeTahun}`,
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          namaFile: file.name,
          periode: `${periodeBulan}/${periodeTahun}`,
          jumlahBarisTersimpan: siapSimpan.length,
          jumlahBarisDilewati: dilewati.length,
          sumber: "Upload manual rekap presensi",
        },
      },
    });

    revalidatePath("/tukin/presensi");
    revalidatePath("/tukin");
    return {
      success: `${siapSimpan.length} rekap presensi tersimpan dari "${file.name}".`,
      ringkasan: {
        periodeBulan,
        periodeTahun,
        jumlahTersimpan: siapSimpan.length,
        perSatuanKerja: [...perSatker.entries()]
          .map(([satuanKerja, jumlah]) => ({ satuanKerja, jumlah }))
          .sort((a, b) => b.jumlah - a.jumlah),
      },
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
      perluHitungUlang: perluHitungUlang > 0 ? perluHitungUlang : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
