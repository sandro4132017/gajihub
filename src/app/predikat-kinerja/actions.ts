"use server";

import { revalidatePath } from "next/cache";
import { read, utils } from "xlsx";
import { prisma } from "../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../auth/getSessionAccount";
import { canUploadRekapPredikatKinerja, type AuthUser } from "../../auth/permissions";
import { parseRekapPredikatKinerja, type BarisRekapPredikat } from "../../business-logic/rekapPredikatKinerja";

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
 */

const MAKS_UKURAN_FILE = 8 * 1024 * 1024;
const UKURAN_BATCH = 50;

export interface UploadRekapPredikatFormState {
  error?: string;
  success?: string;
  ringkasan?: {
    periodeBulan: number;
    periodeTahun: number;
    unitPenilaian: string | null;
    jumlahTersimpan: number;
    perSatuanKerja: { satuanKerja: string; jumlah: number }[];
    perPredikat: { predikat: string; jumlah: number }[];
  };
  dilewati?: { alasan: string; jumlah: number; contohNip: string[] }[];
  /**
   * Pegawai yang predikatnya baru masuk TAPI kalkulasi Tukin periode itu
   * sudah terlanjur dibuat - nilainya jadi basi sampai dihitung ulang.
   */
  perluHitungUlang?: { satuanKerja: string; jumlah: number }[];
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
    let matriks: unknown[][];
    try {
      const wb = read(Buffer.from(await file.arrayBuffer()), { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) return { error: "File tidak punya sheet yang bisa dibaca." };
      matriks = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: null });
    } catch {
      return { error: "File tidak bisa dibaca sebagai Excel. Pastikan formatnya .xlsx/.xls hasil export e-Kinerja." };
    }

    const hasil = parseRekapPredikatKinerja(matriks);
    if (hasil.error) return { error: hasil.error };
    if (hasil.baris.length === 0) {
      return {
        error: "Tidak ada baris predikat yang bisa diproses dari file ini.",
        dilewati: kelompokkanAlasan(hasil.dilewati),
      };
    }

    const { periodeBulan, periodeTahun } = hasil;

    // --- Cocokkan NIP ke data Pegawai (sumber satuan kerja yang sah) ---
    const nipUnik = [...new Set(hasil.baris.map((b) => b.nip))];
    const pegawaiList = await prisma.pegawai.findMany({
      where: { nip: { in: nipUnik } },
      select: { id: true, nip: true, nama: true, satuanKerja: true },
    });
    const petaPegawai = new Map(pegawaiList.map((p) => [p.nip, p]));

    const dilewati: { nip: string | null; alasan: string }[] = hasil.dilewati.map((d) => ({
      nip: d.nip,
      alasan: d.alasan,
    }));
    const siapSimpan: (BarisRekapPredikat & { pegawaiId: string; satuanKerja: string })[] = [];

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
      siapSimpan.push({ ...baris, pegawaiId: pegawai.id, satuanKerja: pegawai.satuanKerja });
    }

    if (siapSimpan.length === 0) {
      return {
        error: "Tidak ada baris yang bisa disimpan - semua dilewati, lihat alasannya di bawah.",
        dilewati: kelompokkanAlasan(dilewati),
      };
    }

    // --- Simpan (upsert - aman kalau file yang sama di-upload ulang) ---
    const sekarang = new Date();
    const operasi = siapSimpan.map((b) =>
      prisma.predikatKinerja.upsert({
        where: {
          pegawaiId_periodeBulan_periodeTahun: { pegawaiId: b.pegawaiId, periodeBulan, periodeTahun },
        },
        create: {
          pegawaiId: b.pegawaiId,
          periodeBulan,
          periodeTahun,
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

    // --- Kalkulasi Tukin yang jadi basi karena predikatnya baru berubah ---
    // Bukan dihitung ulang otomatis di sini: recalculation punya efek samping
    // mereset siklus approval (lihat catatan di CLAUDE.md soal kalkulasi
    // massal Kasubag TU), jadi keputusannya diserahkan ke user.
    const tukinTerdampak = await prisma.tukinCalculation.findMany({
      where: { periodeBulan, periodeTahun, pegawaiId: { in: siapSimpan.map((b) => b.pegawaiId) } },
      select: { pegawaiId: true },
    });
    const petaSatker = new Map(siapSimpan.map((b) => [b.pegawaiId, b.satuanKerja]));
    const perluHitungUlang = hitungPer(tukinTerdampak, (t) => petaSatker.get(t.pegawaiId) ?? "(tidak diketahui)").map(
      (x) => ({ satuanKerja: x.nama, jumlah: x.jumlah })
    );

    await prisma.auditTrail.create({
      data: {
        entitas: "predikat_kinerja",
        entitasId: `${periodeBulan}/${periodeTahun}`,
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          namaFile: file.name,
          periode: `${periodeBulan}/${periodeTahun}`,
          unitPenilaian: hasil.unitPenilaian,
          jumlahBarisTersimpan: siapSimpan.length,
          jumlahBarisDilewati: dilewati.length,
          sumber: "e-Kinerja BKN (upload manual)",
        },
      },
    });

    revalidatePath("/predikat-kinerja");
    return {
      success: `${siapSimpan.length} predikat kinerja tersimpan dari "${file.name}".`,
      ringkasan: {
        periodeBulan,
        periodeTahun,
        unitPenilaian: hasil.unitPenilaian,
        jumlahTersimpan: siapSimpan.length,
        perSatuanKerja: hitungPer(siapSimpan, (b) => b.satuanKerja).map((x) => ({
          satuanKerja: x.nama,
          jumlah: x.jumlah,
        })),
        perPredikat: hitungPer(siapSimpan, (b) => b.predikatLabel).map((x) => ({
          predikat: x.nama,
          jumlah: x.jumlah,
        })),
      },
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
      perluHitungUlang: perluHitungUlang.length > 0 ? perluHitungUlang : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
