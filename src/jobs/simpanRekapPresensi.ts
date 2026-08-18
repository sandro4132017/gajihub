// ============================================================================
// Penulis hasil analisis presensi ke database Gajihub.
//
// DIPAKAI BARENG oleh dua jalur tarik dari e-Presensi:
//   - tombol "Tarik data presensi" di /tukin/presensi (Server Action)
//   - src/jobs/importPresensiEpresensi.ts (CLI)
//
// Jalur upload PDF (actionsPdf.ts) menulis dengan cara yang SAMA PERSIS, cuma
// belum diarahkan ke sini karena dia menulis banyak pegawai dalam SATU
// transaksi besar per file. TODO(confirm): kalau nanti disatukan, pastikan
// perilaku transaksinya tidak berubah - bukan sekadar memanggil fungsi ini
// dalam loop.
// ============================================================================

import type { PrismaClient } from "@prisma/client";
import type { HasilRekapDariPdf } from "../business-logic/presensiPdfKeRekap";
import { STATUS_HARIAN, tanggalUtc, menitKeWaktu } from "../business-logic/presensiKeDb";

export interface ParamSimpanPresensi {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  hasil: HasilRekapDariPdf;
  /** Penanggung jawab tarikan - WAJIB, ini yang dilihat kalau angkanya dipertanyakan. */
  diunggahOlehId: string;
  sourceSystem: string;
}

export async function simpanHasilPresensi(
  prisma: PrismaClient,
  { pegawaiId, periodeBulan, periodeTahun, hasil, diunggahOlehId, sourceSystem }: ParamSimpanPresensi
): Promise<void> {
  const d = hasil.rekap;
  const isi = {
    jumlahHariAlpha: d.jumlahHariAlpha,
    jumlahTidakPresensi: d.jumlahTidakPresensi,
    totalMenitTerlambat: d.totalMenitTerlambat,
    totalMenitPulangCepat: d.totalMenitPulangCepat,
    totalMenitMeninggalkanKantor: d.totalMenitMeninggalkanKantor,
    // `totalMenitKekuranganJamKerja` SENGAJA TIDAK ditulis di sini. Tarikan
    // e-Presensi tidak punya angkanya (kekurangan jam kerja di sana adalah
    // akibat dari terlambat & pulang cepat yang sudah dihitung per hari), dan
    // dengan tidak menyertakannya, nilai yang pernah diisi manual lewat
    // template TIDAK ikut ter-reset jadi 0 setiap kali sinkronisasi diulang.
    // Baris baru tetap dapat 0 dari DEFAULT kolomnya.
    jumlahTidakIkutUpacara: d.jumlahTidakIkutUpacara,
    jumlahHariKerja: d.jumlahHariKerja,
    jumlahHariHadir: d.jumlahHariHadir,
    jumlahHariWfo: d.jumlahHariWfo,
    jumlahHariWfhWfa: d.jumlahHariWfhWfa,
    jumlahHariDiklat: d.jumlahHariDiklat,
    jumlahHariDinasLuar: d.jumlahHariDinasLuar,
    // Ditulis dari sumber otomatis (beda dari totalMenitKekuranganJamKerja di
    // atas) - e-Presensi memang mencatat status "Tugas Belajar" per hari, jadi
    // angkanya nyata, bukan turunan dari kolom lain.
    jumlahHariTugasBelajar: d.jumlahHariTugasBelajar,
    jenisCutiAktif: d.jenisCutiAktif,
    jumlahHariCuti: d.jumlahHariCuti,
    // `bulanCutiKeberapa` ditulis HANYA kalau sumbernya benar-benar
    // menyebutkannya (mis. jenis cuti "Cuti Besar II" di e-Presensi).
    //
    // Kalau hasilnya null, kolomnya sengaja TIDAK disertakan sama sekali -
    // bukan ditulis null. Bedanya penting: null berarti "tidak diketahui dari
    // sumber ini", dan menuliskannya akan MENGHAPUS angka yang sudah pernah
    // diisi manual lewat template setiap kali sinkronisasi diulang. Baris
    // baru tetap dapat null dari kolomnya sendiri.
    ...(d.bulanCutiKeberapa !== null ? { bulanCutiKeberapa: d.bulanCutiKeberapa } : {}),
    totalJamLembur: d.totalJamLembur,
    totalJamLemburHariLibur: d.totalJamLemburHariLibur,
    jumlahHariMakanLembur: d.jumlahHariMakanLembur,
    jumlahHariMakanLemburHariLibur: d.jumlahHariMakanLemburHariLibur,
    sourceSystem,
    sourceFileName: null,
    diunggahOlehId,
  };

  const awal = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhir = new Date(Date.UTC(periodeTahun, periodeBulan, 1));

  await prisma.$transaction(async (tx) => {
    await tx.rekapPresensiPeriode.upsert({
      where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan, periodeTahun } },
      create: { pegawaiId, periodeBulan, periodeTahun, ...isi },
      update: { ...isi, diunggahPada: new Date() },
    });

    // Hapus sebulan penuh lalu tulis ulang - alasannya sama dengan jalur PDF:
    // hari yang HILANG dari tarikan baru (mis. baris ganda yang sekarang
    // dibuang) tidak boleh tertinggal sebagai data basi.
    await tx.presensiHarian.deleteMany({ where: { pegawaiId, tanggal: { gte: awal, lt: akhir } } });
    await tx.presensiHarian.createMany({
      data: hasil.hari
        .filter((h) => tanggalUtc(h.tanggalIso) >= awal && tanggalUtc(h.tanggalIso) < akhir)
        .map((h) => ({
          pegawaiId,
          tanggal: tanggalUtc(h.tanggalIso),
          jamMasuk: menitKeWaktu(h.tanggalIso, h.jamMasukMenit),
          jamKeluar: menitKeWaktu(h.tanggalIso, h.jamKeluarMenit),
          statusKehadiran: STATUS_HARIAN[h.kategori] ?? "TIDAK_DIKENALI",
          menitTerlambat: h.menitTerlambat,
          menitPulangCepat: h.menitPulangCepat,
          menitMeninggalkanKantor: 0,
          tidakIkutUpacara: false,
          // Dipakai export ADK Uang Lembur (formatnya per tanggal). Angkanya
          // sudah dihitung sejak awal, cuma dulu tidak ada tempat menyimpannya.
          jamLembur: h.jamLembur,
          sourceSystem,
          sourceSyncedAt: new Date(),
        })),
    });
  });
}
