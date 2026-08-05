"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { ambilUserSesi } from "../../../auth/getSessionAccount";
import { canUploadRekapPredikatKinerja, type AuthUser } from "../../../auth/permissions";
import {
  konversiPredikatKeNilaiPersen,
  type PredikatKinerja,
} from "../../../business-logic/konversiPredikat";

/**
 * KELOLA PREDIKAT KINERJA SATUAN (tambah / ubah / hapus)
 *
 * Melengkapi upload massal di actions.ts. Jalur ini dipakai buat perbaikan
 * per orang: pegawai yang terlewat di file rekap, salah predikat, atau baris
 * yang memang harus dicabut.
 *
 * ---------------------------------------------------------------------------
 * KENAPA INI TIDAK MELANGGAR "tidak ada edit langsung"
 * ---------------------------------------------------------------------------
 * `canEditPresensiKinerjaLangsung` tetap `false` dan tidak dipakai di sini.
 * Izin yang dipakai adalah `canUploadRekapPredikatKinerja`, yang komposisinya
 * mencakup `canUploadKoreksiPredikatKinerjaUnit` - fungsi yang sejak awal
 * memang didefinisikan sebagai "upload predikat kinerja + KOREKSI LANGSUNG di
 * Gajihub kalau ada yang salah", dan disebut eksplisit di komentar
 * canEditPresensiKinerjaLangsung sebagai salah satu jalur koreksi yang SAH.
 * Yang dilarang itu edit BEBAS tanpa scope & tanpa jejak, bukan koreksi
 * ber-scope unit yang tercatat.
 *
 * Tiga pengaman yang membuatnya tetap bisa dipertanggungjawabkan:
 *   1. Otorisasi dicek terhadap `Pegawai.satuanKerja` milik baris yang
 *      disentuh - Kasubag TU tidak bisa mengubah predikat unit lain, termasuk
 *      dengan menebak id lewat form yang dimodifikasi.
 *   2. `nilaiAngka` TIDAK PERNAH diterima dari form - selalu diturunkan ulang
 *      dari predikatnya lewat konversiPredikatKeNilaiPersen (Kepsekjen
 *      82/2025). Kalau tidak, orang bisa mengirim predikat "Kurang" dengan
 *      nilai 100% dan tukinnya ikut salah.
 *   3. Tiap perubahan menulis AuditTrail lengkap dengan nilai SEBELUM dan
 *      SESUDAH, dan barisnya ditandai sebagai input manual - jadi angka hasil
 *      ketikan manusia tidak bisa menyamar sebagai angka resmi dari BKN.
 *
 * TIDAK ada kalkulasi Tukin yang dihitung ulang otomatis di sini - itu
 * mereset siklus approval ke DRAFT (lihat catatan kalkulasi massal di
 * CLAUDE.md), jadi keputusannya tetap di tangan user. Yang dilakukan action
 * ini cuma MEMBERI TAHU kalau ada kalkulasi yang jadi basi.
 */

/** Sumber & metode yang dicatat buat baris hasil ketikan manusia. */
const SUMBER_MANUAL = "Input manual Gajihub";
const METODE_TAMBAH = "MANUAL_ENTRY";
const METODE_UBAH = "MANUAL_EDIT";

const PREDIKAT_VALID: PredikatKinerja[] = [
  "SANGAT_BAIK",
  "BAIK",
  "PERLU_PERBAIKAN",
  "KURANG",
  "SANGAT_KURANG",
];

export interface KelolaPredikatFormState {
  error?: string;
  success?: string;
  /** Diisi kalau kalkulasi Tukin periode itu sudah ada dan jadi basi. */
  peringatanHitungUlang?: string;
}

function bacaPredikat(formData: FormData): PredikatKinerja | null {
  const nilai = String(formData.get("predikat") ?? "").trim();
  return (PREDIKAT_VALID as string[]).includes(nilai) ? (nilai as PredikatKinerja) : null;
}

function bacaPeriode(formData: FormData): { bulan: number; tahun: number } | null {
  const bulan = Number(formData.get("periodeBulan"));
  const tahun = Number(formData.get("periodeTahun"));
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) return null;
  if (!Number.isInteger(tahun) || tahun < 2000 || tahun > 2100) return null;
  return { bulan, tahun };
}

/** Baris `User` sesi yang sudah dipastikan tidak null. */
type UserSesi = NonNullable<Awaited<ReturnType<typeof ambilUserSesi>>>;

/** Sesi + AuthUser dalam satu langkah. Pakai role AKTIF, bukan role utama. */
async function ambilAktor(): Promise<{ user: UserSesi; authUser: AuthUser } | { error: string }> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  return {
    user,
    authUser: { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif },
  };
}

/**
 * Apakah ada kalkulasi Tukin periode itu yang jadi basi karena predikatnya
 * baru berubah? Cuma dilaporkan, tidak dihitung ulang.
 */
async function cekKalkulasiBasi(
  pegawaiId: string,
  nama: string,
  bulan: number,
  tahun: number
): Promise<string | undefined> {
  const ada = await prisma.tukinCalculation.findFirst({
    where: { pegawaiId, periodeBulan: bulan, periodeTahun: tahun },
    select: { status: true },
  });
  if (!ada) return undefined;
  return (
    `Kalkulasi Tukin ${nama} periode ${bulan}/${tahun} sudah ada (status ${ada.status}) dan ` +
    `sekarang memakai nilai kinerja yang lama - hitung ulang lewat Kalkulasi Unit supaya angkanya ikut berubah.`
  );
}

// ---------------------------------------------------------------------------
// TAMBAH
// ---------------------------------------------------------------------------
export async function tambahPredikatAction(
  _state: KelolaPredikatFormState,
  formData: FormData
): Promise<KelolaPredikatFormState> {
  try {
    const aktor = await ambilAktor();
    if ("error" in aktor) return { error: aktor.error };
    const { user, authUser } = aktor;

    const pegawaiId = String(formData.get("pegawaiId") ?? "").trim();
    if (!pegawaiId) return { error: "Pilih pegawainya dulu." };

    const predikat = bacaPredikat(formData);
    if (!predikat) return { error: "Predikat tidak dikenali - pilih dari daftar yang tersedia." };

    const periode = bacaPeriode(formData);
    if (!periode) return { error: "Bulan/tahun periode tidak valid." };

    const pegawai = await prisma.pegawai.findUnique({
      where: { id: pegawaiId },
      select: { id: true, nip: true, nama: true, satuanKerja: true },
    });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };

    if (!canUploadRekapPredikatKinerja(authUser, pegawai.satuanKerja)) {
      return { error: `${pegawai.nama} ada di ${pegawai.satuanKerja} - di luar kewenangan kamu.` };
    }

    const sudahAda = await prisma.predikatKinerja.findUnique({
      where: {
        pegawaiId_periodeBulan_periodeTahun: {
          pegawaiId: pegawai.id,
          periodeBulan: periode.bulan,
          periodeTahun: periode.tahun,
        },
      },
      select: { id: true },
    });
    if (sudahAda) {
      return {
        error: `${pegawai.nama} sudah punya predikat untuk periode ${periode.bulan}/${periode.tahun} - pakai tombol Ubah di barisnya, jangan tambah baru.`,
      };
    }

    // nilaiAngka SELALU diturunkan dari predikat, tidak pernah dari form.
    const nilaiAngka = konversiPredikatKeNilaiPersen(predikat);
    const sekarang = new Date();

    const baru = await prisma.predikatKinerja.create({
      data: {
        pegawaiId: pegawai.id,
        periodeBulan: periode.bulan,
        periodeTahun: periode.tahun,
        predikat,
        nilaiAngka,
        sourceSystem: SUMBER_MANUAL,
        sourceSyncedAt: sekarang,
        inputMethod: METODE_TAMBAH,
      },
    });

    await prisma.auditTrail.create({
      data: {
        entitas: "predikat_kinerja",
        entitasId: baru.id,
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          nip: pegawai.nip,
          nama: pegawai.nama,
          satuanKerja: pegawai.satuanKerja,
          periode: `${periode.bulan}/${periode.tahun}`,
          predikat,
          nilaiAngka,
          sumber: `${SUMBER_MANUAL} (tambah satuan)`,
          alasan: String(formData.get("alasan") ?? "").trim() || null,
        },
      },
    });

    revalidatePath("/tukin/predikat-kinerja");
    return {
      success: `Predikat ${pegawai.nama} periode ${periode.bulan}/${periode.tahun} ditambahkan (${nilaiAngka}%).`,
      peringatanHitungUlang: await cekKalkulasiBasi(pegawai.id, pegawai.nama, periode.bulan, periode.tahun),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

// ---------------------------------------------------------------------------
// UBAH
// ---------------------------------------------------------------------------
export async function ubahPredikatAction(
  _state: KelolaPredikatFormState,
  formData: FormData
): Promise<KelolaPredikatFormState> {
  try {
    const aktor = await ambilAktor();
    if ("error" in aktor) return { error: aktor.error };
    const { user, authUser } = aktor;

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { error: "Baris yang mau diubah tidak dikenali." };

    const predikat = bacaPredikat(formData);
    if (!predikat) return { error: "Predikat tidak dikenali - pilih dari daftar yang tersedia." };

    const lama = await prisma.predikatKinerja.findUnique({
      where: { id },
      include: { pegawai: { select: { id: true, nip: true, nama: true, satuanKerja: true } } },
    });
    if (!lama) return { error: "Baris predikat tidak ditemukan - mungkin sudah dihapus orang lain." };

    // Otorisasi terhadap satuan kerja pegawai di baris ini, bukan terhadap
    // filter yang sedang dibuka - id bisa saja dikirim dari form yang diubah.
    if (!canUploadRekapPredikatKinerja(authUser, lama.pegawai.satuanKerja)) {
      return { error: `${lama.pegawai.nama} ada di ${lama.pegawai.satuanKerja} - di luar kewenangan kamu.` };
    }

    if (lama.predikat === predikat) {
      return { error: "Predikatnya sama dengan yang sekarang - tidak ada yang diubah." };
    }

    const nilaiAngka = konversiPredikatKeNilaiPersen(predikat);

    await prisma.predikatKinerja.update({
      where: { id },
      data: {
        predikat,
        nilaiAngka,
        sourceSystem: SUMBER_MANUAL,
        sourceSyncedAt: new Date(),
        inputMethod: METODE_UBAH,
      },
    });

    await prisma.auditTrail.create({
      data: {
        entitas: "predikat_kinerja",
        entitasId: id,
        aksi: "UPDATE",
        aktor: user.nip,
        dataSebelum: {
          predikat: lama.predikat,
          nilaiAngka: lama.nilaiAngka,
          sourceSystem: lama.sourceSystem,
          inputMethod: lama.inputMethod,
        },
        dataSesudah: {
          nip: lama.pegawai.nip,
          nama: lama.pegawai.nama,
          satuanKerja: lama.pegawai.satuanKerja,
          periode: `${lama.periodeBulan}/${lama.periodeTahun}`,
          predikat,
          nilaiAngka,
          sumber: `${SUMBER_MANUAL} (koreksi)`,
          alasan: String(formData.get("alasan") ?? "").trim() || null,
        },
      },
    });

    revalidatePath("/tukin/predikat-kinerja");
    return {
      success: `Predikat ${lama.pegawai.nama} diubah jadi ${predikat.replace(/_/g, " ").toLowerCase()} (${nilaiAngka}%).`,
      peringatanHitungUlang: await cekKalkulasiBasi(
        lama.pegawai.id,
        lama.pegawai.nama,
        lama.periodeBulan,
        lama.periodeTahun
      ),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

// ---------------------------------------------------------------------------
// HAPUS
// ---------------------------------------------------------------------------
export async function hapusPredikatAction(
  _state: KelolaPredikatFormState,
  formData: FormData
): Promise<KelolaPredikatFormState> {
  try {
    const aktor = await ambilAktor();
    if ("error" in aktor) return { error: aktor.error };
    const { user, authUser } = aktor;

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { error: "Baris yang mau dihapus tidak dikenali." };

    const lama = await prisma.predikatKinerja.findUnique({
      where: { id },
      include: { pegawai: { select: { id: true, nip: true, nama: true, satuanKerja: true } } },
    });
    if (!lama) return { error: "Baris predikat tidak ditemukan - mungkin sudah dihapus orang lain." };

    if (!canUploadRekapPredikatKinerja(authUser, lama.pegawai.satuanKerja)) {
      return { error: `${lama.pegawai.nama} ada di ${lama.pegawai.satuanKerja} - di luar kewenangan kamu.` };
    }

    // Baris dihapus, TAPI jejaknya tetap ada di AuditTrail (dataSebelum berisi
    // nilai lengkap yang dihapus) - jadi penghapusan bisa ditelusuri dan
    // dipulihkan manual kalau ternyata keliru.
    await prisma.predikatKinerja.delete({ where: { id } });

    await prisma.auditTrail.create({
      data: {
        entitas: "predikat_kinerja",
        entitasId: id,
        aksi: "DELETE",
        aktor: user.nip,
        dataSebelum: {
          nip: lama.pegawai.nip,
          nama: lama.pegawai.nama,
          satuanKerja: lama.pegawai.satuanKerja,
          periode: `${lama.periodeBulan}/${lama.periodeTahun}`,
          predikat: lama.predikat,
          nilaiAngka: lama.nilaiAngka,
          sourceSystem: lama.sourceSystem,
          inputMethod: lama.inputMethod,
        },
        dataSesudah: { alasan: String(formData.get("alasan") ?? "").trim() || null },
      },
    });

    revalidatePath("/tukin/predikat-kinerja");
    return {
      success: `Predikat ${lama.pegawai.nama} periode ${lama.periodeBulan}/${lama.periodeTahun} dihapus.`,
      peringatanHitungUlang: await cekKalkulasiBasi(
        lama.pegawai.id,
        lama.pegawai.nama,
        lama.periodeBulan,
        lama.periodeTahun
      ),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
