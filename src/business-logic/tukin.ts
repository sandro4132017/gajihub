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
//              presensi, 0.01%/menit terlambat-pulang cepat-meninggalkan
//              kantor, 3%/kejadian tidak ikut upacara) - SEMUA dihitung dari
//              BOBOT KEHADIRAN (30%), bukan dari total tukin
// - Pasal 14 : skema pembayaran tukin saat cuti - berlaku atas TOTAL tukin
//              (override), BUKAN cuma komponen kehadiran. Bedakan baik-baik
//              dengan Pasal 13; teksnya juga ditulis sebagai "dikurangi X%",
//              jadi X adalah potongan, bukan yang dibayar.
// - Pasal 15 : potongan akibat hukuman disiplin (BELUM diimplementasi - lihat
//              TODO di bawah, perlu data dari OSDMA soal status disiplin)
// ============================================================================

import type {
  TukinInput,
  TukinResult,
  JenisCuti,
  RincianPotonganKehadiran,
} from "../types/index";

const BOBOT_KEHADIRAN = 0.3; // Pasal 5 ayat (2) huruf b
const BOBOT_KINERJA = 0.7; // Pasal 5 ayat (2) huruf a

const POTONGAN_PER_HARI_ALPHA = 0.03; // Pasal 13 ayat (1)
const POTONGAN_PER_KEJADIAN_TIDAK_PRESENSI = 0.01; // Pasal 13 ayat (2)
const POTONGAN_PER_MENIT = 0.0001; // Pasal 13 ayat (3) - 0,01% = 0.0001
const POTONGAN_PER_KEJADIAN_TIDAK_UPACARA = 0.03; // Pasal 13 ayat (4)

/** Input potongan kehadiran - subset RekapKehadiranPeriode yang dipakai Pasal 13. */
export interface InputPotonganKehadiran {
  jumlahHariAlpha: number;
  jumlahTidakPresensi: number;
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  jumlahTidakIkutUpacara: number;
}

/**
 * Menghitung akumulasi persentase potongan komponen kehadiran sesuai Pasal 13.
 *
 * SEMUA potongan di Pasal 13 dihitung dari BOBOT KEHADIRAN (30%), BUKAN dari
 * total tukin - ini eksplisit di teks tiap ayatnya ("...dari bobot
 * kehadiran"). Bedakan dengan Pasal 14 (cuti) yang memotong TOTAL Tunjangan
 * Kinerja, lihat hitungPersenDibayarCuti().
 *
 * Tarif per Permenaker 15/2024:
 * | Jenis pelanggaran                        | Tarif   | Dasar             |
 * |------------------------------------------|---------|-------------------|
 * | Tidak hadir tanpa keterangan sah         | 3%/hari | Pasal 13 ayat (1) |
 * | Tidak presensi masuk atau pulang         | 1%/kali | Pasal 13 ayat (2) |
 * | Terlambat hadir                          | 0,01%/menit | Pasal 13 ayat (3) |
 * | Pulang lebih awal                        | 0,01%/menit | Pasal 13 ayat (3) |
 * | Meninggalkan kantor tanpa izin           | 0,01%/menit | Pasal 13 ayat (3) |
 * | Tidak ikut upacara bendera tanpa alasan  | 3%/kali | Pasal 13 ayat (4) |
 *
 * Catatan: Permenaker tidak eksplisit menyebut batas maksimum potongan
 * (bisa saja > 30% jika alpha berkali-kali dalam sebulan). Engine ini
 * meng-clamp minimum ke 0 (tidak sampai negatif), tapi TIDAK meng-clamp
 * potongan itu sendiri - flag jadi anomali jika potongan > bobot kehadiran,
 * karena kebijakan pastinya (apakah bisa "minus" ke komponen kinerja) perlu
 * dikonfirmasi ke Biro Hukum/Sekjen.
 */
export function hitungPotonganKehadiranPersen(rekap: InputPotonganKehadiran): {
  totalPersen: number;
  rincian: RincianPotonganKehadiran[];
  anomali: string[];
} {
  const anomali: string[] = [];

  const baris = (
    jenis: string,
    dasarHukum: string,
    jumlah: number,
    satuan: string,
    tarifPersen: number
  ): RincianPotonganKehadiran => ({
    jenis,
    dasarHukum,
    jumlah,
    satuan,
    tarifPersen,
    totalPersen: jumlah * tarifPersen,
  });

  const semuaBaris: RincianPotonganKehadiran[] = [
    baris("Tidak hadir kerja tanpa keterangan yang sah", "Pasal 13 ayat (1)", rekap.jumlahHariAlpha, "hari", POTONGAN_PER_HARI_ALPHA),
    baris("Tidak melakukan presensi masuk atau pulang", "Pasal 13 ayat (2)", rekap.jumlahTidakPresensi, "kejadian", POTONGAN_PER_KEJADIAN_TIDAK_PRESENSI),
    baris("Terlambat hadir", "Pasal 13 ayat (3)", rekap.totalMenitTerlambat, "menit", POTONGAN_PER_MENIT),
    baris("Pulang lebih awal", "Pasal 13 ayat (3)", rekap.totalMenitPulangCepat, "menit", POTONGAN_PER_MENIT),
    baris("Meninggalkan kantor tanpa izin", "Pasal 13 ayat (3)", rekap.totalMenitMeninggalkanKantor, "menit", POTONGAN_PER_MENIT),
    baris("Tidak mengikuti upacara bendera tanpa alasan yang sah", "Pasal 13 ayat (4)", rekap.jumlahTidakIkutUpacara, "kejadian", POTONGAN_PER_KEJADIAN_TIDAK_UPACARA),
  ];

  // Baris yang jumlahnya 0 tetap DIHITUNG (nol) tapi tidak ikut dikembalikan -
  // supaya UI tidak penuh baris kosong buat pegawai yang kehadirannya bersih.
  const rincian = semuaBaris.filter((r) => r.jumlah !== 0);
  const totalPersen = semuaBaris.reduce((a, r) => a + r.totalPersen, 0);

  if (semuaBaris.some((r) => r.jumlah < 0)) {
    anomali.push("Ada komponen potongan kehadiran bernilai negatif - data presensi perlu diperiksa ulang.");
  }
  // totalPersen adalah pecahan DARI BOBOT KEHADIRAN, jadi batas "habis"-nya
  // adalah 1 (100% bobot kehadiran), bukan 0,3.
  if (totalPersen > 1) {
    anomali.push(
      `Potongan kehadiran (${(totalPersen * 100).toFixed(2)}% dari bobot kehadiran) melebihi seluruh komponen kehadiran - perlu konfirmasi kebijakan apakah kelebihan potongan ikut memotong komponen kinerja atau di-cap habis di komponen kehadiran saja.`
    );
  }
  if (rekap.jumlahHariAlpha > 25) {
    anomali.push(
      `jumlahHariAlpha (${rekap.jumlahHariAlpha}) tidak wajar untuk satu periode - cek kemungkinan data presensi belum lengkap.`
    );
  }

  return { totalPersen, rincian, anomali };
}

/**
 * Pasal 14 - skema pembayaran tukin khusus saat pegawai menjalani cuti.
 * Ini OVERRIDE atas hasil kalkulasi normal 30/70, bukan potongan tambahan,
 * dan berlaku atas TOTAL Tunjangan Kinerja - BUKAN cuma komponen kehadiran
 * (bandingkan Pasal 13 yang eksplisit "dari bobot kehadiran").
 *
 * Mengembalikan persen yang DIBAYARKAN (1.0 = 100% dibayar), atau null kalau
 * pegawai tidak sedang cuti.
 *
 * PENTING - cara baca pasalnya. Pasal 14 huruf c & d menulis besaran sebagai
 * "Tunjangan Kinerja dibayarkan setelah DIKURANGI persentase sebesar X%",
 * jadi X itu POTONGAN, bukan yang dibayar. Makanya tabel di bawah menyimpan
 * angka POTONGAN persis seperti bunyi pasalnya, lalu yang dibayar diturunkan
 * dengan `1 - potongan`.
 *
 * Ini memperbaiki bug nyata: implementasi sebelumnya mengembalikan 0.75 dan
 * 0.9 untuk cuti besar bulan kedua & ketiga, yaitu membaca "dikurangi 75%"
 * sebagai "dibayar 75%". Efeknya terbalik - makin lama cuti besar, tukin yang
 * dibayar justru makin BESAR (50% -> 75% -> 90%), padahal seharusnya makin
 * kecil (50% -> 25% -> 10%). Cuti sakit di fungsi yang sama sudah benar sejak
 * awal, jadi keduanya sempat tidak konsisten padahal kalimat pasalnya sama.
 */
const POTONGAN_CUTI_BESAR_PER_BULAN = [0.5, 0.75, 0.9]; // Pasal 14 huruf c
const POTONGAN_CUTI_SAKIT_PER_BULAN = [0, 0.5, 0.75]; // Pasal 14 huruf d angka 1-3
const POTONGAN_CUTI_SAKIT_LEBIH_3_BULAN = 1.0; // Pasal 14 huruf d angka 4
const POTONGAN_GUGUR_KANDUNGAN_PER_HARI = 0.01; // Pasal 14 huruf e angka 2

/** Ambil potongan bertingkat per bulan; bulan di luar tabel pakai nilai terakhir. */
function potonganBertingkat(tabel: number[], bulanKeberapa: number, potonganSetelahTabel: number): number {
  if (bulanKeberapa <= 0) return tabel[0];
  if (bulanKeberapa <= tabel.length) return tabel[bulanKeberapa - 1];
  return potonganSetelahTabel;
}

export function hitungPersenDibayarCuti(cutiAktif?: {
  jenis: JenisCuti;
  bulanKeberapa?: number;
  jumlahHariCuti?: number;
}): { persenDibayar: number; anomali: string[] } | null {
  if (!cutiAktif) return null;
  const anomali: string[] = [];
  const bulan = cutiAktif.bulanKeberapa ?? 1;

  switch (cutiAktif.jenis) {
    // Pasal 14 huruf a & b - dibayar penuh, tidak ada potongan.
    case "CUTI_TAHUNAN":
    case "CUTI_MELAHIRKAN_ANAK_1_2_3":
    case "CUTI_ALASAN_PENTING":
    case "CUTI_BESAR_KURANG_1_BULAN":
      return { persenDibayar: 1.0, anomali };

    // Pasal 14 huruf c - dikurangi 50% / 75% / 90% pada bulan ke-1/2/3.
    case "CUTI_BESAR": {
      if (bulan > POTONGAN_CUTI_BESAR_PER_BULAN.length) {
        // Cuti besar maksimal 3 bulan menurut ketentuan cuti PNS; pasal ini
        // tidak mengatur bulan ke-4 dst. Dipakai potongan bulan ketiga dan
        // ditandai supaya tidak lewat diam-diam.
        anomali.push(
          `Cuti besar bulan ke-${bulan} tidak diatur di Pasal 14 huruf c (hanya bulan 1-3) - dipakai potongan bulan ketiga (90%). Perlu konfirmasi Biro Hukum/OSDMA.`
        );
      }
      const potongan = potonganBertingkat(POTONGAN_CUTI_BESAR_PER_BULAN, bulan, 0.9);
      return { persenDibayar: 1 - potongan, anomali };
    }

    // Pasal 14 huruf d - 0% / 50% / 75%, dan 100% kalau lebih dari 3 bulan.
    case "CUTI_SAKIT": {
      const potongan = potonganBertingkat(
        POTONGAN_CUTI_SAKIT_PER_BULAN,
        bulan,
        POTONGAN_CUTI_SAKIT_LEBIH_3_BULAN
      );
      return { persenDibayar: 1 - potongan, anomali };
    }

    // Pasal 14 huruf e - 0% s.d. 1 bulan; di atas 1 bulan s.d. 1,5 bulan
    // dipotong 1% PER HARI. Satu-satunya ketentuan cuti yang tarifnya harian.
    case "CUTI_SAKIT_GUGUR_KANDUNGAN": {
      const hari = cutiAktif.jumlahHariCuti;
      if (hari === undefined) {
        // Tidak menebak: tanpa jumlah hari, potongan harian tidak bisa
        // dihitung. Dibayar penuh (perlakuan bulan pertama) TAPI ditandai.
        anomali.push(
          "Cuti sakit gugur kandungan: jumlah hari cuti tidak diisi, jadi potongan 1%/hari (Pasal 14 huruf e angka 2) TIDAK dapat dihitung - sementara diperlakukan sebagai cuti sampai dengan 1 bulan (dibayar penuh). Isi jumlah hari cuti kalau lebih dari 1 bulan."
        );
        return { persenDibayar: 1.0, anomali };
      }

      // "sampai dengan 1 bulan" - dipakai 30 hari sebagai 1 bulan.
      // TODO(confirm): pasal tidak menyebut definisi 1 bulan dalam hari
      // (30 hari? bulan kalender berjalan?). 30 hari dipilih karena batas
      // atasnya disebut "1,5 bulan" yang praktis = 45 hari.
      const HARI_PER_BULAN = 30;
      const BATAS_HARI = 45; // 1,5 bulan

      if (hari <= HARI_PER_BULAN) return { persenDibayar: 1.0, anomali };

      if (hari > BATAS_HARI) {
        anomali.push(
          `Cuti sakit gugur kandungan ${hari} hari melebihi 1,5 bulan (45 hari) - Pasal 14 huruf e tidak mengatur di atas itu. Potongan dihitung sampai batas 45 hari saja, perlu konfirmasi Biro Hukum/OSDMA.`
        );
      }

      const hariDihitung = Math.min(hari, BATAS_HARI);
      const hariDiAtasSatuBulan = hariDihitung - HARI_PER_BULAN;
      const potongan = hariDiAtasSatuBulan * POTONGAN_GUGUR_KANDUNGAN_PER_HARI;
      return { persenDibayar: Math.max(0, 1 - potongan), anomali };
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
  const {
    totalPersen: potonganKehadiranPersen,
    rincian: rincianPotonganKehadiran,
    anomali: anomaliKehadiran,
  } = hitungPotonganKehadiranPersen(input.rekapKehadiran);
  anomali.push(...anomaliKehadiran);

  // Potongan Pasal 13 adalah persentase DARI BOBOT KEHADIRAN, jadi dikalikan
  // ke nilai rupiah bobot kehadiran - BUKAN dikurangkan dari angka 0,3.
  //
  // Ini memperbaiki bug: implementasi lama menghitung
  // `tukinPokok x (0.30 - potongan)`, yang berarti potongan 3% dikurangkan
  // dalam satuan yang sama dengan 0,30 alias 3% dari TOTAL tukin - persis
  // yang dibantah komentarnya sendiri ("dihitung dari bobot kehadiran, bukan
  // dari total tukin"). Efeknya potongan jadi 3,33x lebih besar dari yang
  // diatur: 1 hari alpha memotong 3% total tukin, padahal seharusnya
  // 3% x 30% = 0,9% total tukin.
  const potonganKehadiranRupiah = bobotKehadiran * potonganKehadiranPersen;
  const komponenKehadiranSetelahPotongan = Math.max(0, bobotKehadiran - potonganKehadiranRupiah);

  let tukinPokok = komponenKehadiranSetelahPotongan + komponenKinerja;

  // --- Override cuti (Pasal 14) - berlaku atas TOTAL tukin, bukan cuma kehadiran ---
  const hasilCuti = hitungPersenDibayarCuti(input.rekapKehadiran.cutiAktif);
  const overrideCutiDiterapkan = hasilCuti !== null;
  const persenDibayarCuti = hasilCuti?.persenDibayar ?? null;
  if (hasilCuti) {
    anomali.push(...hasilCuti.anomali);
    tukinPokok = input.tukinPokokKelasJabatan * hasilCuti.persenDibayar;
    anomali.push(
      `Override Pasal 14 diterapkan untuk cuti jenis ${input.rekapKehadiran.cutiAktif?.jenis} - dibayar ${(hasilCuti.persenDibayar * 100).toFixed(0)}% dari tukin pokok kelas jabatan.`
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
    rincianPotonganKehadiran,
    komponenKehadiranSetelahPotongan,
    komponenKinerja,
    tukinPokok,
    overrideCutiDiterapkan,
    persenDibayarCuti,
    potonganPph,
    tukinBersih: Math.max(0, tukinBersih),
    anomali,
  };
}
