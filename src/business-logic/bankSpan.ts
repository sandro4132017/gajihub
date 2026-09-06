/**
 * Bank penerima pembayaran, dikenali lewat KODE BANK SPAN.
 *
 * Satu tempat untuk tiga hal yang selama ini tercecer di berkas kiriman:
 * nama bank yang penulisannya berbeda-beda, panjang nomor rekening yang
 * kehilangan nol di depan, dan kode bank yang isinya bukan kode.
 *
 * KODE-nya yang berkuasa saat berkas ADK dipisah per bank, karena SAKTI SPP
 * memproses per bank - nama bank cuma keterangan yang ikut tercetak.
 *
 * TAPI kode bukan yang paling dipercaya waktu isinya saling bertengkar.
 * Keputusan user 2026-09-06: **kode mengikuti nomor rekening**. Panjang nomor
 * adalah sifat teknis bank penerbitnya (BRI 15, Mandiri 13, BNI 10) - dia
 * tidak ikut salah waktu orang menyalin kolom yang keliru, sementara kode
 * SPAN 12 digit itu justru kolom yang paling gampang tertukar karena tidak
 * ada yang bisa membacanya sekilas.
 *
 * PANJANG REKENING DIPASTIKAN USER 2026-09-06 untuk BRI/BNI/Mandiri, dan
 * dipakai memulihkan nol di depan yang hilang saat kolomnya tersimpan sebagai
 * ANGKA di Excel (`0792474955` jadi `792474955`). Bank yang panjangnya BELUM
 * dipastikan sengaja diberi `null`: nomornya tidak pernah diubah, cuma
 * ditandai. Menambahkan nol memakai panjang yang salah sama saja mengarang
 * tujuan transfer.
 */

export interface BankSpan {
  /** Kode bank SPAN, 12 digit. */
  kodeSpan: string;
  /** Nama baku - yang dipakai menimpa variasi penulisan. */
  nama: string;
  /**
   * Panjang nomor rekening yang baku. `null` berarti BELUM dipastikan ke
   * pemilik data; baris bank itu tidak pernah dipulihkan, hanya dilaporkan.
   */
  panjangRekening: number | null;
  /**
   * Penulisan lain yang menunjuk bank yang SAMA - termasuk nama lama
   * (BSM/Bank Mandiri Syariah melebur jadi BSI tahun 2021), singkatan, dan
   * salah ketik yang benar-benar ditemukan di berkas kiriman.
   *
   * Dibandingkan setelah dinormalkan lewat `kunciNama()`, jadi tidak perlu
   * memuat variasi huruf besar/kecil, titik, atau spasi.
   */
  alias: readonly string[];
}

export const PANJANG_KODE_BANK_SPAN = 12;

export const BANK_SPAN: readonly BankSpan[] = [
  {
    kodeSpan: "520002000990",
    nama: "BANK RAKYAT INDONESIA",
    panjangRekening: 15,
    alias: ["BANK RAKYAT INDONESIA", "PT BANK RAKYAT INDONESIA", "PT BANK RAKYAT", "BANK BRI", "BRI"],
  },
  {
    kodeSpan: "520009000990",
    nama: "BANK NEGARA INDONESIA",
    panjangRekening: 10,
    alias: ["BANK NEGARA INDONESIA", "PT BANK NEGARA INDONESIA", "BANK BNI", "BNI"],
  },
  {
    kodeSpan: "520008000990",
    nama: "BANK MANDIRI",
    panjangRekening: 13,
    alias: ["BANK MANDIRI", "PT BANK MANDIRI", "MANDIRI"],
  },
  {
    kodeSpan: "525451000990",
    nama: "BANK SYARIAH INDONESIA",
    // Seluruh 399 baris di data nyata berpanjang 10, tapi belum dipastikan ke
    // pemilik data - jadi namanya dirapikan, nomornya tidak disentuh.
    panjangRekening: null,
    alias: [
      "BANK SYARIAH INDONESIA",
      "PT BANK SYARIAH INDONESIA",
      "BANK SYARIAH MANDIRI",
      "BANK MANDIRI SYARIAH",
      "BSI",
      "BSM",
    ],
  },
  {
    kodeSpan: "524110000990",
    nama: "BPD JABAR BANTEN",
    panjangRekening: null,
    alias: ["BPD JABAR BANTEN", "BPD JABAR DAN BANTEN", "BANK BJB", "BJB"],
  },
  {
    kodeSpan: "523014000990",
    nama: "BANK CENTRAL ASIA",
    panjangRekening: null,
    alias: ["BANK CENTRAL ASIA", "PT BANK CENTRAL ASIA", "BANK BCA", "BCA"],
  },
];

/**
 * Selisih panjang paling banyak yang masih dianggap "nol di depan hilang".
 *
 * Kurang 1-2 digit itu pola khas kolom Excel bertipe angka. Kurang 3 atau
 * lebih TIDAK dipulihkan: pada data nyata ada 27 baris berkode Bank Mandiri
 * (baku 13) yang nomornya 10 digit - persis panjang rekening BNI - jadi
 * penjelasan yang lebih masuk akal adalah kodenya yang salah, bukan tiga nol
 * yang hilang. Memaksa menambahkan nol di situ menghasilkan nomor rekening
 * yang KELIHATAN sah tapi menunjuk entah ke mana, dan itu lebih berbahaya
 * daripada nomor yang jelas-jelas kependekan.
 */
const MAKS_NOL_DIPULIHKAN = 2;

/** Kunci pembanding nama bank: huruf saja, huruf besar. */
export function kunciNama(nama: string): string {
  return nama.toUpperCase().replace(/[^A-Z]/g, "");
}

const PETA_KODE = new Map(BANK_SPAN.map((b) => [b.kodeSpan, b]));
const PETA_ALIAS = new Map<string, BankSpan>();
for (const b of BANK_SPAN) {
  for (const a of b.alias) PETA_ALIAS.set(kunciNama(a), b);
}

export function bankDariKode(kode: string): BankSpan | null {
  return PETA_KODE.get(kode.trim()) ?? null;
}

export function bankDariNama(nama: string): BankSpan | null {
  return PETA_ALIAS.get(kunciNama(nama)) ?? null;
}

export type MasalahRekening =
  /** Kolom kode berisi sesuatu yang bukan kode SPAN, tapi namanya dikenali. */
  | { jenis: "KODE_DIPULIHKAN_DARI_NAMA"; dari: string; jadi: string; bank: string }
  /**
   * Kode dan nama bertengkar, dan PANJANG NOMOR REKENING memihak namanya -
   * kodenya diikutkan ke nomor. Aturan dari user 2026-09-06: "kodenya ikutin
   * norek".
   */
  | { jenis: "KODE_IKUT_NOMOR"; dari: string; jadi: string; bank: string; panjang: number }
  /** Kode dan nama bertengkar, dan panjang nomor memihak KODE-nya - namanya yang dibetulkan. */
  | { jenis: "NAMA_IKUT_NOMOR"; kode: string; namaLama: string; bank: string; panjang: number }
  /** Kolom kode tidak dikenali DAN namanya juga tidak - tidak bisa diapa-apakan. */
  | { jenis: "KODE_TIDAK_DIKENAL"; kode: string; nama: string }
  /**
   * Kode dan nama menunjuk DUA bank berbeda - keputusan manusia.
   *
   * `nomorSesuaiNama` adalah bukti ketiga: apakah PANJANG nomor rekeningnya
   * cocok dengan bank yang disebut NAMANYA. Kalau ya, dua dari tiga kolom
   * sepakat melawan kodenya, dan itu keterangan yang jauh lebih berguna
   * daripada sekadar "ada yang tidak cocok". `null` kalau panjang baku bank
   * itu belum dipastikan, jadi tidak bisa dijadikan bukti.
   */
  | {
      jenis: "NAMA_BEDA_BANK";
      kode: string;
      bankMenurutKode: string;
      bankMenurutNama: string;
      nomorSesuaiNama: boolean | null;
    }
  /** Nol di depan dikembalikan. */
  | { jenis: "NOL_DEPAN_DIPULIHKAN"; dari: string; jadi: string; bank: string }
  /** Panjang tidak wajar dan TIDAK dipulihkan - perlu diperiksa manusia. */
  | { jenis: "PANJANG_JANGGAL"; nomor: string; panjang: number; seharusnya: number; bank: string };

export interface RekeningRapi {
  kodeBankSpan: string;
  namaBank: string;
  nomorRekening: string;
  masalah: MasalahRekening[];
}

/**
 * Rapikan satu baris rekening dari berkas kiriman.
 *
 * YANG DIPERBAIKI (pemulihan, bukan tebakan - keduanya bisa diturunkan dari
 * data lain di baris yang sama):
 *   1. Kode bank yang bukan kode SPAN, kalau nama banknya dikenali.
 *   2. Nol di depan nomor rekening yang hilang, kalau panjang bakunya pasti.
 *   3. Penulisan nama bank yang berbeda-beda untuk bank yang SAMA.
 *
 *   4. Kode ATAU nama, kalau keduanya bertengkar dan PANJANG NOMOR
 *      REKENING memihak salah satunya. Yang kalah dibetulkan mengikuti yang
 *      didukung nomor. Inilah yang menyelesaikan 341 pegawai satker 451026:
 *      berkode BRI, bernama BNI, nomornya 10 digit - panjang BNI - jadi
 *      kodenya yang dibetulkan jadi BNI.
 *
 * YANG SENGAJA TIDAK DIPERBAIKI:
 *
 * Kalau kode dan nama bertengkar TAPI panjang nomornya tidak memihak siapa
 * pun - atau memihak keduanya - baris itu dibiarkan apa adanya dan ditandai
 * `NAMA_BEDA_BANK`. Tidak ada bukti ketiga, dan menebak di situ berarti
 * mengarahkan uang orang ke bank yang belum tentu benar.
 *
 * DAN INI YANG PALING PENTING: kalau kode dan nama SUDAH SEPAKAT, panjang
 * nomor TIDAK PERNAH dipakai membatalkan kesepakatan itu. Dua kolom sepakat
 * melawan satu. Contoh nyatanya rekening Bank Syariah Indonesia: seluruh 399
 * barisnya berpanjang 10 - sama persis dengan BNI - jadi "10 digit berarti
 * BNI" akan memindahkan ratusan rekening BSI ke BNI tanpa ada satu pun kolom
 * di berkasnya yang menyebut BNI. Panjang nomor itu bukti, bukan hakim.
 */
export function rapikanRekening(masuk: {
  kodeBankSpan: string;
  namaBank: string;
  nomorRekening: string;
}): RekeningRapi {
  const masalah: MasalahRekening[] = [];
  let kode = masuk.kodeBankSpan.trim();
  let nama = masuk.namaBank.trim();
  let nomor = masuk.nomorRekening.trim();

  const bankNama = nama ? bankDariNama(nama) : null;
  let bankKode = bankDariKode(kode);

  // 1. Kode bukan kode SPAN yang dikenal - pulihkan dari namanya kalau bisa.
  if (!bankKode) {
    if (bankNama) {
      masalah.push({ jenis: "KODE_DIPULIHKAN_DARI_NAMA", dari: kode, jadi: bankNama.kodeSpan, bank: bankNama.nama });
      kode = bankNama.kodeSpan;
      bankKode = bankNama;
    } else {
      masalah.push({ jenis: "KODE_TIDAK_DIKENAL", kode, nama });
      return { kodeBankSpan: kode, namaBank: nama, nomorRekening: nomor, masalah };
    }
  }

  // 2. Nama menunjuk bank LAIN - panjang nomor rekening yang memutuskan.
  let bedaBank = Boolean(bankNama && bankNama.kodeSpan !== bankKode.kodeSpan);
  if (bankNama && bedaBank) {
    // Kecocokan dihitung terhadap KEDUA calon. Yang menentukan bukan "cocok
    // dengan nama" saja, melainkan cocok dengan TEPAT SATU di antaranya -
    // kalau nomornya cocok dengan dua-duanya (atau tidak dengan siapa pun),
    // dia tidak memihak dan tidak berhak memutuskan.
    const cocokNama = bankNama.panjangRekening !== null && nomor.length === bankNama.panjangRekening;
    const cocokKode = bankKode.panjangRekening !== null && nomor.length === bankKode.panjangRekening;

    if (cocokNama && !cocokKode) {
      masalah.push({
        jenis: "KODE_IKUT_NOMOR",
        dari: kode,
        jadi: bankNama.kodeSpan,
        bank: bankNama.nama,
        panjang: nomor.length,
      });
      kode = bankNama.kodeSpan;
      bankKode = bankNama;
      nama = bankNama.nama;
      bedaBank = false;
    } else if (cocokKode && !cocokNama) {
      masalah.push({
        jenis: "NAMA_IKUT_NOMOR",
        kode,
        namaLama: nama,
        bank: bankKode.nama,
        panjang: nomor.length,
      });
      nama = bankKode.nama;
      bedaBank = false;
    } else {
      // Tidak ada yang bisa dijadikan pegangan - biarkan apa adanya.
      masalah.push({
        jenis: "NAMA_BEDA_BANK",
        kode,
        bankMenurutKode: bankKode.nama,
        bankMenurutNama: bankNama.nama,
        nomorSesuaiNama: bankNama.panjangRekening === null ? null : cocokNama,
      });
    }
  }

  if (!bedaBank) {
    // Nama menunjuk bank yang sama (atau tidak dikenali sama sekali) -
    // dibakukan supaya berkas ke Web Gaji tidak memuat empat ejaan.
    nama = bankKode.nama;
  }

  // 3. Nol di depan yang hilang.
  //
  // DILEWATI kalau kode dan nama sudah bertengkar (langkah 2). Panjang baku
  // yang dipakai di sini datang dari bank menurut KODE, dan justru kode itu
  // yang sedang diragukan - jadi hasilnya pasti "panjang janggal" untuk baris
  // yang sebetulnya cuma punya SATU masalah. Melaporkannya dua kali membuat
  // satu cacat terlihat seperti dua, dan angka di layar jadi dua kali lipat
  // dari jumlah baris yang benar-benar perlu diperiksa.
  const baku = bedaBank ? null : bankKode.panjangRekening;
  if (baku !== null && nomor.length < baku) {
    const kurang = baku - nomor.length;
    if (kurang <= MAKS_NOL_DIPULIHKAN) {
      const dipulihkan = nomor.padStart(baku, "0");
      masalah.push({ jenis: "NOL_DEPAN_DIPULIHKAN", dari: nomor, jadi: dipulihkan, bank: bankKode.nama });
      nomor = dipulihkan;
    } else {
      masalah.push({ jenis: "PANJANG_JANGGAL", nomor, panjang: nomor.length, seharusnya: baku, bank: bankKode.nama });
    }
  } else if (baku !== null && nomor.length > baku) {
    // Kelebihan digit TIDAK pernah dipotong - memotong berarti membuang
    // informasi, dan yang kepanjangan biasanya justru rekening bank lain
    // yang kodenya salah.
    masalah.push({ jenis: "PANJANG_JANGGAL", nomor, panjang: nomor.length, seharusnya: baku, bank: bankKode.nama });
  }

  return { kodeBankSpan: kode, namaBank: nama, nomorRekening: nomor, masalah };
}
