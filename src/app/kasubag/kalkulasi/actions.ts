"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canAjukanKalkulasiTukinMassalUnit, canTelaahKoreksiAjukanUangLemburUnit, type AuthUser } from "../../../auth/permissions";
import { hitungTukin } from "../../../business-logic/tukin";
import { hitungUangMakan } from "../../../business-logic/uangMakan";
import { hitungUangLembur } from "../../../business-logic/uangLembur";
import { validasiTukin, validasiUangMakan, validasiUangLembur } from "../../../validation/validationGate";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../business-logic/tarifTukinPokok";
import {
  TARIF_UANG_MAKAN_PER_HARI,
  TARIF_UANG_LEMBUR_PER_JAM,
  TARIF_UANG_MAKAN_LEMBUR_PER_HARI,
  golonganRomawi,
} from "../../../business-logic/tarifSbm";

const HARI_KERJA_DEFAULT = 21;

export interface KalkulasiMassalFormState {
  error?: string;
  success?: string;
  ringkasan?: { dihitung: number; dilewati: number; detailDilewati: string[] };
}

async function ambilAuthUser(): Promise<AuthUser | null> {
  const akun = await getSessionAccount();
  if (!akun) return null;
  const user = await ambilUserSesi();
  if (!user) return null;
  return { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
}

/**
 * Kalkulasi massal Tukin + Uang Makan unit, langsung dari PresensiHarian +
 * PredikatKinerja yang sudah tersedia di database (BUKAN via job scheduler
 * src/jobs/hitungTukinPeriodeJob.ts, karena job itu iterate
 * siap.getPegawaiAktif() yang cuma mengembalikan 2 pegawai mock, tidak
 * mencakup data Pegawai asli - lihat catatan yang sama di src/db/seedSimulasi.ts).
 * Reuse pure function hitungTukin/hitungUangMakan + validasiTukin/validasiUangMakan
 * yang sama dipakai job scheduler, cuma orchestration-nya beda.
 *
 * Uang Lembur SEKARANG ikut dihitung, memakai `totalJamLembur` dan
 * `jumlahHariMakanLembur` dari rekap presensi yang di-upload (SBM 2026 item
 * 23.1 + 23.2). Kalau jam lemburnya nol, barisnya tidak dibuat. Koreksi
 * manual per pegawai tetap tersedia lewat koreksiUangLemburAction di bawah.
 */
export async function kalkulasiMassalTukinUangMakanAction(
  _state: KalkulasiMassalFormState,
  formData: FormData
): Promise<KalkulasiMassalFormState> {
  try {
    const authUser = await ambilAuthUser();
    if (!authUser) return { error: "Sesi login sudah habis - silakan login ulang." };

    const satuanKerja = String(formData.get("satuanKerja") ?? "");
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    if (!satuanKerja || !periodeBulan || !periodeTahun) {
      return { error: "Satuan kerja dan periode wajib diisi." };
    }
    if (!canAjukanKalkulasiTukinMassalUnit(authUser, satuanKerja)) {
      return { error: "Role kamu tidak berwenang mengajukan kalkulasi massal unit ini." };
    }

    const pegawaiList = await prisma.pegawai.findMany({ where: { satuanKerja } });

    let dihitung = 0;
    const detailDilewati: string[] = [];

    for (const pegawai of pegawaiList) {
      if (!pegawai.kelasJabatan) {
        detailDilewati.push(`${pegawai.nama}: kelas jabatan tidak diketahui.`);
        continue;
      }
      const tukinPokokKelasJabatan = TUKIN_POKOK_PER_KELAS_JABATAN[pegawai.kelasJabatan];
      if (tukinPokokKelasJabatan === undefined) {
        detailDilewati.push(`${pegawai.nama}: tarif tukin pokok kelas jabatan ${pegawai.kelasJabatan} belum dikonfigurasi.`);
        continue;
      }

      const predikat = await prisma.predikatKinerja.findUnique({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
      });
      if (!predikat) {
        detailDilewati.push(`${pegawai.nama}: predikat kinerja periode ini belum diupload.`);
        continue;
      }

      // Dua jalur sumber presensi (lihat model RekapPresensiPeriode di
      // schema.prisma): rekap bulanan hasil upload manual DIUTAMAKAN, kalau
      // tidak ada baru dihitung dari PresensiHarian (jalur sinkronisasi
      // e-Presensi). Selama e-Presensi belum tersambung, praktis yang dipakai
      // adalah rekap manual.
      const rekapManual = await prisma.rekapPresensiPeriode.findUnique({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
      });
      const presensi = rekapManual
        ? []
        : await prisma.presensiHarian.findMany({
            where: { pegawaiId: pegawai.id, tanggal: { gte: new Date(periodeTahun, periodeBulan - 1, 1), lt: new Date(periodeTahun, periodeBulan, 1) } },
          });
      if (!rekapManual && presensi.length === 0) {
        detailDilewati.push(`${pegawai.nama}: data presensi periode ini belum tersedia.`);
        continue;
      }

      const jumlahHariAlpha = rekapManual?.jumlahHariAlpha ?? presensi.filter((p) => p.statusKehadiran === "ALPHA").length;
      const jumlahTidakPresensi =
        rekapManual?.jumlahTidakPresensi ?? presensi.filter((p) => p.statusKehadiran === "TIDAK_PRESENSI").length;
      const totalMenitTerlambat =
        rekapManual?.totalMenitTerlambat ?? presensi.reduce((a, p) => a + p.menitTerlambat, 0);
      const totalMenitPulangCepat =
        rekapManual?.totalMenitPulangCepat ?? presensi.reduce((a, p) => a + p.menitPulangCepat, 0);
      const totalMenitMeninggalkanKantor =
        rekapManual?.totalMenitMeninggalkanKantor ?? presensi.reduce((a, p) => a + p.menitMeninggalkanKantor, 0);
      const jumlahTidakIkutUpacara =
        rekapManual?.jumlahTidakIkutUpacara ?? presensi.filter((p) => p.tidakIkutUpacara).length;
      // Hari per status buat uang makan. Kalau sumbernya PresensiHarian
      // (jalur sinkronisasi), status DIKLAT/DINAS_LUAR dikeluarkan dari
      // hitungan WFO - mereka hadir tapi tidak berhak uang makan.
      const jumlahHariWfo =
        rekapManual?.jumlahHariWfo ??
        presensi.filter((p) => ["HADIR", "WFO", "TERLAMBAT", "TIDAK_PRESENSI"].includes(p.statusKehadiran)).length;
      const jumlahHariWfhWfa =
        rekapManual?.jumlahHariWfhWfa ??
        presensi.filter((p) => ["WFH", "WFA"].includes(p.statusKehadiran)).length;
      const jumlahHariHadir =
        rekapManual?.jumlahHariHadir ??
        presensi.filter((p) => ["HADIR", "TERLAMBAT", "TIDAK_PRESENSI", "WFA"].includes(p.statusKehadiran)).length;
      const jumlahHariKerja = rekapManual?.jumlahHariKerja
        ? Math.max(rekapManual.jumlahHariKerja, 1)
        : Math.max(presensi.length, HARI_KERJA_DEFAULT);

      const rekapKehadiran = {
        pegawaiId: pegawai.nip,
        periodeBulan,
        periodeTahun,
        jumlahHariAlpha,
        jumlahTidakPresensi,
        totalMenitTerlambat,
        totalMenitPulangCepat,
        totalMenitMeninggalkanKantor,
        jumlahTidakIkutUpacara,
        jumlahHariKerja,
        jumlahHariHadir,
        totalJamLembur: 0,
      };

      const hasilTukin = hitungTukin({
        pegawaiId: pegawai.nip,
        periodeBulan,
        periodeTahun,
        tukinPokokKelasJabatan,
        rekapKehadiran,
        capaianKinerja: { pegawaiId: pegawai.nip, periodeBulan, periodeTahun, nilaiCapaianKinerjaPersen: predikat.nilaiAngka },
      });
      const validasiTukinHasil = validasiTukin(hasilTukin);

      await prisma.tukinCalculation.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan,
          periodeTahun,
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

      // Tarif uang makan mengikuti GOLONGAN pegawai (SBM 2026 item 22.1),
      // bukan satu angka untuk semua orang seperti sebelumnya.
      const gol = golonganRomawi(pegawai.golongan);
      if (!gol) {
        detailDilewati.push(
          `${pegawai.nama}: golongan "${pegawai.golongan ?? "(kosong)"}" tidak bisa dibaca, tarif uang makan/lembur SBM tidak bisa ditentukan.`
        );
        continue;
      }
      const tarifUangMakan = TARIF_UANG_MAKAN_PER_HARI[gol];

      const hasilUm = hitungUangMakan({
        pegawaiId: pegawai.nip,
        periodeBulan,
        periodeTahun,
        jumlahHariKerja,
        jumlahHariWfo,
        jumlahHariWfhWfa,
        tarifHarianUangMakan: tarifUangMakan,
      });
      const validasiUmHasil = validasiUangMakan(hasilUm);

      await prisma.uangMakan.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan,
          periodeTahun,
          jumlahHariKerja,
          jumlahHariHadir,
          jumlahHariDibayar: hasilUm.jumlahHariDibayar,
          tarifHarian: tarifUangMakan,
          totalUangMakan: hasilUm.totalUangMakan,
          status: "DRAFT",
          catatanAnomali: validasiUmHasil.anomali.length ? validasiUmHasil.anomali.join("; ") : null,
        },
        update: {
          jumlahHariKerja,
          jumlahHariHadir,
          jumlahHariDibayar: hasilUm.jumlahHariDibayar,
          tarifHarian: tarifUangMakan,
          totalUangMakan: hasilUm.totalUangMakan,
          status: "DRAFT",
          calculatedAt: new Date(),
          approvedAt: null,
          approvedBy: null,
          catatanAnomali: validasiUmHasil.anomali.length ? validasiUmHasil.anomali.join("; ") : null,
        },
      });

      // --- Uang Lembur (SBM 2026 item 23.1 + 23.2) ---
      // Cuma dihitung kalau rekap presensinya memang memuat jam lembur -
      // kalau nol, tidak dibuatkan baris supaya tidak ada baris Rp 0 yang
      // ikut mengantre approval.
      const totalJamLembur = rekapManual?.totalJamLembur ?? 0;
      if (totalJamLembur > 0) {
        const hasilLembur = hitungUangLembur({
          pegawaiId: pegawai.nip,
          periodeBulan,
          periodeTahun,
          totalJamLembur,
          tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM[gol],
          jumlahHariMakanLembur: rekapManual?.jumlahHariMakanLembur ?? 0,
          tarifMakanLemburPerHari: TARIF_UANG_MAKAN_LEMBUR_PER_HARI[gol],
        });
        const validasiLemburHasil = validasiUangLembur(hasilLembur);
        const isiLembur = {
          totalJamLembur: hasilLembur.jamLemburDihitung,
          tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM[gol],
          jumlahHariMakanLembur: hasilLembur.jumlahHariMakanLembur,
          tarifMakanLemburPerHari: TARIF_UANG_MAKAN_LEMBUR_PER_HARI[gol],
          uangLembur: hasilLembur.uangLembur,
          uangMakanLembur: hasilLembur.uangMakanLembur,
          totalUangLembur: hasilLembur.totalUangLembur,
          status: "DRAFT",
          catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
        };
        await prisma.uangLembur.upsert({
          where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
          create: { pegawaiId: pegawai.id, periodeBulan, periodeTahun, ...isiLembur },
          update: { ...isiLembur, calculatedAt: new Date(), approvedAt: null, approvedBy: null },
        });
      }

      dihitung++;
    }

    revalidatePath("/kasubag/kalkulasi");
    return { success: `Kalkulasi Tukin + Uang Makan selesai untuk ${dihitung} pegawai.`, ringkasan: { dihitung, dilewati: detailDilewati.length, detailDilewati } };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

export interface KoreksiLemburFormState {
  error?: string;
  success?: string;
}

/**
 * Koreksi manual jam lembur satu pegawai untuk satu periode ("telaah/koreksi
 * ajuan Uang Lembur unit" di role matrix). TIDAK ada sumber data jam lembur
 * harian tersimpan di sistem manapun yang diintegrasikan (lihat TODO(confirm)
 * di RekapKehadiranPeriode) - jadi ini input manual Kasubag TU, bukan
 * "tarik ulang" dari adapter seperti presensi.
 */
export async function koreksiUangLemburAction(
  _state: KoreksiLemburFormState,
  formData: FormData
): Promise<KoreksiLemburFormState> {
  try {
    const authUser = await ambilAuthUser();
    if (!authUser) return { error: "Sesi login sudah habis - silakan login ulang." };

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    const totalJamLembur = Number(formData.get("totalJamLembur"));
    const tarifPerJam = Number(formData.get("tarifPerJam"));

    if (!pegawaiId || !periodeBulan || !periodeTahun || Number.isNaN(totalJamLembur) || !tarifPerJam) {
      return { error: "Data koreksi tidak lengkap." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };
    if (!canTelaahKoreksiAjukanUangLemburUnit(authUser, pegawai.satuanKerja)) {
      return { error: "Role kamu tidak berwenang mengoreksi Uang Lembur unit ini." };
    }

    const hasilLembur = hitungUangLembur({
      pegawaiId: pegawai.nip,
      periodeBulan,
      periodeTahun,
      totalJamLembur,
      tarifPerJam,
    });
    const validasiLemburHasil = validasiUangLembur(hasilLembur);

    await prisma.uangLembur.upsert({
      where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan, periodeTahun } },
      create: {
        pegawaiId,
        periodeBulan,
        periodeTahun,
        totalJamLembur,
        tarifPerJam,
        totalUangLembur: hasilLembur.totalUangLembur,
        status: "DRAFT",
        catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
      },
      update: {
        totalJamLembur,
        tarifPerJam,
        totalUangLembur: hasilLembur.totalUangLembur,
        status: "DRAFT",
        calculatedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
        catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
      },
    });

    revalidatePath("/kasubag/kalkulasi");
    return { success: `Uang Lembur ${pegawai.nama} dikoreksi jadi ${totalJamLembur} jam.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
