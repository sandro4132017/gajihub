// ============================================================================
// TUKIN CALCULATION ENGINE
// Referensi: Permenaker Nomor 15 Tahun 2024 tentang Pemberian Tunjangan
// Kinerja Pegawai di Lingkungan Kementerian Ketenagakerjaan
//
// Pasal yang jadi acuan langsung:
// - Pasal 5  : bobot 70% capaian kinerja + 30% kehadiran
// - Pasal 11 : dasar pemotongan atas capaian kinerja (pedoman oleh Sekjen - TODO)
// - Pasal 12 : kondisi yang menyebabkan potongan kehadiran
// - Pasal 13 : besaran potongan kehadiran (3%/hari alpha, 1%/KEJADIAN tidak
//              presensi, 0.01%/menit terlambat-pulang cepat-meninggalkan
//              kantor-kekurangan jam kerja, 3%/kejadian tidak ikut upacara) -
//              SEMUA dihitung dari BOBOT KEHADIRAN (30%), bukan dari total
//              tukin
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

/**
 * Pasal 13 ayat (2), dikutip langsung: "...dikenakan potongan sebesar 1%
 * (satu persen) dari bobot kehadiran SETIAP KALI TIDAK MELAKUKAN PRESENSI."
 *
 * SATUANNYA KEJADIAN, BUKAN HARI - frasa "setiap kali" eksplisit di pasalnya.
 * Jadi hari yang lupa presensi masuk DAN pulang memang dipotong 2%, bukan 1%.
 * Sempat diubah jadi per hari pada 2026-08-06 dan dikembalikan lagi setelah
 * teks pasalnya dikonfirmasi user - jangan diubah lagi tanpa dasar tertulis.
 */
const POTONGAN_PER_KEJADIAN_TIDAK_PRESENSI = 0.01;

const POTONGAN_PER_MENIT = 0.0001; // Pasal 13 ayat (3) - 0,01% = 0.0001

/**
 * Pasal 13 ayat (4) - tidak mengikuti upacara bendera tanpa alasan sah,
 * potongan 3% dari bobot kehadiran. Sempat diubah jadi 1% pada 2026-08-06 dan
 * dikembalikan setelah teks pasalnya dikonfirmasi user.
 *
 * TODO(confirm) YANG MASIH BERLAKU: berbeda dengan ayat (2) yang eksplisit
 * "setiap kali", ayat (4) TIDAK memuat frasa itu - secara harfiah bisa dibaca
 * 3% sekali saja per periode, berapa pun jumlah upacara yang dilewatkan.
 * Dibuat per kejadian mengikuti kolom "TDK UPC" di rekap Excel manual yang
 * sedang digantikan aplikasi ini. Praktis jarang berbeda (upacara umumnya
 * sebulan sekali), tapi tetap perlu ditegaskan ke Biro Hukum.
 */
const POTONGAN_PER_KEJADIAN_TIDAK_UPACARA = 0.03;

/**
 * Tarif Pasal 13 yang sama, diekspor supaya UI bisa MENJELASKAN persentase
 * potongan tanpa menuliskan ulang angkanya sendiri.
 *
 * Sengaja mengacu ke konstanta di atas, bukan menyalin nilainya: kalau suatu
 * saat tarifnya berubah, penjelasan di layar ikut berubah. Penjelasan yang
 * memakai angka salinan justru berbahaya - orang membaca rincian yang tidak
 * sesuai dengan potongan yang benar-benar dikenakan.
 */
export const TARIF_POTONGAN_PASAL_13 = {
  perHariAlpha: POTONGAN_PER_HARI_ALPHA,
  perKejadianTidakPresensi: POTONGAN_PER_KEJADIAN_TIDAK_PRESENSI,
  perMenit: POTONGAN_PER_MENIT,
  perKejadianTidakUpacara: POTONGAN_PER_KEJADIAN_TIDAK_UPACARA,
} as const;

/**
 * Tugas belajar - Permenaker 15/2024: "Pelaksana yang melaksanakan tugas
 * belajar menerima 80% (delapan puluh persen) dari Tunjangan Kinerja di kelas
 * jabatan semula setiap bulan sejak yang bersangkutan melaksanakan tugas
 * belajar."
 *
 * Ini PENGALI atas hasil perhitungan, BUKAN kategori potongan tersendiri -
 * sesuai aturan user: "tb: tidak ada potongan, tapi nominalnya dikali 80%".
 *
 * Potongan Pasal 13 TIDAK dimatikan untuk mereka, dan itu bukan kelalaian:
 * pegawai tugas belajar tetap melakukan presensi, hanya saja harinya tercatat
 * berstatus "Tugas Belajar" di e-Presensi - jadi tidak pernah menghasilkan
 * alpha. Tidak ada risiko dihukum dua kali.
 */
const PERSEN_DIBAYAR_TUGAS_BELAJAR = 0.8;

/** Input potongan kehadiran - subset RekapKehadiranPeriode yang dipakai Pasal 13. */
export interface InputPotonganKehadiran {
  jumlahHariAlpha: number;
  jumlahTidakPresensi: number;
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  jumlahTidakIkutUpacara: number;
  // ------------------------------------------------------------------------
  // "KEKURANGAN JAM KERJA" SENGAJA TIDAK ADA DI SINI - JANGAN DITAMBAHKAN LAGI
  // ------------------------------------------------------------------------
  // Pernah ada sebagai `totalMenitKekuranganJamKerja` (2026-08-06), lalu
  // DICABUT 2026-08-07 setelah teks pasalnya dibaca langsung. Pasal 13 ayat
  // (3) menyebut TEPAT TIGA pelanggaran - "terlambat hadir, pulang cepat,
  // atau meninggalkan kantor" - dan Pasal 12 huruf c yang dirujuknya juga
  // menyebut tiga hal yang sama. Kekurangan jam kerja tidak ada di keduanya.
  //
  // Secara aritmatika pun kolom itu berbahaya: kekurangan jam kerja adalah
  // AKIBAT dari terlambat & pulang cepat (telat 30 menit = kurang 30 menit),
  // jadi mengisinya bersamaan berarti memotong menit yang sama dua kali.
  // Sejak awal tidak ada jalur otomatis yang mengisinya, dan saat dicabut
  // NOL dari 40.740 baris rekap yang bernilai bukan 0 - jadi pencabutan ini
  // tidak mengubah satu pun angka yang pernah dihitung.
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
 * Ayat (3) menyebut TEPAT TIGA hal yang bertarif per menit - terlambat
 * hadir, pulang cepat, meninggalkan kantor. "Kekurangan jam kerja" BUKAN
 * salah satunya; lihat catatan di InputPotonganKehadiran.
 *
 * Yang TIDAK memotong sama sekali (aturan user 2026-08-06): dinas luar,
 * diklat, cuti tahunan, cuti melahirkan, cuti besar/alasan penting di bawah
 * 1 bulan. Semuanya memang bukan pelanggaran kewajiban jam kerja, jadi tidak
 * punya baris di tabel ini - bukan karena terlewat.
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

/**
 * Cuti sakit gugur kandungan - Pasal 14 huruf e, dikutip langsung:
 *
 *   "0% (nol persen) untuk sakit sampai dengan 1 (satu) bulan; dan
 *    1% (satu persen) PERHARI untuk Cuti sakit karena gugur kandungan di atas
 *    1 (satu) bulan sampai dengan 1 1/2 (satu setengah) bulan."
 *
 * SATU-SATUNYA ketentuan cuti di Pasal 14 yang tarifnya HARIAN - semua jenis
 * cuti lain bertingkat per bulan. Jangan "dirapikan" jadi per bulan supaya
 * seragam dengan yang lain: sempat diubah jadi per bulan pada 2026-08-06 dan
 * dikembalikan lagi setelah teks pasalnya dikonfirmasi user. Selisihnya besar
 * - pada 1,5 bulan, per hari menghasilkan potongan 15%, per bulan cuma 2%.
 */
const POTONGAN_GUGUR_KANDUNGAN_PER_HARI = 0.01;

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

    /**
     * Cuti di Luar Tanggungan Negara - diatur PASAL 4 HURUF D, bukan Pasal 14.
     *
     * "Tunjangan Kinerja sebagaimana dimaksud dalam Pasal 2 TIDAK DIBERIKAN
     * kepada: ... d. Pegawai ... yang menjalani Cuti di luar tanggungan
     * negara atau dalam bebas tugas untuk persiapan masa pensiun". Jadi nol
     * di sini bukan "potongan 100%" menurut Pasal 14, tapi memang tidak
     * diberikan - angkanya sama, dasarnya beda. Teks lengkapnya ada di
     * docs/permenaker-15-2024-tunjangan-kinerja.md.
     *
     * TODO(confirm) YANG TERSISA: huruf d yang sama menyebut "bebas tugas
     * untuk persiapan masa pensiun" (MPP) dengan akibat SAMA, dan itu BELUM
     * ditangani - tidak ada penandanya di skema Pegawai.
     *
     * Dasar tambahan yang dipakai sebelum teks Permenaker lengkap didapat:
     *
     * Dasarnya PP 11/2017 Pasal 312-313: PNS yang menjalani CLTN dibebaskan
     * dari jabatannya dan tidak berhak menerima penghasilan. Tunjangan Kinerja
     * melekat pada pelaksanaan jabatan (Pasal 5 Permenaker 15/2024), jadi
     * selama jabatannya dibebaskan tidak ada yang jadi dasar pembayaran.
     * Database e-Presensi menetapkan hal yang sama secara terpisah
     * (`cuti.nilai_persen` = 100 untuk jenis ini).
     *
     * ANOMALI TETAP SELALU DINYALAKAN, tapi ALASANNYA SUDAH BERGESER. Dulu:
     * "tidak bisa ditunjuk ke pasal Permenaker manapun". Sejak teks lengkap
     * masuk (2026-08-07) dasarnya jelas di Pasal 4 huruf d; yang tersisa
     * adalah beratnya akibat - ini satu-satunya jalur yang menghapus SELURUH
     * tukin sebulan, jadi tetap tidak boleh lolos ke pembayaran tanpa dilihat
     * manusia.
     */
    case "CUTI_DI_LUAR_TANGGUNGAN_NEGARA":
      anomali.push(
        "Cuti di Luar Tanggungan Negara: Tunjangan Kinerja TIDAK DIBERIKAN (Pasal 4 huruf d Permenaker 15/2024). Seluruh tukin periode ini menjadi nol - pastikan status cutinya benar sebelum disetujui."
      );
      return { persenDibayar: 0, anomali };

    // Pasal 14 huruf d - 0% / 50% / 75%, dan 100% kalau lebih dari 3 bulan.
    case "CUTI_SAKIT": {
      const potongan = potonganBertingkat(
        POTONGAN_CUTI_SAKIT_PER_BULAN,
        bulan,
        POTONGAN_CUTI_SAKIT_LEBIH_3_BULAN
      );
      return { persenDibayar: 1 - potongan, anomali };
    }

    // Pasal 14 huruf e - bulan ke-1 dibayar penuh, bulan ke-2 dipotong 2%.
    // Berbasis BULAN seperti jenis cuti lainnya, BUKAN per hari - lihat
    // TODO(legal-confirm) di POTONGAN_GUGUR_KANDUNGAN_PER_BULAN, perbedaan
    // ini dengan teks pasalnya disengaja dan belum dikonfirmasi.
    case "CUTI_SAKIT_GUGUR_KANDUNGAN": {
      const hari = cutiAktif.jumlahHariCuti;
      if (hari === undefined) {
        // Tidak menebak: tanpa jumlah hari, potongan harian tidak bisa
        // dihitung. Dibayar penuh (perlakuan sampai 1 bulan) TAPI ditandai.
        anomali.push(
          "Cuti sakit gugur kandungan: jumlah hari cuti tidak diisi, jadi potongan 1%/hari (Pasal 14 huruf e) TIDAK dapat dihitung - sementara diperlakukan sebagai cuti sampai dengan 1 bulan (dibayar penuh). Isi jumlah hari cuti kalau lebih dari 1 bulan."
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
  // Tugas belajar TIDAK diperlakukan khusus di sini, dan itu disengaja:
  // pegawai tugas belajar TETAP melakukan presensi, hanya saja harinya
  // tercatat berstatus "Tugas Belajar" di e-Presensi - bukan alpha. Jadi
  // potongan Pasal 13 tidak perlu dimatikan paksa; hari-hari TB memang tidak
  // menghasilkan angka alpha, terlambat, maupun lupa presensi. Yang berlaku
  // untuk mereka cuma pengali 80% di bawah.
  const tugasBelajar = input.rekapKehadiran.tugasBelajar === true;
  const {
    totalPersen: potonganKehadiranPersenSebelumPengecualian,
    rincian: rincianPotonganKehadiran,
    anomali: anomaliKehadiran,
  } = hitungPotonganKehadiranPersen(input.rekapKehadiran);
  anomali.push(...anomaliKehadiran);

  // ==========================================================================
  // PENGECUALIAN PEJABAT PIMPINAN TINGGI (Eselon I/II)
  // ==========================================================================
  // Komponen kehadiran dibayar PENUH sebagai kompensasi jabatan. Yang
  // dimatikan HANYA potongan Pasal 13 - Pasal 14 (cuti), pengali tugas
  // belajar, dan bobot kinerja 70% (predikat) tetap berlaku apa adanya,
  // karena ketiganya mekanisme yang berbeda dan tidak ada keterangan bahwa
  // JPT dikecualikan dari mereka juga.
  //
  // Rincian pelanggarannya SENGAJA TIDAK DIHAPUS - fakta terlambat/pulang
  // cepatnya tetap tercatat dan tetap tampil di layar, cuma tidak menghasilkan
  // potongan rupiah. Menghapusnya berarti kehilangan bahan pengawasan atas
  // orang-orang yang justru paling perlu diawasi.
  //
  // TODO(confirm): dasar hukumnya belum ada - lihat pejabatPimpinanTinggi.ts.
  // Selama belum ada, pemakaiannya SELALU dicatat sebagai catatan supaya tidak
  // ada nominal yang naik diam-diam.
  const pengecualianPotonganKehadiran = input.dikecualikanPotonganKehadiran === true;
  const potonganKehadiranPersen = pengecualianPotonganKehadiran
    ? 0
    : potonganKehadiranPersenSebelumPengecualian;
  if (pengecualianPotonganKehadiran && potonganKehadiranPersenSebelumPengecualian > 0) {
    anomali.push(
      `Pejabat Pimpinan Tinggi - potongan kehadiran Pasal 13 sebesar ` +
        `${(potonganKehadiranPersenSebelumPengecualian * 100).toFixed(2)}% dari bobot kehadiran ` +
        `TIDAK diterapkan (komponen kehadiran dibayar penuh). ` +
        `TODO(confirm): dasar hukum pengecualian ini belum ada salinannya - lihat pejabatPimpinanTinggi.ts.`
    );
  }

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
  const persenDibayarCuti = hasilCuti?.persenDibayar ?? null;
  // ==========================================================================
  // CUTI YANG TIDAK MEMOTONG TIDAK BOLEH MENIMPA APA PUN
  // ==========================================================================
  // Override hanya dijalankan kalau Pasal 14 memang MENGURANGI tukin.
  //
  // Sebelum 2026-08-07, override dijalankan untuk SETIAP jenis cuti termasuk
  // yang persen dibayarnya 100% (cuti tahunan, melahirkan, alasan penting,
  // cuti besar < 1 bulan). Karena override menimpa tukinPokok dengan
  // `tarif kelas x persen`, cuti tahunan SATU HARI menghapus SELURUH potongan
  // Pasal 13 sebulan - pegawai yang terlambat berkali-kali justru dibayar
  // penuh begitu dia ambil cuti sehari.
  //
  // Bug ini dorman selama `cutiAktif` cuma diisi manusia lewat template.
  // Begitu jenis cuti ditarik otomatis dari e-Presensi (2026-08-07), langsung
  // aktif: 16 dari 46 pegawai Biro Keuangan periode 7/2026 kehilangan
  // potongannya, total Rp 634.959 dalam satu unit satu bulan.
  //
  // Dibuktikan keliru lewat rincian tukin manual Rokeu: Ahmad Henda punya
  // potongan Rp 30.604 yang terhapus oleh cuti tahunan 1 hari. Tarif kelas 8
  // Rp 4.595.150 - Rp 30.604 = Rp 4.564.546, dan itu PERSIS angka
  // "Dibayarkan" di rincian manual.
  //
  // Dasarnya juga jelas di teks: Pasal 14 mengatur BERAPA PERSEN tukin
  // dibayarkan selama cuti. Tidak ada satu kata pun yang menyatakan cuti
  // membatalkan Pasal 13.
  //
  // TODO(confirm) YANG TERSISA - untuk cuti yang MEMANG memotong (cuti besar,
  // cuti sakit bulan II ke atas, CLTN), override tetap memakai `tarif kelas x
  // persen` sehingga potongan Pasal 13 tetap tertimpa. Apakah keduanya
  // seharusnya berlaku bersamaan (mis. cuti besar bulan I 50% DARI hasil
  // setelah potongan kehadiran) belum ditegaskan Biro OSDMA/Hukum. Perlakuan
  // sekarang lebih menguntungkan pegawai dan tidak diubah tanpa konfirmasi.
  // `overrideCutiDiterapkan` sekarang berarti "override BENAR-BENAR menimpa
  // perhitungan", bukan sekadar "pegawai sedang cuti". Pemakainya
  // (rincianTukinTersimpan, UI) memakainya buat menjelaskan kenapa
  // kehadiran + kinerja tidak menjumlah ke tukinPokok - dan itu cuma terjadi
  // kalau override memang jalan.
  const overrideCutiDiterapkan = hasilCuti !== null && hasilCuti.persenDibayar < 1;
  if (hasilCuti) anomali.push(...hasilCuti.anomali);
  if (hasilCuti && overrideCutiDiterapkan) {
    tukinPokok = input.tukinPokokKelasJabatan * hasilCuti.persenDibayar;
    anomali.push(
      `Override Pasal 14 diterapkan untuk cuti jenis ${input.rekapKehadiran.cutiAktif?.jenis} - dibayar ${(hasilCuti.persenDibayar * 100).toFixed(0)}% dari tukin pokok kelas jabatan. Potongan Pasal 13 periode ini TIDAK ikut diterapkan karena tertimpa override.`
    );

    // ------------------------------------------------------------------
    // POTONGAN SEBULAN PENUH UNTUK CUTI YANG CUMA BEBERAPA HARI
    // ------------------------------------------------------------------
    // Pasal 14 memberi SATU persentase untuk SATU periode pembayaran - tidak
    // ada ketentuan proporsional harian (itu open item #3 di CLAUDE.md, masih
    // menunggu konfirmasi Biro OSDMA/Hukum). Selama itu belum ada, cuti 1 hari
    // dan cuti sebulan penuh diperlakukan sama persis.
    //
    // Dulu hal ini tidak pernah terjadi karena `cutiAktif` cuma terisi lewat
    // template yang diketik manusia. Sejak jenis cuti ditarik otomatis dari
    // e-Presensi, kasusnya NYATA: pada periode Juli 2026 ada tiga pegawai
    // dengan Cuti di Luar Tanggungan Negara / Cuti Sakit >3 bulan sebanyak
    // SATU HARI - dan aturan di atas menghapus tukin mereka SEBULAN PENUH.
    //
    // Yang dilakukan di sini bukan menambal aturannya (mengarang pembagian
    // proporsional berarti mengarang kebijakan), tapi memastikan kasus seperti
    // itu TIDAK BISA lewat tanpa dilihat manusia.
    const hariCuti = input.rekapKehadiran.cutiAktif?.jumlahHariCuti;
    const hariKerja = input.rekapKehadiran.jumlahHariKerja;
    const potonganPersen = 1 - hasilCuti.persenDibayar;
    if (
      potonganPersen > 0 &&
      hariCuti !== undefined &&
      hariCuti > 0 &&
      hariKerja > 0 &&
      hariCuti * 2 < hariKerja
    ) {
      anomali.push(
        `PERIKSA MANUAL: cuti cuma ${hariCuti} hari dari ${hariKerja} hari kerja, TAPI potongan Pasal 14 sebesar ${(potonganPersen * 100).toFixed(0)}% berlaku untuk SATU BULAN PENUH (pasal itu tidak mengatur pembagian proporsional harian). Pastikan tanggal cutinya benar sebelum disetujui - kalau salah, pegawai kehilangan tukin sebulan karena cuti beberapa hari.`
      );
    }
  }

  // --- Pengali tugas belajar (Permenaker 15/2024) ---
  // "Pelaksana yang melaksanakan tugas belajar menerima 80% dari Tunjangan
  // Kinerja di kelas jabatan semula setiap bulan sejak yang bersangkutan
  // melaksanakan tugas belajar."
  //
  // BEDA BENTUK dari override Pasal 14 (cuti). Cuti MENIMPA hasil perhitungan
  // dengan `tarif kelas x persen`; tugas belajar MENGALIKAN hasil perhitungan
  // yang sudah ada dengan 80%. Jadi kehadiran & predikat kinerja tetap
  // berpengaruh - sesuai keterangan user bahwa nominalnya memang diturunkan
  // dari e-Presensi & e-Kinerja, lalu dikali 80%.
  //
  // "di kelas jabatan semula" terpenuhi dengan sendirinya: yang dipakai adalah
  // `tukinPokokKelasJabatan` pegawai yang bersangkutan, dan kelas jabatannya
  // memang tidak berubah selama tugas belajar.
  if (tugasBelajar) {
    tukinPokok = tukinPokok * PERSEN_DIBAYAR_TUGAS_BELAJAR;
    anomali.push(
      `Pegawai sedang tugas belajar - Tunjangan Kinerja dibayar ${(PERSEN_DIBAYAR_TUGAS_BELAJAR * 100).toFixed(0)}% dari nominal hasil perhitungan (Permenaker 15/2024).`
    );
    if (hasilCuti) {
      anomali.push(
        "Pegawai ditandai tugas belajar SEKALIGUS sedang cuti - pengali 80% diterapkan di ATAS hasil override cuti. Periksa apakah keduanya memang berlaku bersamaan."
      );
    }
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
    pengecualianPotonganKehadiran,
    potonganKehadiranPersenSebelumPengecualian,
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
