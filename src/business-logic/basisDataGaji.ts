import { PANJANG_KODE_BANK_SPAN, rapikanRekening, type MasalahRekening } from "./bankSpan";
// ============================================================================
// BASIS DATA GAJI KEMNAKER - identitas pembayaran versi Web Gaji Kemenkeu.
//
// PURE (tidak ada I/O).
//
// KENAPA ADA SUMBER NAMA KEDUA: `Pegawai.nama` cermin SIAP dan ditimpa ulang
// tiap `sync:pegawai`, sementara Web Gaji menuliskan nama BERBEDA (umumnya
// karena gelar) - terukur 3.628 dari 4.701 NIP (77%) berbeda, mis. SIAP
// "ADE ALEXANDER" lawan Web Gaji "Ade Alexander, SH". Untuk berkas pembayaran
// yang berlaku penulisan yang dikenali Web Gaji. Memperbaiki `Pegawai.nama`
// BUKAN pilihan: kolom itu ditimpa tiap sinkronisasi, dan SIAP sah untuk
// kepegawaian - bukan untuk pembayaran.
//
// BENTUK FILE (dua sheet berstruktur sama, data_PNS / data_P3K):
//   baris 1 : judul grup bergabung ("GAJI" / "TUKIN")
//   baris 2 : header sesungguhnya | baris 3+: data
//   Kolom: No | KODE SATKER | NAMA SATUAN KERJA | NIK | NIP | NAMA PEGAWAI |
//          JENIS PEGAWAI | <blok GAJI: kode bank SPAN, rekening, nama
//          rekening, nama bank> | <blok TUKIN: idem>
//
// NIK SENGAJA TIDAK DIAMBIL - konvensi proyek tidak mengimpor data pribadi
// yang tidak dibutuhkan skema.
//
// CATATAN PII: file ini memuat nomor rekening ribuan pegawai - lihat catatan
// keamanan di model RekeningPegawai (schema.prisma).
// ============================================================================

export interface RekeningBasisGaji {
  kodeBankSpan: string;
  namaBank: string;
  nomorRekening: string;
  namaRekening: string | null;
}

export interface BarisBasisDataGaji {
  nip: string;
  /** Nama versi Web Gaji - INI yang dipakai di berkas ADK. */
  nama: string;
  /** "PNS" / "PPPK" apa adanya dari file. */
  jenisPegawai: string | null;
  kodeSatker: string | null;
  namaSatuanKerja: string | null;
  gaji: RekeningBasisGaji | null;
  tukin: RekeningBasisGaji | null;
  /** Nama sheet asalnya - buat menelusuri balik ke file. */
  sheet: string;
}

export interface BarisDilewati {
  sheet: string;
  nomorBaris: number;
  nip: string | null;
  nama: string | null;
  alasan: string;
}

export interface HasilParseBasisDataGaji {
  error?: string;
  baris: BarisBasisDataGaji[];
  dilewati: BarisDilewati[];
  /**
   * Masalah rekening apa adanya, satu entri per kejadian - BUKAN kalimat siap
   * tayang. Kalimatnya disusun sekali di `ringkasMasalahBasisDataGaji()`
   * setelah SEMUA sheet digabung; kalau tiap sheet menyusun kalimatnya
   * sendiri, satu jenis masalah muncul dua kali di layar hanya karena
   * berkasnya kebetulan punya dua sheet.
   */
  masalah: MasalahRekening[];
  /** Berapa baris yang kolom NIK & NIP-nya tertukar lalu diperbaiki. */
  jumlahNikNipTertukar: number;
}

const KODE_BANK_SPAN_PANJANG = PANJANG_KODE_BANK_SPAN;

function teks(nilai: unknown): string | null {
  if (nilai === null || nilai === undefined) return null;
  // Apostrof di depan adalah sisa "paksa jadi teks" di Excel - bukan bagian
  // dari nilainya. Ada di file asli pada kode bank ('520002000990).
  const s = String(nilai).replace(/^'+/, "").replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

const angkaSaja = (s: string | null) => (s ? s.replace(/\D/g, "") : "");

/** Cari indeks kolom di rentang tertentu, dari kandidat kata kunci. */
function cariKolom(header: (string | null)[], mulai: number, akhir: number, ...kandidat: string[]): number {
  for (const kata of kandidat) {
    for (let i = mulai; i < akhir; i++) {
      if (header[i]?.toLowerCase().includes(kata.toLowerCase())) return i;
    }
  }
  return -1;
}

function bacaRekening(
  baris: unknown[],
  kol: { kode: number; rek: number; namaRek: number; namaBank: number },
  masalah: MasalahRekening[]
): RekeningBasisGaji | null {
  const kode = angkaSaja(teks(baris[kol.kode]));
  const nomor = angkaSaja(teks(baris[kol.rek]));
  if (!kode || !nomor) return null;
  // Dirapikan DI SINI, sebelum nilainya menyentuh apa pun - supaya berkas
  // ADK, halaman rekening pegawai, dan pemisahan per bank semuanya memakai
  // nilai yang sama. Kalau perapiannya dilakukan belakangan di salah satu
  // pemakai saja, ketiganya cepat atau lambat berbeda.
  //
  // `rapikanRekening` SENGAJA tidak memperbaiki segalanya - baris yang kode
  // dan namanya menunjuk bank berbeda dibiarkan apa adanya lalu ditandai.
  // Lihat alasannya di sana.
  const rapi = rapikanRekening({
    kodeBankSpan: kode,
    namaBank: teks(baris[kol.namaBank]) ?? "",
    nomorRekening: nomor,
  });
  masalah.push(...rapi.masalah);
  return {
    kodeBankSpan: rapi.kodeBankSpan,
    namaBank: rapi.namaBank,
    nomorRekening: rapi.nomorRekening,
    namaRekening: teks(baris[kol.namaRek]),
  };
}

/**
 * Parse SATU sheet basis data gaji.
 *
 * `matriks` harus datang dari pembacaan **raw** (`raw: true`), bukan yang
 * sudah diformat jadi teks. Alasannya ada di penanganan NIP di bawah: kalau
 * sudah jadi teks, kerusakan presisi Excel tidak bisa dibedakan lagi dari NIP
 * yang benar.
 */
export function parseSheetBasisDataGaji(matriks: unknown[][], namaSheet: string): HasilParseBasisDataGaji {
  const kosong: HasilParseBasisDataGaji = {
    baris: [],
    dilewati: [],
    masalah: [],
    jumlahNikNipTertukar: 0,
  };

  const idxHeader = matriks.findIndex((b) =>
    (b ?? []).some((sel) => teks(sel)?.toLowerCase() === "nip")
  );
  if (idxHeader < 0) {
    return { ...kosong, error: `Sheet "${namaSheet}": baris header tidak ketemu (tidak ada kolom "NIP").` };
  }
  const header = (matriks[idxHeader] ?? []).map((s) => teks(s));

  // Blok TUKIN dikenali dari kata "tunkin"/"tukin" di headernya; semua kolom
  // rekening SEBELUM itu milik blok GAJI. Dipisah begini - bukan dengan nomor
  // kolom tetap - karena penamaannya beda antar sheet ("NAMA_REKENING" di
  // data_PNS vs "NAMA_REKENING GAJI" di data_P3K).
  const awalTukin = cariKolom(header, 0, header.length, "span tunkin", "span_tunkin", "span tukin");
  if (awalTukin < 0) {
    return { ...kosong, error: `Sheet "${namaSheet}": kolom kode bank SPAN tukin tidak ketemu.` };
  }

  const kolNik = cariKolom(header, 0, awalTukin, "nik");
  const kolNip = cariKolom(header, 0, awalTukin, "nip");
  const kolNama = cariKolom(header, 0, awalTukin, "nama pegawai");
  const kolJenis = cariKolom(header, 0, awalTukin, "jenis pegawai", "jenis_pegawai");
  const kolKodeSatker = cariKolom(header, 0, awalTukin, "kode satker");
  const kolNamaSatker = cariKolom(header, 0, awalTukin, "nama satuan kerja", "nama satker");
  if (kolNip < 0 || kolNama < 0) {
    return { ...kosong, error: `Sheet "${namaSheet}": kolom NIP atau NAMA PEGAWAI tidak ketemu.` };
  }

  const kolGaji = {
    kode: cariKolom(header, 0, awalTukin, "bank span gaji", "kode bank span"),
    rek: cariKolom(header, 0, awalTukin, "rekening gaji"),
    namaRek: cariKolom(header, 0, awalTukin, "nama_rekening"),
    namaBank: cariKolom(header, 0, awalTukin, "nama_bank"),
  };
  const kolTukin = {
    kode: awalTukin,
    rek: cariKolom(header, awalTukin, header.length, "rekening"),
    namaRek: cariKolom(header, awalTukin, header.length, "nama_rekening"),
    namaBank: cariKolom(header, awalTukin, header.length, "nama_bank"),
  };

  const baris: BarisBasisDataGaji[] = [];
  const dilewati: BarisDilewati[] = [];
  let tertukar = 0;
  const masalahRekening: MasalahRekening[] = [];

  for (let i = idxHeader + 1; i < matriks.length; i++) {
    const r = matriks[i] ?? [];
    if (!r.some((sel) => teks(sel) !== null)) continue; // baris kosong di ekor file
    const nomorBaris = i + 1;
    const nama = teks(r[kolNama]);

    // --- NIP tersimpan sebagai ANGKA = tiga digit terakhirnya SUDAH HILANG ---
    // Excel hanya menyimpan 15 digit signifikan, sementara NIP 18 digit.
    // Di file asli ada 46 baris seperti ini, semuanya berakhiran "000"
    // (mis. 196906202003121000) dan NOL di antaranya cocok ke tabel Pegawai.
    // Ditolak, BUKAN diperbaiki dengan tebakan - digit yang hilang tidak bisa
    // dipulihkan dari mana pun.
    if (typeof r[kolNip] === "number") {
      dilewati.push({
        sheet: namaSheet,
        nomorBaris,
        nip: String(r[kolNip]),
        nama,
        alasan:
          "NIP tersimpan sebagai angka di Excel sehingga 3 digit terakhirnya hilang. " +
          "TIDAK bisa dipulihkan dengan mengubah format kolomnya jadi Teks - digitnya sudah tidak ada " +
          "lagi di berkas ini. Minta berkas dibuat ulang dari sistem sumbernya dengan kolom NIP " +
          "diekspor sebagai teks.",
      });
      continue;
    }

    let nip = angkaSaja(teks(r[kolNip]));
    const nik = kolNik >= 0 ? angkaSaja(teks(r[kolNik])) : "";

    // --- Kolom NIK & NIP tertukar pada sebagian baris ---
    // Di file asli terjadi pada 287 baris (Ditjen PHI dan Jamsos + Balai
    // Besar Pelatihan Vokasi Medan). Aman diperbaiki karena kedua format
    // tidak mungkin tertukar artinya: NIK 16 digit, NIP 18 digit.
    if (nip.length === 16 && nik.length === 18) {
      nip = nik;
      tertukar++;
    }

    if (nip.length !== 18) {
      dilewati.push({
        sheet: namaSheet,
        nomorBaris,
        nip: nip || null,
        nama,
        alasan: nip ? `NIP bukan 18 digit (${nip.length} digit).` : "NIP kosong.",
      });
      continue;
    }
    if (!nama) {
      dilewati.push({ sheet: namaSheet, nomorBaris, nip, nama: null, alasan: "Nama pegawai kosong." });
      continue;
    }

    const gaji = kolGaji.kode >= 0 && kolGaji.rek >= 0 ? bacaRekening(r, kolGaji, masalahRekening) : null;
    const tukin = kolTukin.rek >= 0 ? bacaRekening(r, kolTukin, masalahRekening) : null;

    baris.push({
      nip,
      nama,
      jenisPegawai: kolJenis >= 0 ? teks(r[kolJenis]) : null,
      kodeSatker: kolKodeSatker >= 0 ? teks(r[kolKodeSatker]) : null,
      namaSatuanKerja: kolNamaSatker >= 0 ? teks(r[kolNamaSatker]) : null,
      gaji,
      tukin,
      sheet: namaSheet,
    });
  }

  return { baris, dilewati, masalah: masalahRekening, jumlahNikNipTertukar: tertukar };
}

/**
 * Ubah daftar masalah rekening jadi kalimat siap tayang - DUA daftar, bukan
 * satu.
 *
 * Yang memisahkannya: apakah pembaca perlu melakukan sesuatu. Nol depan yang
 * dipulihkan dan NIK/NIP yang ditukar balik sudah selesai - itu laporan
 * pekerjaan, bukan tugas. Kode bank yang bertengkar dengan nama banknya belum
 * selesai, dan cuma pemilik data yang bisa menyelesaikannya. Waktu keduanya
 * dicetak dalam satu daftar peringatan kuning yang sama, yang mendesak
 * tenggelam di antara yang sudah beres - persis yang terjadi pada unggahan
 * 2026-09-06: sembilan butir, dan yang benar-benar berbahaya cuma dua.
 *
 * SATU CACAT = SATU BARIS. Pertengkaran kode-vs-nama dulu dilaporkan tiga
 * kali untuk baris yang sama - beda bank, panjang janggal, lalu sekali lagi
 * sebagai "satu kode dipakai dengan dua nama" - sehingga ~350 baris
 * bermasalah terbaca seperti ~950. Sekarang sebagian besarnya bahkan tidak
 * jadi masalah sama sekali: kodenya dibetulkan mengikuti nomor rekening.
 */
export function ringkasMasalahBasisDataGaji(masalah: MasalahRekening[]): {
  dirapikan: string[];
  perluDiperiksa: string[];
} {
  const dirapikan: string[] = [];
  const perluDiperiksa: string[] = [];
  const cacah = (jenis: MasalahRekening["jenis"]) => masalah.filter((m) => m.jenis === jenis).length;

  const nol = cacah("NOL_DEPAN_DIPULIHKAN");
  if (nol > 0) {
    dirapikan.push(
      `${nol} nomor rekening kehilangan nol di depan karena kolomnya tersimpan sebagai angka di Excel - ` +
        `sudah dikembalikan sesuai panjang baku banknya (BRI 15 digit, BNI 10, Mandiri 13).`
    );
  }

  // Kode bank yang dibetulkan mengikuti nomor rekening. Dikelompokkan per
  // bank tujuan supaya kalimatnya bisa dibaca sebagai satu kejadian ("341
  // rekening pindah ke BNI"), bukan 341 kejadian.
  const ikutNomor = new Map<string, number>();
  for (const m of masalah) {
    if (m.jenis === "KODE_IKUT_NOMOR") ikutNomor.set(m.bank, (ikutNomor.get(m.bank) ?? 0) + 1);
  }
  for (const [bank, jumlah] of [...ikutNomor.entries()].sort((a, b) => b[1] - a[1])) {
    dirapikan.push(
      `${jumlah} baris kode banknya tidak cocok dengan nama banknya - kode diikutkan ke nomor rekening, ` +
        `dan panjang nomornya memastikan ${bank}. Berkas ADK-nya sekarang masuk kelompok ${bank}.`
    );
  }

  const namaIkutNomor = cacah("NAMA_IKUT_NOMOR");
  if (namaIkutNomor > 0) {
    dirapikan.push(
      `${namaIkutNomor} baris nama banknya tidak cocok dengan kodenya - nama dibetulkan mengikuti kode, ` +
        `karena panjang nomor rekeningnya memihak kode itu.`
    );
  }

  const kode = cacah("KODE_DIPULIHKAN_DARI_NAMA");
  if (kode > 0) {
    dirapikan.push(
      `${kode} kolom kode bank SPAN isinya bukan kode ${PANJANG_KODE_BANK_SPAN} digit - sudah diisi dari nama banknya.`
    );
  }

  // Pertengkaran kode-vs-nama dikelompokkan per PASANGAN bank. "349 baris
  // bermasalah" tidak bisa ditindaklanjuti; "349 berkode BRI padahal namanya
  // BNI" bisa langsung ditanyakan ke pemilik datanya.
  const pasangan = new Map<string, { kode: string; nama: string; jumlah: number; nomorCocokNama: number }>();
  for (const m of masalah) {
    if (m.jenis !== "NAMA_BEDA_BANK") continue;
    const kunci = `${m.bankMenurutKode}|${m.bankMenurutNama}`;
    const p = pasangan.get(kunci) ?? {
      kode: m.bankMenurutKode,
      nama: m.bankMenurutNama,
      jumlah: 0,
      nomorCocokNama: 0,
    };
    p.jumlah += 1;
    if (m.nomorSesuaiNama === true) p.nomorCocokNama += 1;
    pasangan.set(kunci, p);
  }
  for (const p of [...pasangan.values()].sort((a, b) => b.jumlah - a.jumlah)) {
    // Yang sampai ke sini adalah sisa yang panjang nomornya TIDAK memihak
    // siapa pun - kalau memihak, kodenya sudah dibetulkan di langkah
    // sebelumnya dan baris ini tidak pernah muncul. Jadi kalimatnya tidak
    // boleh menyarankan kolom mana yang keliru: memang tidak diketahui.
    perluDiperiksa.push(
      `${p.jumlah} rekening berkode ${p.kode} tapi nama banknya ${p.nama}, dan panjang nomor rekeningnya ` +
        `tidak cocok dengan keduanya - jadi tidak bisa diputuskan otomatis. Dibiarkan apa adanya; ` +
        `pastikan ke pemilik data sebelum dipakai membayar.`
    );
  }

  const panjang = cacah("PANJANG_JANGGAL");
  if (panjang > 0) {
    perluDiperiksa.push(
      `${panjang} nomor rekening panjangnya tidak sesuai banknya, dan selisihnya terlalu besar untuk sekadar ` +
        `nol yang hilang. Tidak diubah - periksa sebelum dipakai membayar.`
    );
  }

  const tidakDikenal = cacah("KODE_TIDAK_DIKENAL");
  if (tidakDikenal > 0) {
    perluDiperiksa.push(
      `${tidakDikenal} baris kode bank maupun nama banknya tidak dikenali. Tersimpan apa adanya - periksa sebelum dipakai membayar.`
    );
  }

  return { dirapikan, perluDiperiksa };
}

/** Gabung hasil beberapa sheet jadi satu. */
export function gabungHasilBasisDataGaji(hasil: HasilParseBasisDataGaji[]): HasilParseBasisDataGaji {
  const error = hasil.find((h) => h.error)?.error;
  return {
    error,
    baris: hasil.flatMap((h) => h.baris),
    dilewati: hasil.flatMap((h) => h.dilewati),
    masalah: hasil.flatMap((h) => h.masalah),
    jumlahNikNipTertukar: hasil.reduce((a, h) => a + h.jumlahNikNipTertukar, 0),
  };
}

/**
 * NIP yang muncul lebih dari sekali. Yang terakhir menang saat upsert, jadi
 * ini WAJIB ditampilkan - kalau dua barisnya berbeda isi, yang dipakai
 * ditentukan urutan baris di file, bukan oleh keputusan siapa pun.
 */
export function nipGanda(baris: BarisBasisDataGaji[]): { nip: string; jumlah: number; nama: string[] }[] {
  const per = new Map<string, BarisBasisDataGaji[]>();
  for (const b of baris) per.set(b.nip, [...(per.get(b.nip) ?? []), b]);
  return [...per.entries()]
    .filter(([, v]) => v.length > 1)
    .map(([nip, v]) => ({ nip, jumlah: v.length, nama: [...new Set(v.map((x) => x.nama))] }));
}

