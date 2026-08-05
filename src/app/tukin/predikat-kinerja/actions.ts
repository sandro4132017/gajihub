"use server";

import { revalidatePath } from "next/cache";
import { read, utils } from "xlsx";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canUploadRekapPredikatKinerja, type AuthUser } from "../../../auth/permissions";
import { parseRekapPredikatKinerja, type BarisRekapPredikat } from "../../../business-logic/rekapPredikatKinerja";

/**
 * Upload file "Rekap Penilaian" dari e-Kinerja BKN -> tabel PredikatKinerja
 * (bobot 70% Tukin). Sama seperti upload gaji induk: FILE-NYA TIDAK DISIMPAN,
 * cuma dibaca di memori - mekanisme storage & retensi dokumen masih
 * TODO(confirm) di CLAUDE.md.
 *
 * Ini BUKAN "edit predikat bebas": tidak ada form ketik-manual di sini,
 * satu-satunya sumber angka adalah file resmi dari portal BKN, dan tiap
 * penulisan dicatat di AuditTrail. Lihat canEditPresensiKinerjaLangsung di
 * permissions.ts yang tetap `false` buat semua role.
 *
 * ---------------------------------------------------------------------------
 * SEMUA SHEET DIBACA, bukan cuma yang pertama
 * ---------------------------------------------------------------------------
 * File asli dari Biro Keuangan ("Rekap Penilaian SKP ROKEU_MEI 2026.xlsx")
 * ternyata berisi 6 sheet: Januari, Februari, Maret, April, Mei, dan satu
 * "Sheet1" berisi rekap FINAL tahunan. Tiap sheet punya baris periodenya
 * sendiri.
 *
 * Dulu hanya `SheetNames[0]` yang dibaca, dan itu GAGAL DIAM-DIAM dengan cara
 * yang berbahaya: pengguna membuka file di Excel pada sheet "Mei", menekan
 * upload, lalu sistem menyimpan data JANUARI dengan label Januari. Tidak ada
 * error, tidak ada peringatan - empat bulan lainnya hilang begitu saja, dan
 * yang tersimpan bukan bulan yang dimaksud.
 *
 * Sekarang tiap sheet diproses sendiri dan dilaporkan per periode. Sheet yang
 * baris periodenya tidak terbaca (mis. rekap FINAL tahunan) dilewati dengan
 * alasan eksplisit, bukan membatalkan seluruh file.
 */

const MAKS_UKURAN_FILE = 8 * 1024 * 1024;
const UKURAN_BATCH = 50;

export interface RingkasanPeriodePredikat {
  namaSheet: string;
  periodeBulan: number;
  periodeTahun: number;
  unitPenilaian: string | null;
  jumlahTersimpan: number;
  perSatuanKerja: { satuanKerja: string; jumlah: number }[];
  perPredikat: { predikat: string; jumlah: number }[];
}

export interface UploadRekapPredikatFormState {
  error?: string;
  success?: string;
  /** Satu entri per sheet yang berhasil diproses. */
  ringkasanPerPeriode?: RingkasanPeriodePredikat[];
  /** Sheet yang tidak bisa diproses sama sekali beserta alasannya. */
  sheetDilewati?: { namaSheet: string; alasan: string }[];
  /** Baris yang dilewati, digabung dari seluruh sheet. */
  dilewati?: { alasan: string; jumlah: number; contohNip: string[] }[];
  /**
   * Pegawai yang predikatnya baru masuk TAPI kalkulasi Tukin periode itu
   * sudah terlanjur dibuat - nilainya jadi basi sampai dihitung ulang.
   */
  perluHitungUlang?: { periode: string; satuanKerja: string; jumlah: number }[];
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

function hitungPer<T>(items: T[], kunci: (item: T) => string) {
  const peta = new Map<string, number>();
  for (const item of items) {
    const k = kunci(item);
    peta.set(k, (peta.get(k) ?? 0) + 1);
  }
  return [...peta.entries()]
    .map(([nama, jumlah]) => ({ nama, jumlah }))
    .sort((a, b) => b.jumlah - a.jumlah);
}

type BarisSiapSimpan = BarisRekapPredikat & {
  pegawaiId: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  namaSheet: string;
};

export async function uploadRekapPredikatAction(
  _state: UploadRekapPredikatFormState,
  formData: FormData
): Promise<UploadRekapPredikatFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Pilih file Rekap Penilaian (.xlsx/.xls) dulu." };
    }
    if (file.size > MAKS_UKURAN_FILE) {
      return { error: `Ukuran file ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 8 MB.` };
    }

    // --- Baca file (I/O di sini, pemetaannya di business-logic) ---
    let workbook: ReturnType<typeof read>;
    try {
      workbook = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
    } catch {
      return { error: "File tidak bisa dibaca sebagai Excel. Pastikan formatnya .xlsx/.xls hasil export e-Kinerja." };
    }
    if (workbook.SheetNames.length === 0) return { error: "File tidak punya sheet yang bisa dibaca." };

    // --- Parse TIAP sheet, masing-masing punya periodenya sendiri ---
    const sheetDilewati: { namaSheet: string; alasan: string }[] = [];
    const hasilPerSheet: { namaSheet: string; hasil: ReturnType<typeof parseRekapPredikatKinerja> }[] = [];

    for (const namaSheet of workbook.SheetNames) {
      const sheet = workbook.Sheets[namaSheet];
      if (!sheet) {
        sheetDilewati.push({ namaSheet, alasan: "sheet kosong" });
        continue;
      }
      const matriks = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
      const hasil = parseRekapPredikatKinerja(matriks);
      if (hasil.error) {
        sheetDilewati.push({ namaSheet, alasan: hasil.error });
        continue;
      }
      if (hasil.baris.length === 0) {
        sheetDilewati.push({ namaSheet, alasan: "tidak ada baris predikat yang bisa diproses" });
        continue;
      }
      hasilPerSheet.push({ namaSheet, hasil });
    }

    if (hasilPerSheet.length === 0) {
      return {
        error: "Tidak ada sheet yang bisa diproses dari file ini.",
        sheetDilewati: sheetDilewati.length > 0 ? sheetDilewati : undefined,
      };
    }

    // --- Cocokkan NIP ke data Pegawai (sumber satuan kerja yang sah) ---
    // Satu query untuk SEMUA sheet sekaligus, bukan per sheet.
    const nipUnik = [...new Set(hasilPerSheet.flatMap((s) => s.hasil.baris.map((b) => b.nip)))];
    const pegawaiList = await prisma.pegawai.findMany({
      where: { nip: { in: nipUnik } },
      select: { id: true, nip: true, satuanKerja: true },
    });
    const petaPegawai = new Map(pegawaiList.map((p) => [p.nip, p]));

    const dilewati: { nip: string | null; alasan: string }[] = [];
    const siapSimpan: BarisSiapSimpan[] = [];

    for (const { namaSheet, hasil } of hasilPerSheet) {
      for (const d of hasil.dilewati) dilewati.push({ nip: d.nip, alasan: d.alasan });

      for (const baris of hasil.baris) {
        const pegawai = petaPegawai.get(baris.nip);
        if (!pegawai) {
          dilewati.push({ nip: baris.nip, alasan: "NIP tidak ditemukan di data Pegawai Gajihub" });
          continue;
        }
        // Otorisasi dicek PER BARIS terhadap satuan kerja PEGAWAI-nya, bukan
        // sekali per file dan bukan dari nama unit di kepala file - supaya
        // Kasubag TU tidak bisa menulis predikat pegawai unit lain hanya
        // karena namanya ikut ada di file yang dia upload.
        if (!canUploadRekapPredikatKinerja(authUser, pegawai.satuanKerja)) {
          dilewati.push({
            nip: baris.nip,
            alasan: `di luar kewenangan kamu (pegawai ${pegawai.satuanKerja})`,
          });
          continue;
        }
        siapSimpan.push({
          ...baris,
          pegawaiId: pegawai.id,
          satuanKerja: pegawai.satuanKerja,
          periodeBulan: hasil.periodeBulan,
          periodeTahun: hasil.periodeTahun,
          namaSheet,
        });
      }
    }

    if (siapSimpan.length === 0) {
      return {
        error: "Tidak ada baris yang bisa disimpan - semua dilewati, lihat alasannya di bawah.",
        dilewati: kelompokkanAlasan(dilewati),
        sheetDilewati: sheetDilewati.length > 0 ? sheetDilewati : undefined,
      };
    }

    // --- Simpan (upsert - aman kalau file yang sama di-upload ulang) ---
    const sekarang = new Date();
    const operasi = siapSimpan.map((b) =>
      prisma.predikatKinerja.upsert({
        where: {
          pegawaiId_periodeBulan_periodeTahun: {
            pegawaiId: b.pegawaiId,
            periodeBulan: b.periodeBulan,
            periodeTahun: b.periodeTahun,
          },
        },
        create: {
          pegawaiId: b.pegawaiId,
          periodeBulan: b.periodeBulan,
          periodeTahun: b.periodeTahun,
          predikat: b.predikat,
          nilaiAngka: b.nilaiAngka,
          sourceSystem: "e-Kinerja BKN",
          sourceSyncedAt: sekarang,
          inputMethod: "MANUAL_UPLOAD",
        },
        update: {
          predikat: b.predikat,
          nilaiAngka: b.nilaiAngka,
          sourceSystem: "e-Kinerja BKN",
          sourceSyncedAt: sekarang,
          inputMethod: "MANUAL_UPLOAD",
        },
      })
    );
    for (let i = 0; i < operasi.length; i += UKURAN_BATCH) {
      await prisma.$transaction(operasi.slice(i, i + UKURAN_BATCH));
    }

    // --- Ringkasan per periode + kalkulasi Tukin yang jadi basi ---
    // Kalkulasi TIDAK dihitung ulang otomatis: recalculation mereset siklus
    // approval (lihat catatan kalkulasi massal di CLAUDE.md), jadi
    // keputusannya diserahkan ke user.
    const ringkasanPerPeriode: RingkasanPeriodePredikat[] = [];
    const perluHitungUlang: { periode: string; satuanKerja: string; jumlah: number }[] = [];

    for (const { namaSheet, hasil } of hasilPerSheet) {
      const barisPeriode = siapSimpan.filter((b) => b.namaSheet === namaSheet);
      if (barisPeriode.length === 0) continue;

      ringkasanPerPeriode.push({
        namaSheet,
        periodeBulan: hasil.periodeBulan,
        periodeTahun: hasil.periodeTahun,
        unitPenilaian: hasil.unitPenilaian,
        jumlahTersimpan: barisPeriode.length,
        perSatuanKerja: hitungPer(barisPeriode, (b) => b.satuanKerja).map((x) => ({
          satuanKerja: x.nama,
          jumlah: x.jumlah,
        })),
        perPredikat: hitungPer(barisPeriode, (b) => b.predikatLabel).map((x) => ({
          predikat: x.nama,
          jumlah: x.jumlah,
        })),
      });

      const terdampak = await prisma.tukinCalculation.findMany({
        where: {
          periodeBulan: hasil.periodeBulan,
          periodeTahun: hasil.periodeTahun,
          pegawaiId: { in: barisPeriode.map((b) => b.pegawaiId) },
        },
        select: { pegawaiId: true },
      });
      const petaSatker = new Map(barisPeriode.map((b) => [b.pegawaiId, b.satuanKerja]));
      for (const x of hitungPer(terdampak, (t) => petaSatker.get(t.pegawaiId) ?? "(tidak diketahui)")) {
        perluHitungUlang.push({
          periode: `${hasil.periodeBulan}/${hasil.periodeTahun}`,
          satuanKerja: x.nama,
          jumlah: x.jumlah,
        });
      }

      await prisma.auditTrail.create({
        data: {
          entitas: "predikat_kinerja",
          entitasId: `${hasil.periodeBulan}/${hasil.periodeTahun}`,
          aksi: "CREATE",
          aktor: user.nip,
          dataSesudah: {
            namaFile: file.name,
            namaSheet,
            periode: `${hasil.periodeBulan}/${hasil.periodeTahun}`,
            unitPenilaian: hasil.unitPenilaian,
            jumlahBarisTersimpan: barisPeriode.length,
            sumber: "e-Kinerja BKN (upload manual)",
          },
        },
      });
    }

    revalidatePath("/tukin/predikat-kinerja");
    const jumlahPeriode = ringkasanPerPeriode.length;
    return {
      success:
        `${siapSimpan.length} predikat kinerja tersimpan dari "${file.name}"` +
        (jumlahPeriode > 1 ? ` - ${jumlahPeriode} periode sekaligus.` : "."),
      ringkasanPerPeriode,
      sheetDilewati: sheetDilewati.length > 0 ? sheetDilewati : undefined,
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
      perluHitungUlang: perluHitungUlang.length > 0 ? perluHitungUlang : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
