// ============================================================================
// TUKIN CALCULATION ENGINE
// Referensi: Permenaker Nomor 15 Tahun 2024 tentang Pemberian Tunjangan
// Kinerja Pegawai di Lingkungan Kementerian Ketenagakerjaan
//
// Pasal yang jadi acuan langsung:
// - Pasal 5  : bobot 70% capaian kinerja + 30% kehadiran
// - Pasal 11 : dasar pemotongan atas capaian kinerja (pedoman oleh Sekjen - TODO)
// - Pasal 12 : kondisi yang menyebabkan potongan kehadiran
// - Pasal 13 : besaran potongan kehadiran (3%/hari alpha, 1%/kejadian tidak
//              presensi, 0.01%/menit terlambat, 3% tidak ikut upacara)
// - Pasal 14 : skema pembayaran tukin saat cuti (override, bukan sekadar
//              potongan kehadiran biasa)
// - Pasal 15 : potongan akibat hukuman disiplin (BELUM diimplementasi - lihat
//              TODO di bawah, perlu data dari OSDMA soal status disiplin)
// ============================================================================

import type { TukinInput, TukinResult, JenisCuti } from "../types/index";

const BOBOT_KEHADIRAN = 0.3; // Pasal 5 ayat (2) huruf b
const BOBOT_KINERJA = 0.7; // Pasal 5 ayat (2) huruf a

const POTONGAN_PER_HARI_ALPHA = 0.03; // Pasal 13 ayat (1)
const POTONGAN_PER_KEJADIAN_TIDAK_PRESENSI = 0.01; // Pasal 13 ayat (2)
const POTONGAN_PER_MENIT_TERLAMBAT = 0.0001; // Pasal 13 ayat (3) - 0,01% = 0.0001
const POTONGAN_TIDAK_IKUT_UPACARA = 0.03; // Pasal 13 ayat (4)

/**
 * Menghitung akumulasi persentase potongan komponen kehadiran sesuai Pasal 13.
 * Potongan dihitung dari BOBOT KEHADIRAN (30%), bukan dari total tukin.
 *
 * Catatan: Permenaker tidak eksplisit menyebut batas maksimum potongan
 * (bisa saja > 30% jika alpha berkali-kali dalam sebulan). Engine ini
 * meng-clamp minimum ke 0 (tidak sampai negatif), tapi TIDAK meng-clamp
 * potongan itu sendiri - flag jadi anomali jika potongan > bobot kehadiran,
 * karena kebijakan pastinya (apakah bisa "minus" ke komponen kinerja) perlu
 * dikonfirmasi ke Biro Hukum/Sekjen.
 */
export function hitungPotonganKehadiranPersen(rekap: {
  jumlahHariAlpha: number;
  jumlahTidakPresensi: number;
  totalMenitTerlambat: number;
  ikutUpacaraBendera: boolean;
}): { totalPersen: number; anomali: string[] } {
  const anomali: string[] = [];

  const potonganAlpha = rekap.jumlahHariAlpha * POTONGAN_PER_HARI_ALPHA;
  const potonganTidakPresensi =
    rekap.jumlahTidakPresensi * POTONGAN_PER_KEJADIAN_TIDAK_PRESENSI;
  const potonganTerlambat =
    rekap.totalMenitTerlambat * POTONGAN_PER_MENIT_TERLAMBAT;
  const potonganUpacara = rekap.ikutUpacaraBendera
    ? 0
    : POTONGAN_TIDAK_IKUT_UPACARA;

  const totalPersen =
    potonganAlpha + potonganTidakPresensi + potonganTerlambat + potonganUpacara;

  if (totalPersen > BOBOT_KEHADIRAN) {
    anomali.push(
      `Potongan kehadiran (${(totalPersen * 100).toFixed(2)}%) melebihi bobot kehadiran (30%) - perlu konfirmasi kebijakan apakah kelebihan potongan memotong komponen kinerja atau di-cap di 30%.`
    );
  }
  if (rekap.jumlahHariAlpha > 25) {
    anomali.push(
      `jumlahHariAlpha (${rekap.jumlahHariAlpha}) tidak wajar untuk satu periode - cek kemungkinan data presensi belum lengkap.`
    );
  }

  return { totalPersen, anomali };
}

/**
 * Pasal 14 - skema pembayaran tukin khusus saat pegawai menjalani cuti.
 * Ini OVERRIDE atas hasil kalkulasi normal 30/70, bukan potongan tambahan.
 * Mengembalikan null jika tidak ada override yang berlaku (pegawai tidak cuti,
 * atau jenis cuti yang tidak mengubah pembayaran yaitu cuti tahunan/melahirkan/
 * alasan penting/besar-kurang-1-bulan yang tetap 100%).
 *
 * TODO(legal-confirm): logika di bawah mengasumsikan `bulanKeberapa` dihitung
 * manual per pegawai (misal oleh PPABP/Biro OSDMA). Belum ada mekanisme
 * otomatis menghitung "ini bulan cuti besar/sakit yang keberapa" dari histori
 * cuti - perlu didiskusikan apakah ini ditarik dari SIAP atau diinput manual.
 */
export function hitungPersenOverrideCuti(cutiAktif?: {
  jenis: JenisCuti;
  bulanKeberapa?: number;
}): number | null {
  if (!cutiAktif) return null;

  switch (cutiAktif.jenis) {
    case "CUTI_TAHUNAN":
    case "CUTI_MELAHIRKAN_ANAK_1_2_3":
    case "CUTI_ALASAN_PENTING":
    case "CUTI_BESAR_KURANG_1_BULAN":
      return 1.0; // 100% - Pasal 14 huruf a & b

    case "CUTI_BESAR": {
      const bulan = cutiAktif.bulanKeberapa ?? 1;
      if (bulan === 1) return 0.5; // 50%
      if (bulan === 2) return 0.75; // 75%
      if (bulan >= 3) return 0.9; // 90% (bulan ketiga dan seterusnya)
      return 0.5;
    }

    case "CUTI_SAKIT": {
      const bulan = cutiAktif.bulanKeberapa ?? 1;
      if (bulan === 1) return 1.0; // 0% dipotong = 100% dibayar
      if (bulan === 2) return 0.5; // dikurangi 50%
      if (bulan === 3) return 0.25; // dikurangi 75%
      return 0; // > 3 bulan: dikurangi 100% -> tidak dibayar
    }

    case "CUTI_SAKIT_GUGUR_KANDUNGAN": {
      // Pasal 14 huruf e: 0% potongan sampai 1 bulan, lalu 1%/hari di atas
      // 1 bulan s.d. 1.5 bulan. Perhitungan harian di atas 1 bulan TIDAK
      // diimplementasi di sini (butuh input jumlah hari, bukan hanya
      // "bulan keberapa") - lempar sebagai kasus yang perlu penanganan
      // manual/terpisah untuk sementara.
      return 1.0; // asumsi default masih dalam bulan pertama
    }

    default:
      return null;
  }
}

/**
 * Fungsi utama: hitung tukin bersih satu pegawai untuk satu periode.
 * Pure function - tidak melakukan I/O, tidak bergantung pada database,
 * supaya gampang di-unit-test dan di-reuse baik di batch job maupun
 * simulasi/preview di dashboard approval.
 */
export function hitungTukin(input: TukinInput): TukinResult {
  const anomali: string[] = [];

  const bobotKehadiran = input.tukinPokokKelasJabatan * BOBOT_KEHADIRAN;
  const bobotKinerja = input.tukinPokokKelasJabatan * BOBOT_KINERJA;

  // --- Capaian kinerja (Pasal 5 huruf a, Pasal 6) ---
  const nilaiKinerja = input.capaianKinerja.nilaiCapaianKinerjaPersen;
  if (nilaiKinerja < 0 || nilaiKinerja > 100) {
    anomali.push(
      `nilaiCapaianKinerjaPersen (${nilaiKinerja}) di luar rentang wajar 0-100.`
    );
  }
  const komponenKinerja = bobotKinerja * (Math.max(0, Math.min(100, nilaiKinerja)) / 100);

  // --- Kehadiran (Pasal 12, 13) ---
  const { totalPersen: potonganKehadiranPersen, anomali: anomaliKehadiran } =
    hitungPotonganKehadiranPersen(input.rekapKehadiran);
  anomali.push(...anomaliKehadiran);

  const persenKehadiranEfektif = Math.max(0, BOBOT_KEHADIRAN - potonganKehadiranPersen);
  const komponenKehadiranSetelahPotongan =
    input.tukinPokokKelasJabatan * persenKehadiranEfektif;

  let tukinPokok = komponenKehadiranSetelahPotongan + komponenKinerja;

  // --- Override cuti (Pasal 14) - berlaku atas TOTAL tukin, bukan cuma kehadiran ---
  const persenOverrideCuti = hitungPersenOverrideCuti(input.rekapKehadiran.cutiAktif);
  const overrideCutiDiterapkan = persenOverrideCuti !== null;
  if (overrideCutiDiterapkan) {
    tukinPokok = input.tukinPokokKelasJabatan * (persenOverrideCuti as number);
    anomali.push(
      `Override Pasal 14 diterapkan untuk cuti jenis ${input.rekapKehadiran.cutiAktif?.jenis} (${((persenOverrideCuti as number) * 100).toFixed(0)}% dari tukin pokok kelas jabatan).`
    );
  }

  // TODO(Pasal 15): potongan hukuman disiplin tingkat sedang BELUM
  // diimplementasi - butuh feed data status disiplin pegawai dari OSDMA/SIAP
  // yang saat ini belum masuk ruang lingkup data requirement yang diajukan.

  const potonganPph = input.tarifPphEfektif
    ? tukinPokok * input.tarifPphEfektif
    : 0;
  const tukinBersih = tukinPokok - potonganPph;

  if (tukinBersih < 0) {
    anomali.push("Hasil tukinBersih negatif - data input perlu diperiksa ulang.");
  }

  return {
    pegawaiId: input.pegawaiId,
    periodeBulan: input.periodeBulan,
    periodeTahun: input.periodeTahun,
    bobotKehadiran,
    bobotKinerja,
    potonganKehadiranPersen,
    komponenKehadiranSetelahPotongan,
    komponenKinerja,
    tukinPokok,
    overrideCutiDiterapkan,
    potonganPph,
    tukinBersih: Math.max(0, tukinBersih),
    anomali,
  };
}
