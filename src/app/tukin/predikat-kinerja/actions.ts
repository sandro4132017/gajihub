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
/** Di bawah serverActions.bodySizeLimit (10 MB) - lihat alasannya di action. */
const MAKS_TOTAL_UKURAN = 9 * 1024 * 1024;
const UKURAN_BATCH = 50;

export interface RingkasanPeriodePredikat {
  /** Nama file asalnya - penting sejak upload bisa beberapa file sekaligus. */
  namaFile: string;
  namaSheet: string;
  periodeBulan: number;
  periodeTahun: number;
  unitPenilaian: string | null;
  jumlahTersimpan: number;
  perSatuanKerja: { satuanKerja: string; jumlah: number }[];
  perPredikat: { predikat: string; jumlah: number }[];
}

/**
 * Kelengkapan predikat SETELAH upload, per satuan kerja + periode yang
 * tersentuh. Inilah verifikasi yang sebenarnya dibutuhkan: satu satuan kerja
 * bisa dinilai beberapa penilai dengan file terpisah, jadi setelah mengupload
 * satu file orang perlu tahu apakah masih ada yang kurang.
 *
 * SENGAJA bukan "sudah N file atau belum" - jumlah penilai beda-beda per unit
 * dan tidak dipunyai sistem, sementara "siapa yang belum punya predikat" bisa
 * dijawab langsung dan tetap benar berapa pun jumlah filenya.
 */
export interface KelengkapanPredikat {
  periode: string;
  satuanKerja: string;
  totalAktif: number;
  sudahPunya: number;
  belumPunya: number;
  contohBelum: string[];
  sumberPenilaian: string[];
}

export interface UploadRekapPredikatFormState {
  error?: string;
  success?: string;
  /** Satu entri per sheet yang berhasil diproses. */
  ringkasanPerPeriode?: RingkasanPeriodePredikat[];
  /** Sheet yang tidak bisa diproses sama sekali beserta alasannya. */
  sheetDilewati?: { namaSheet: string; alasan: string }[];
  /** Kelengkapan per satuan kerja + periode yang tersentuh upload ini. */
  kelengkapan?: KelengkapanPredikat[];
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
  namaFile: string;
  namaSheet: string;
  /** Unit penilai dari kepala file, bukan dari baris pegawainya. */
  unitPenilaian: string | null;
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

    // TIDAK ADA pernyataan periode/unit/penilai dari form. Ketiganya
    // diturunkan dari isi file: periode dari baris kepala tiap sheet, satuan
    // kerja dari lookup NIP ke tabel Pegawai, penilai dari baris kedua kepala
    // file. Kewenangan tetap dijaga PER BARIS di bawah - itu yang menahan file
    // unit lain, bukan dropdown di depan.

    // Beberapa file sekaligus - satu satuan kerja bisa dinilai lebih dari satu
    // penilai (mis. Subbagian Tata Usaha dan Biro), masing-masing mengekspor
    // filenya sendiri berisi orang yang BERBEDA. Sebelumnya cuma satu file per
    // upload, jadi orang harus mengupload dua kali dan tidak ada yang
    // memberi tahu kalau file kedua terlupa.
    const semuaFile = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (semuaFile.length === 0) {
      return { error: "Pilih file Rekap Penilaian (.xlsx/.xls) dulu - boleh lebih dari satu sekaligus." };
    }
    const terlaluBesar = semuaFile.find((f) => f.size > MAKS_UKURAN_FILE);
    if (terlaluBesar) {
      return {
        error: `File "${terlaluBesar.name}" berukuran ${(terlaluBesar.size / 1024 / 1024).toFixed(1)} MB, melebihi batas 8 MB per file.`,
      };
    }
    // Batas TOTAL, bukan cuma per file. Server Action Next dibatasi 10 MB
    // (serverActions.bodySizeLimit di next.config.mjs) untuk SELURUH request,
    // jadi beberapa file yang masing-masing lolos batas 8 MB tetap bisa
    // menembusnya bersama-sama - dan kalau itu terjadi, request-nya ditolak
    // framework sebelum sempat masuk sini, dengan error yang tidak menjelaskan
    // apa pun. Ambangnya ditaruh di bawah batas framework supaya pesan yang
    // muncul adalah yang ini.
    const totalUkuran = semuaFile.reduce((a, f) => a + f.size, 0);
    if (totalUkuran > MAKS_TOTAL_UKURAN) {
      return {
        error:
          `Total ${semuaFile.length} file berukuran ${(totalUkuran / 1024 / 1024).toFixed(1)} MB, melebihi batas 9 MB sekali upload.` +
          " Upload sebagian dulu, sisanya menyusul - hasilnya sama saja karena tiap file diproses sendiri-sendiri.",
      };
    }

    // --- Baca tiap file, lalu tiap sheet di dalamnya ---
    // (I/O di sini, pemetaannya tetap di business-logic)
    const sheetDilewati: { namaSheet: string; alasan: string }[] = [];
    const hasilPerSheet: {
      namaFile: string;
      namaSheet: string;
      hasil: ReturnType<typeof parseRekapPredikatKinerja>;
    }[] = [];

    for (const file of semuaFile) {
      // Label sheet diberi nama file di depannya supaya laporan hasilnya tidak
      // ambigu waktu dua file sama-sama punya sheet bernama "Sheet1".
      const label = (namaSheet: string) => (semuaFile.length > 1 ? `${file.name} / ${namaSheet}` : namaSheet);

      let workbook: ReturnType<typeof read>;
      try {
        workbook = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      } catch {
        sheetDilewati.push({
          namaSheet: file.name,
          alasan: "tidak bisa dibaca sebagai Excel - pastikan formatnya .xlsx/.xls hasil export e-Kinerja",
        });
        continue;
      }
      if (workbook.SheetNames.length === 0) {
        sheetDilewati.push({ namaSheet: file.name, alasan: "file tidak punya sheet yang bisa dibaca" });
        continue;
      }

      for (const namaSheet of workbook.SheetNames) {
        const sheet = workbook.Sheets[namaSheet];
        if (!sheet) {
          sheetDilewati.push({ namaSheet: label(namaSheet), alasan: "sheet kosong" });
          continue;
        }
        const matriks = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
        const hasil = parseRekapPredikatKinerja(matriks);
        if (hasil.error) {
          sheetDilewati.push({ namaSheet: label(namaSheet), alasan: hasil.error });
          continue;
        }
        if (hasil.baris.length === 0) {
          sheetDilewati.push({ namaSheet: label(namaSheet), alasan: "tidak ada baris predikat yang bisa diproses" });
          continue;
        }
        hasilPerSheet.push({ namaFile: file.name, namaSheet: label(namaSheet), hasil });
      }
    }

    if (hasilPerSheet.length === 0) {
      return {
        error:
          semuaFile.length > 1
            ? "Tidak ada sheet yang bisa diproses dari file-file itu."
            : "Tidak ada sheet yang bisa diproses dari file ini.",
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

    for (const { namaFile, namaSheet, hasil } of hasilPerSheet) {
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
          namaFile,
          namaSheet,
          // Unit penilai dibaca dari baris kedua kepala file - satu file = satu
          // penilai. Bukan satuan kerja pegawainya (itu dari lookup NIP), dan
          // bukan isian user.
          unitPenilaian: hasil.unitPenilaian,
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
          // Dua rating penyusun predikat, disimpan apa adanya dari file.
          // TIDAK dipakai menghitung - lihat komentar model PredikatKinerja.
          hasilKerja: b.ratingHasilKinerja,
          perilakuKerja: b.ratingPerilakuKerja,
          // Unit penilai dari kepala file - dipakai menampilkan sumber
          // penilaian mana saja yang sudah masuk untuk periode itu.
          unitPenilaian: b.unitPenilaian,
          sourceSystem: "e-Kinerja BKN",
          sourceSyncedAt: sekarang,
          inputMethod: "MANUAL_UPLOAD",
        },
        update: {
          predikat: b.predikat,
          nilaiAngka: b.nilaiAngka,
          hasilKerja: b.ratingHasilKinerja,
          perilakuKerja: b.ratingPerilakuKerja,
          unitPenilaian: b.unitPenilaian,
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

    for (const { namaFile, namaSheet, hasil } of hasilPerSheet) {
      const barisPeriode = siapSimpan.filter((b) => b.namaSheet === namaSheet);
      if (barisPeriode.length === 0) continue;

      ringkasanPerPeriode.push({
        namaFile,
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

      // SATU baris audit PER satuan kerja yang datanya tersentuh - bukan satu
      // baris per berkas. Satu berkas rekap bisa memuat pegawai lintas unit,
      // dan panel Notifikasi & Aktivitas men-scope per unit: kalau ditulis
      // sebagai satu baris tanpa unit, unggahan ini tidak akan pernah muncul
      // di panel unit manapun.
      const jumlahPerSatker = new Map<string, number>();
      for (const b of barisPeriode) {
        jumlahPerSatker.set(b.satuanKerja, (jumlahPerSatker.get(b.satuanKerja) ?? 0) + 1);
      }
      await prisma.auditTrail.createMany({
        data: [...jumlahPerSatker.entries()].map(([satuanKerja, jumlah]) => ({
          entitas: "predikat_kinerja",
          entitasId: `${hasil.periodeBulan}/${hasil.periodeTahun}`,
          aksi: "CREATE",
          aktor: user.nip,
          satuanKerja,
          dataSesudah: {
            namaFile,
            namaSheet,
            periode: `${hasil.periodeBulan}/${hasil.periodeTahun}`,
            unitPenilaian: hasil.unitPenilaian,
            jumlahBarisTersimpan: jumlah,
            sumber: "e-Kinerja BKN (upload manual)",
          },
        })),
      });
    }

    // --- VERIFIKASI KELENGKAPAN ---
    // Ditampilkan langsung di halaman upload, bukan cuma di halaman kalkulasi:
    // begitu satu file masuk, orang perlu tahu saat itu juga apakah file dari
    // penilai lain masih kurang. Dicek per satuan kerja + periode yang benar-
    // benar tersentuh upload ini, bukan seluruh kementerian.
    const kombinasi = new Map<string, { satuanKerja: string; periodeBulan: number; periodeTahun: number }>();
    for (const b of siapSimpan) {
      kombinasi.set(`${b.satuanKerja}|${b.periodeBulan}|${b.periodeTahun}`, {
        satuanKerja: b.satuanKerja,
        periodeBulan: b.periodeBulan,
        periodeTahun: b.periodeTahun,
      });
    }

    const kelengkapan: KelengkapanPredikat[] = [];
    for (const { satuanKerja, periodeBulan, periodeTahun } of kombinasi.values()) {
      // Hanya pegawai AKTIF - pensiunan tidak akan pernah punya predikat baru,
      // dan memasukkannya membuat kelengkapan mustahil tercapai.
      const aktif = await prisma.pegawai.findMany({
        where: { satuanKerja, statusPegawai: "AKTIF" },
        select: { id: true, nama: true },
        orderBy: { nama: "asc" },
      });
      const punya = await prisma.predikatKinerja.findMany({
        where: { pegawaiId: { in: aktif.map((p) => p.id) }, periodeBulan, periodeTahun },
        select: { pegawaiId: true, unitPenilaian: true },
      });
      const setPunya = new Set(punya.map((k) => k.pegawaiId));
      const belum = aktif.filter((p) => !setPunya.has(p.id));

      kelengkapan.push({
        periode: `${periodeBulan}/${periodeTahun}`,
        satuanKerja,
        totalAktif: aktif.length,
        sudahPunya: aktif.length - belum.length,
        belumPunya: belum.length,
        contohBelum: belum.slice(0, 10).map((p) => p.nama),
        sumberPenilaian: [...new Set(punya.map((k) => k.unitPenilaian ?? "(sumber tidak tercatat)"))].sort(),
      });
    }

    revalidatePath("/tukin/predikat-kinerja");
    revalidatePath("/kasubag/kalkulasi");
    const jumlahPeriode = ringkasanPerPeriode.length;
    const labelSumber =
      semuaFile.length > 1 ? `${semuaFile.length} file` : `"${semuaFile[0].name}"`;
    return {
      success:
        `${siapSimpan.length} predikat kinerja tersimpan dari ${labelSumber}` +
        (jumlahPeriode > 1 ? ` - ${jumlahPeriode} periode/sheet sekaligus.` : "."),
      ringkasanPerPeriode,
      kelengkapan,
      sheetDilewati: sheetDilewati.length > 0 ? sheetDilewati : undefined,
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
      perluHitungUlang: perluHitungUlang.length > 0 ? perluHitungUlang : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
