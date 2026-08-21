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
 * Melengkapi upload massal di actions.ts, untuk perbaikan per orang.
 *
 * KENAPA INI TIDAK MELANGGAR "tidak ada edit langsung":
 * `canEditPresensiKinerjaLangsung` tetap `false` dan tidak dipakai di sini.
 * Izin yang dipakai `canUploadRekapPredikatKinerja`, yang komposisinya
 * mencakup `canUploadKoreksiPredikatKinerjaUnit` - fungsi yang sejak awal
 * didefinisikan sebagai "upload + KOREKSI LANGSUNG kalau ada yang salah".
 * Yang dilarang itu edit BEBAS tanpa scope & tanpa jejak, bukan koreksi
 * ber-scope unit yang tercatat.
 *
 * Tiga pengaman:
 *   1. Otorisasi dicek terhadap `Pegawai.satuanKerja` milik BARIS yang
 *      disentuh - id dari form tidak dipercaya.
 *   2. `nilaiAngka` TIDAK PERNAH diterima dari form, selalu diturunkan ulang
 *      lewat konversiPredikatKeNilaiPersen (Kepsekjen 82/2025). Tanpa ini,
 *      orang bisa mengirim predikat "Kurang" dengan nilai 100%.
 *   3. Tiap perubahan menulis AuditTrail dengan nilai SEBELUM & SESUDAH, dan
 *      ditandai input manual - angka ketikan manusia tidak bisa menyamar
 *      sebagai angka resmi BKN.
 *
 * TIDAK menghitung ulang Tukin otomatis - itu mereset siklus approval ke
 * DRAFT, jadi keputusannya tetap di tangan user. Action ini cuma MEMBERI TAHU
 * kalau ada kalkulasi yang jadi basi.
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
        satuanKerja: pegawai.satuanKerja,
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
        // Rating Hasil Kerja & Perilaku Kerja DIKOSONGKAN saat dikoreksi
        // manual. Keduanya berasal dari file e-Kinerja BKN dan menyusun
        // predikat LAMA - membiarkannya menempel pada predikat yang sudah
        // diubah membuat barisnya seolah masih didukung penilaian BKN.
        // Nilai lamanya tetap terekam di AuditTrail di bawah.
        hasilKerja: null,
        perilakuKerja: null,
        // Ikut dikosongkan: setelah dikoreksi manual, predikatnya bukan lagi
        // yang dikirim unit penilai itu, jadi mencantumkan namanya sebagai
        // sumber akan keliru.
        unitPenilaian: null,
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
        satuanKerja: lama.pegawai.satuanKerja,
        dataSebelum: {
          predikat: lama.predikat,
          nilaiAngka: lama.nilaiAngka,
          hasilKerja: lama.hasilKerja,
          perilakuKerja: lama.perilakuKerja,
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
/**
 * Hapus SELURUH predikat satu satuan kerja pada satu periode - dipakai waktu
 * file rekapnya salah dan mau diganti dari nol.
 *
 * KAPAN INI SEBENARNYA TIDAK PERLU: upload ulang memakai upsert, jadi kalau
 * file penggantinya memuat ORANG YANG SAMA, cukup upload ulang - nilainya
 * tertimpa. Menghapus dulu hanya perlu kalau ada orang yang HILANG dari file
 * baru; tanpa dihapus, baris lama mereka tetap tinggal dan ikut terhitung.
 *
 * EMPAT PENGAMAN:
 *   1. Satuan kerja WAJIB dipilih - tidak ada mode "hapus semua satker
 *      sekaligus". Salah klik di situ bisa menghapus ribuan baris lintas unit.
 *   2. Izin dicek PER BARIS terhadap `Pegawai.satuanKerja`, sama seperti hapus
 *      satuan. Baris di luar kewenangan tidak ikut terhapus dan dilaporkan.
 *   3. Jumlah baris yang dilihat user waktu menekan tombol dikirim ulang dan
 *      dicocokkan - kalau sudah berubah (ada yang upload di saat bersamaan),
 *      penghapusan DIBATALKAN, bukan dijalankan atas jumlah yang lain.
 *   4. Seluruh baris yang dihapus disimpan lengkap di AuditTrail, jadi bisa
 *      dipulihkan manual kalau ternyata keliru.
 */
export async function hapusPredikatPeriodeAction(
  _state: KelolaPredikatFormState,
  formData: FormData
): Promise<KelolaPredikatFormState> {
  try {
    const aktor = await ambilAktor();
    if ("error" in aktor) return { error: aktor.error };
    const { user, authUser } = aktor;

    const satuanKerja = String(formData.get("satuanKerja") ?? "").trim();
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    const jumlahDilihat = Number(formData.get("jumlahDilihat"));

    if (!satuanKerja) {
      return { error: "Pilih satuan kerja dulu - penghapusan massal tidak bisa lintas unit sekaligus." };
    }
    if (!periodeBulan || !periodeTahun) return { error: "Periode tidak dikenali." };
    if (formData.get("konfirmasi") !== "1") {
      return { error: "Centang konfirmasi dulu sebelum menghapus." };
    }

    const barisList = await prisma.predikatKinerja.findMany({
      where: { periodeBulan, periodeTahun, pegawai: { satuanKerja } },
      include: { pegawai: { select: { id: true, nip: true, nama: true, satuanKerja: true } } },
      orderBy: { pegawai: { nama: "asc" } },
    });

    if (barisList.length === 0) {
      return { error: `Tidak ada predikat ${satuanKerja} untuk periode ${periodeBulan}/${periodeTahun}.` };
    }
    // Pengaman 3 - jumlahnya berubah sejak halaman dirender.
    if (Number.isFinite(jumlahDilihat) && jumlahDilihat !== barisList.length) {
      return {
        error:
          `Jumlah datanya sudah berubah (waktu halaman dibuka ${jumlahDilihat} baris, sekarang ${barisList.length}) -` +
          " kemungkinan ada yang mengupload di saat bersamaan. Muat ulang halaman dan periksa lagi sebelum menghapus.",
      };
    }

    const boleh = barisList.filter((b) => canUploadRekapPredikatKinerja(authUser, b.pegawai.satuanKerja));
    const ditolak = barisList.length - boleh.length;
    if (boleh.length === 0) {
      return { error: `Seluruh ${barisList.length} baris ada di luar kewenangan kamu - tidak ada yang dihapus.` };
    }

    await prisma.$transaction([
      prisma.predikatKinerja.deleteMany({ where: { id: { in: boleh.map((b) => b.id) } } }),
      prisma.auditTrail.create({
        data: {
          entitas: "predikat_kinerja",
          entitasId: `hapus-periode-${satuanKerja}-${periodeBulan}-${periodeTahun}`,
          aksi: "DELETE",
          aktor: user.nip,
          // Isi lengkap tiap baris disimpan, bukan cuma jumlahnya - inilah yang
          // membuat penghapusan massal ini bisa dipulihkan manual.
          dataSebelum: {
            satuanKerja,
            periode: `${periodeBulan}/${periodeTahun}`,
            jumlah: boleh.length,
            baris: boleh.map((b) => ({
              nip: b.pegawai.nip,
              nama: b.pegawai.nama,
              predikat: b.predikat,
              nilaiAngka: b.nilaiAngka,
              hasilKerja: b.hasilKerja,
              perilakuKerja: b.perilakuKerja,
              unitPenilaian: b.unitPenilaian,
              sourceSystem: b.sourceSystem,
              inputMethod: b.inputMethod,
            })),
          },
          dataSesudah: {
            sumber: "Hapus predikat satu periode",
            alasan: String(formData.get("alasan") ?? "").trim() || null,
            ditolakKarenaKewenangan: ditolak,
          },
        },
      }),
    ]);

    // Kalkulasi Tukin TIDAK ikut dihapus, dan itu penting disampaikan: baris
    // tukin yang sudah ada tetap memakai komponen kinerja dari predikat yang
    // barusan dihapus sampai dihitung ulang.
    const tukinTerdampak = await prisma.tukinCalculation.count({
      where: { periodeBulan, periodeTahun, pegawaiId: { in: boleh.map((b) => b.pegawai.id) } },
    });

    revalidatePath("/tukin/predikat-kinerja");
    revalidatePath("/kasubag/kalkulasi");
    return {
      success:
        `${boleh.length} predikat ${satuanKerja} periode ${periodeBulan}/${periodeTahun} dihapus.` +
        (ditolak > 0 ? ` ${ditolak} baris dilewati karena di luar kewenangan kamu.` : "") +
        " Sekarang bisa upload file penggantinya." +
        (tukinTerdampak > 0
          ? ` PERHATIAN: ${tukinTerdampak} kalkulasi Tukin periode ini TIDAK ikut terhapus dan masih memakai predikat yang barusan dihilangkan - hitung ulang setelah file baru diupload.`
          : ""),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

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
