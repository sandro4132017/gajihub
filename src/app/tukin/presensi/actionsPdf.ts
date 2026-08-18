"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canUploadRekapPresensi, type AuthUser } from "../../../auth/permissions";
import { ekstrakTeksPdf } from "../../../lib/pdfTeks";
import { parsePdfPresensi, type LaporanPresensiPdf } from "../../../business-logic/presensiPdf";
import {
  rekapDariLaporanPdf,
  JADWAL_KERJA_DEFAULT,
  type HasilRekapDariPdf,
} from "../../../business-logic/presensiPdfKeRekap";
import { muatKendalaPeriode, muatKoreksiPeriode } from "../../../lib/kendalaPresensi";
import { muatHariLiburPeriode } from "../../../lib/hariLibur";
import { STATUS_HARIAN, tanggalUtc, menitKeWaktu } from "../../../business-logic/presensiKeDb";

/**
 * Upload PDF "Laporan Detail Presensi Harian" (export e-Presensi) - bisa
 * BANYAK FILE sekaligus, dan satu file boleh memuat banyak pegawai.
 *
 * Sama seperti upload gaji induk & predikat kinerja: FILE-NYA TIDAK DISIMPAN,
 * cuma dibaca di memori. Periode diambil DARI ISI FILE (judul "<Bulan>
 * <Tahun>"), bukan dipilih manual - satu batch boleh berisi periode campuran.
 *
 * Otorisasi dicek PER PEGAWAI terhadap satuan kerjanya, bukan sekali per file:
 * satu PDF gabungan bisa memuat pegawai lintas unit, dan Kasubag TU tidak
 * boleh ikut menulis presensi unit lain cuma karena namanya ada di file yang
 * dia upload.
 */

const MAKS_TOTAL_UKURAN = 9 * 1024 * 1024; // di bawah bodySizeLimit 10mb di next.config.mjs
const MAKS_JUMLAH_FILE = 300;
const UKURAN_BATCH = 25;
const MAKS_DETAIL_DITAMPILKAN = 300;

export interface RingkasanPegawaiPdf {
  nip: string;
  nama: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  namaFile: string;
  jumlahHariKerja: number;
  jumlahHariWfo: number;
  jumlahHariWfhWfa: number;
  jumlahHariDinasLuar: number;
  jumlahHariDiklat: number;
  jumlahHariAlpha: number;
  jumlahTidakPresensi: number;
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalJamLembur: number;
  totalJamLemburHariLibur: number;
  jumlahHariDetail: number;
  catatan: string[];
  selisihRingkasan: { label: string; sumberPdf: number; gajihub: number }[];
}

export interface UploadPresensiPdfFormState {
  error?: string;
  success?: string;
  perPeriode?: { periodeBulan: number; periodeTahun: number; jumlahPegawai: number }[];
  pegawai?: RingkasanPegawaiPdf[];
  jumlahPegawaiTersimpan?: number;
  jumlahDetailTidakDitampilkan?: number;
  dilewati?: { alasan: string; jumlah: number; contoh: string[] }[];
  perluHitungUlang?: number;
  jumlahFileDiproses?: number;
}

function kelompokkanAlasan(items: { label: string; alasan: string }[]) {
  const urutan: string[] = [];
  const peta = new Map<string, string[]>();
  for (const item of items) {
    if (!peta.has(item.alasan)) {
      peta.set(item.alasan, []);
      urutan.push(item.alasan);
    }
    peta.get(item.alasan)!.push(item.label);
  }
  return urutan.map((alasan) => ({
    alasan,
    jumlah: peta.get(alasan)!.length,
    contoh: peta.get(alasan)!.slice(0, 3),
  }));
}

/**
 * Status harian yang disimpan ke PresensiHarian. Sengaja dipetakan ke nilai
 * yang SUDAH dipakai kolom status_kehadiran (lihat komentar model di
 * schema.prisma) supaya jalur kalkulasi lama yang membaca PresensiHarian
 * tetap mengerti artinya.
 */
// STATUS_HARIAN / tanggalUtc / menitKeWaktu DIPINDAH ke
// src/business-logic/presensiKeDb.ts supaya dipakai bareng dengan jalur tarik
// langsung dari database e-Presensi (src/jobs/importPresensiEpresensi.ts) -
// lihat impor di kepala file ini. Perilakunya TIDAK berubah.

export async function uploadPresensiPdfAction(
  _state: UploadPresensiPdfFormState,
  formData: FormData
): Promise<UploadPresensiPdfFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
    if (files.length === 0) return { error: "Pilih dulu file PDF rekap presensi (boleh sekaligus satu folder)." };
    if (files.length > MAKS_JUMLAH_FILE) {
      return { error: `${files.length} file sekaligus terlalu banyak - maksimal ${MAKS_JUMLAH_FILE} file per upload.` };
    }
    const totalUkuran = files.reduce((a, f) => a + f.size, 0);
    if (totalUkuran > MAKS_TOTAL_UKURAN) {
      return {
        error: `Total ukuran file ${(totalUkuran / 1024 / 1024).toFixed(1)} MB melebihi batas 9 MB - upload bertahap beberapa kali.`,
      };
    }

    // --- 1. Baca semua file --------------------------------------------------
    const dilewati: { label: string; alasan: string }[] = [];
    const hasilPerPegawai: { namaFile: string; hasil: HasilRekapDariPdf }[] = [];
    // Laporan mentah ditampung dulu, rekapnya dihitung SETELAH penanda kendala
    // dimuat: periodenya baru diketahui setelah file dibaca, dan penanda itu
    // harus sudah ada di tangan saat kejadiannya dihitung - bukan dikurangkan
    // belakangan.
    const laporanTerbaca: { namaFile: string; laporan: LaporanPresensiPdf }[] = [];

    for (const file of files) {
      const namaFile = file.name || "(tanpa nama)";
      if (!/\.pdf$/i.test(namaFile)) {
        dilewati.push({ label: namaFile, alasan: "bukan file PDF" });
        continue;
      }
      let halaman;
      let halamanTanpaTeks = 0;
      try {
        const hasilEkstrak = await ekstrakTeksPdf(new Uint8Array(await file.arrayBuffer()));
        halaman = hasilEkstrak.halaman;
        halamanTanpaTeks = hasilEkstrak.halamanTanpaTeks;
      } catch {
        dilewati.push({ label: namaFile, alasan: "file tidak bisa dibaca sebagai PDF (rusak atau terkunci password)" });
        continue;
      }
      if (halaman.length > 0 && halamanTanpaTeks === halaman.length) {
        dilewati.push({
          label: namaFile,
          alasan: "PDF tidak memuat teks sama sekali - kemungkinan hasil scan/foto, bukan export langsung dari e-Presensi",
        });
        continue;
      }

      const parsed = parsePdfPresensi(halaman);
      if (parsed.error) {
        dilewati.push({ label: namaFile, alasan: parsed.error });
        if (parsed.laporan.length === 0) continue;
      }
      for (const laporan of parsed.laporan) {
        laporanTerbaca.push({ namaFile, laporan });
      }
    }

    // --- 1b. Penanda kendala e-Presensi (Pasal 10 ayat (2)) ------------------
    // Satu batch boleh memuat periode campuran, jadi penandanya dimuat per
    // periode dan di-cache - biasanya cuma satu atau dua.
    const kendalaPerPeriode = new Map<string, Awaited<ReturnType<typeof muatKendalaPeriode>>>();
    const koreksiPerPeriode = new Map<string, Awaited<ReturnType<typeof muatKoreksiPeriode>>>();
    const liburPerPeriode = new Map<string, Awaited<ReturnType<typeof muatHariLiburPeriode>>>();
    for (const { laporan } of laporanTerbaca) {
      if (laporan.periodeBulan === null || laporan.periodeTahun === null) continue;
      const kunci = `${laporan.periodeBulan}-${laporan.periodeTahun}`;
      if (!kendalaPerPeriode.has(kunci)) {
        kendalaPerPeriode.set(kunci, await muatKendalaPeriode(prisma, laporan.periodeBulan, laporan.periodeTahun));
        koreksiPerPeriode.set(kunci, await muatKoreksiPeriode(prisma, laporan.periodeBulan, laporan.periodeTahun));
        liburPerPeriode.set(kunci, await muatHariLiburPeriode(laporan.periodeBulan, laporan.periodeTahun));
      }
    }
    for (const { namaFile, laporan } of laporanTerbaca) {
      const kunci =
        laporan.periodeBulan !== null && laporan.periodeTahun !== null
          ? `${laporan.periodeBulan}-${laporan.periodeTahun}`
          : null;
      const kendala = kunci ? kendalaPerPeriode.get(kunci) : undefined;
      const koreksi = kunci ? koreksiPerPeriode.get(kunci) : undefined;
      const tanggalKendala = kendala && laporan.nip ? kendala.untukNip(laporan.nip) : undefined;
      const koreksiJam = koreksi && laporan.nip ? koreksi.untukNip(laporan.nip) : undefined;
      hasilPerPegawai.push({
        namaFile,
        hasil: rekapDariLaporanPdf(
          laporan,
          JADWAL_KERJA_DEFAULT,
          tanggalKendala,
          koreksiJam,
          liburPerPeriode.get(`${laporan.periodeBulan}-${laporan.periodeTahun}`) ?? new Map()
        ),
      });
    }

    if (hasilPerPegawai.length === 0) {
      return {
        error: "Tidak ada laporan presensi yang bisa dibaca dari file yang diupload.",
        dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
        jumlahFileDiproses: files.length,
      };
    }

    // --- 2. Cocokkan NIP ke data Pegawai & cek kewenangan --------------------
    const nipUnik = [...new Set(hasilPerPegawai.map((h) => h.hasil.nip).filter((n): n is string => Boolean(n)))];
    const pegawaiList = await prisma.pegawai.findMany({
      where: { nip: { in: nipUnik } },
      select: { id: true, nip: true, nama: true, satuanKerja: true },
    });
    const petaPegawai = new Map(pegawaiList.map((p) => [p.nip, p]));

    interface SiapSimpan {
      pegawaiId: string;
      nip: string;
      nama: string;
      satuanKerja: string;
      periodeBulan: number;
      periodeTahun: number;
      namaFile: string;
      hasil: HasilRekapDariPdf;
    }
    const siapSimpan: SiapSimpan[] = [];
    // Kunci pegawai+periode: kalau satu batch memuat orang yang sama dua kali
    // (mis. file per-pegawai dan file gabungan ikut terupload), yang belakangan
    // menang - dan itu diberitahukan, bukan didiamkan.
    const sudahAda = new Map<string, number>();

    for (const { namaFile, hasil } of hasilPerPegawai) {
      const label = `${hasil.nip ?? hasil.nama ?? "?"} (${namaFile})`;
      if (!hasil.nip) {
        dilewati.push({ label, alasan: "NIP tidak terbaca di kepala laporan" });
        continue;
      }
      if (hasil.periodeBulan === null || hasil.periodeTahun === null) {
        dilewati.push({ label, alasan: "periode (bulan & tahun) tidak terbaca di judul laporan" });
        continue;
      }
      if (hasil.hari.length === 0) {
        dilewati.push({ label, alasan: "tidak ada satu pun baris presensi harian yang terbaca" });
        continue;
      }
      const pegawai = petaPegawai.get(hasil.nip);
      if (!pegawai) {
        dilewati.push({ label, alasan: "NIP tidak ditemukan di data Pegawai Gajihub" });
        continue;
      }
      if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja)) {
        dilewati.push({ label, alasan: `di luar kewenangan kamu (pegawai ${pegawai.satuanKerja})` });
        continue;
      }

      const kunci = `${pegawai.id}|${hasil.periodeBulan}|${hasil.periodeTahun}`;
      const sebelumnya = sudahAda.get(kunci);
      if (sebelumnya !== undefined) {
        dilewati.push({
          label,
          alasan: "pegawai & periode yang sama muncul lebih dari sekali di batch ini - dipakai yang terakhir",
        });
        siapSimpan[sebelumnya] = {
          ...siapSimpan[sebelumnya],
          namaFile,
          hasil,
        };
        continue;
      }
      sudahAda.set(kunci, siapSimpan.length);
      siapSimpan.push({
        pegawaiId: pegawai.id,
        nip: pegawai.nip,
        nama: pegawai.nama,
        satuanKerja: pegawai.satuanKerja,
        periodeBulan: hasil.periodeBulan,
        periodeTahun: hasil.periodeTahun,
        namaFile,
        hasil,
      });
    }

    if (siapSimpan.length === 0) {
      return {
        error: "Tidak ada data yang bisa disimpan - semua dilewati, lihat alasannya di bawah.",
        dilewati: kelompokkanAlasan(dilewati),
        jumlahFileDiproses: files.length,
      };
    }

    // --- 3. Simpan -----------------------------------------------------------
    // Dua tabel sekaligus:
    //  - RekapPresensiPeriode = angka bulanan yang dipakai kalkulasi Tukin,
    //    uang makan, dan uang lembur (jalur yang sudah ada, tidak diubah).
    //  - PresensiHarian = rincian per hari, supaya pertanyaan "kenapa potongan
    //    saya segini" bisa dijawab per tanggal, bukan cuma angka total.
    for (let i = 0; i < siapSimpan.length; i += UKURAN_BATCH) {
      const potongan = siapSimpan.slice(i, i + UKURAN_BATCH);
      await prisma.$transaction(async (tx) => {
        for (const s of potongan) {
          const d = s.hasil.rekap;
          const isi = {
            jumlahHariAlpha: d.jumlahHariAlpha,
            jumlahTidakPresensi: d.jumlahTidakPresensi,
            totalMenitTerlambat: d.totalMenitTerlambat,
            totalMenitPulangCepat: d.totalMenitPulangCepat,
            totalMenitMeninggalkanKantor: d.totalMenitMeninggalkanKantor,
            // `totalMenitKekuranganJamKerja` SENGAJA TIDAK ditulis - PDF tidak
            // punya angkanya secara terpisah, dan dengan menghilangkannya dari
            // update, nilai yang pernah diisi manual lewat template tidak
            // ter-reset tiap kali PDF diupload ulang. Lihat catatan yang sama
            // di simpanRekapPresensi.ts.
            jumlahTidakIkutUpacara: d.jumlahTidakIkutUpacara,
            jumlahHariKerja: d.jumlahHariKerja,
            jumlahHariHadir: d.jumlahHariHadir,
            jumlahHariWfo: d.jumlahHariWfo,
            jumlahHariWfhWfa: d.jumlahHariWfhWfa,
            jumlahHariDiklat: d.jumlahHariDiklat,
            jumlahHariDinasLuar: d.jumlahHariDinasLuar,
            jumlahHariTugasBelajar: d.jumlahHariTugasBelajar,
            jenisCutiAktif: d.jenisCutiAktif,
            jumlahHariCuti: d.jumlahHariCuti,
            // `bulanCutiKeberapa` sengaja tidak ditulis - lihat catatan yang
            // sama di simpanRekapPresensi.ts.
            totalJamLembur: d.totalJamLembur,
            totalJamLemburHariLibur: d.totalJamLemburHariLibur,
            jumlahHariMakanLembur: d.jumlahHariMakanLembur,
            jumlahHariMakanLemburHariLibur: d.jumlahHariMakanLemburHariLibur,
            sourceSystem: "e-Presensi (PDF)",
            sourceFileName: s.namaFile,
            diunggahOlehId: user.id,
          };
          await tx.rekapPresensiPeriode.upsert({
            where: {
              pegawaiId_periodeBulan_periodeTahun: {
                pegawaiId: s.pegawaiId,
                periodeBulan: s.periodeBulan,
                periodeTahun: s.periodeTahun,
              },
            },
            create: { pegawaiId: s.pegawaiId, periodeBulan: s.periodeBulan, periodeTahun: s.periodeTahun, ...isi },
            update: { ...isi, diunggahPada: new Date() },
          });

          // Hapus dulu sebulan penuh, baru tulis ulang. Kalau cuma upsert per
          // tanggal, hari yang HILANG dari file baru (mis. baris ganda yang
          // sekarang dibuang) akan tertinggal sebagai data basi.
          const awal = new Date(Date.UTC(s.periodeTahun, s.periodeBulan - 1, 1));
          const akhir = new Date(Date.UTC(s.periodeTahun, s.periodeBulan, 1));
          await tx.presensiHarian.deleteMany({
            where: { pegawaiId: s.pegawaiId, tanggal: { gte: awal, lt: akhir } },
          });
          await tx.presensiHarian.createMany({
            data: s.hasil.hari
              // Hari di luar periode judulnya diabaikan - tidak pernah terjadi
              // di file uji, tapi kalau terjadi jangan sampai menimpa bulan lain.
              .filter((h) => tanggalUtc(h.tanggalIso) >= awal && tanggalUtc(h.tanggalIso) < akhir)
              .map((h) => ({
                pegawaiId: s.pegawaiId,
                tanggal: tanggalUtc(h.tanggalIso),
                jamMasuk: menitKeWaktu(h.tanggalIso, h.jamMasukMenit),
                jamKeluar: menitKeWaktu(h.tanggalIso, h.jamKeluarMenit),
                statusKehadiran: STATUS_HARIAN[h.kategori] ?? "TIDAK_DIKENALI",
                menitTerlambat: h.menitTerlambat,
                menitPulangCepat: h.menitPulangCepat,
                menitMeninggalkanKantor: 0,
                tidakIkutUpacara: false,
                // Sama dengan jalur sinkronisasi - lihat catatan di
                // src/jobs/simpanRekapPresensi.ts.
                jamLembur: h.jamLembur,
                sourceSystem: "e-Presensi (PDF)",
                sourceSyncedAt: new Date(),
              })),
          });
        }
      });
    }

    // --- 4. Laporkan ---------------------------------------------------------
    const perluHitungUlang = await prisma.tukinCalculation.count({
      where: {
        OR: siapSimpan.map((s) => ({
          pegawaiId: s.pegawaiId,
          periodeBulan: s.periodeBulan,
          periodeTahun: s.periodeTahun,
        })),
      },
    });

    const perPeriodeMap = new Map<string, { periodeBulan: number; periodeTahun: number; jumlahPegawai: number }>();
    for (const s of siapSimpan) {
      const k = `${s.periodeTahun}-${s.periodeBulan}`;
      const ada = perPeriodeMap.get(k);
      if (ada) ada.jumlahPegawai++;
      else perPeriodeMap.set(k, { periodeBulan: s.periodeBulan, periodeTahun: s.periodeTahun, jumlahPegawai: 1 });
    }

    await prisma.auditTrail.create({
      data: {
        entitas: "rekap_presensi_periode",
        entitasId: [...perPeriodeMap.values()].map((p) => `${p.periodeBulan}/${p.periodeTahun}`).join(", "),
        aksi: "CREATE",
        aktor: user.nip,
        dataSesudah: {
          jumlahFile: files.length,
          jumlahPegawaiTersimpan: siapSimpan.length,
          jumlahDilewati: dilewati.length,
          periode: [...perPeriodeMap.values()].map((p) => `${p.periodeBulan}/${p.periodeTahun}`),
          sumber: "Upload PDF Laporan Detail Presensi Harian (e-Presensi)",
        },
      },
    });

    revalidatePath("/tukin/presensi");
    revalidatePath("/tukin");

    const pegawaiRingkas: RingkasanPegawaiPdf[] = siapSimpan.slice(0, MAKS_DETAIL_DITAMPILKAN).map((s) => ({
      nip: s.nip,
      nama: s.nama,
      satuanKerja: s.satuanKerja,
      periodeBulan: s.periodeBulan,
      periodeTahun: s.periodeTahun,
      namaFile: s.namaFile,
      jumlahHariKerja: s.hasil.rekap.jumlahHariKerja,
      jumlahHariWfo: s.hasil.rekap.jumlahHariWfo,
      jumlahHariWfhWfa: s.hasil.rekap.jumlahHariWfhWfa,
      jumlahHariDinasLuar: s.hasil.rekap.jumlahHariDinasLuar,
      jumlahHariDiklat: s.hasil.rekap.jumlahHariDiklat,
      jumlahHariAlpha: s.hasil.rekap.jumlahHariAlpha,
      jumlahTidakPresensi: s.hasil.rekap.jumlahTidakPresensi,
      totalMenitTerlambat: s.hasil.rekap.totalMenitTerlambat,
      totalMenitPulangCepat: s.hasil.rekap.totalMenitPulangCepat,
      totalJamLembur: s.hasil.rekap.totalJamLembur,
      totalJamLemburHariLibur: s.hasil.rekap.totalJamLemburHariLibur,
      jumlahHariDetail: s.hasil.hari.length,
      catatan: s.hasil.catatan,
      selisihRingkasan: s.hasil.selisihRingkasan,
    }));

    return {
      success: `${siapSimpan.length} pegawai tersimpan dari ${files.length} file PDF.`,
      jumlahPegawaiTersimpan: siapSimpan.length,
      jumlahFileDiproses: files.length,
      perPeriode: [...perPeriodeMap.values()].sort(
        (a, b) => b.periodeTahun - a.periodeTahun || b.periodeBulan - a.periodeBulan
      ),
      pegawai: pegawaiRingkas,
      jumlahDetailTidakDitampilkan: Math.max(0, siapSimpan.length - pegawaiRingkas.length),
      dilewati: dilewati.length > 0 ? kelompokkanAlasan(dilewati) : undefined,
      perluHitungUlang: perluHitungUlang > 0 ? perluHitungUlang : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
