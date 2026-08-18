// ============================================================================
// BASIS DATA GAJI KEMNAKER - identitas pembayaran versi Web Gaji Kemenkeu.
//
// Modul ini PURE (tidak ada I/O).
//
// KENAPA ADA SUMBER NAMA KEDUA
// ----------------------------
// `Pegawai.nama` adalah cermin SIAP dan ditimpa ulang tiap `sync:pegawai`.
// Nama di Web Gaji Kemenkeu DITULIS BERBEDA - umumnya karena gelar. Diukur ke
// file asli "basis data gaji_Kemnaker.xlsx": dari 4.701 NIP yang cocok ke
// tabel Pegawai, **3.628 (77%) nama-nya berbeda**:
//
//   SIAP "ABDUL RAHMAN WAHID"  <->  Web Gaji "Abdul Rahman Wahid, A.Md.A.B"
//   SIAP "ADE ALEXANDER"       <->  Web Gaji "Ade Alexander, SH"
//
// Untuk berkas pembayaran (ADK), yang berlaku adalah penulisan yang dikenali
// Web Gaji - jadi namanya diambil dari sini, bukan dari SIAP. Memperbaiki
// `Pegawai.nama` BUKAN pilihan: kolom itu ditimpa tiap sinkronisasi, dan SIAP
// adalah sumber sah untuk kepegawaian - bukan untuk pembayaran.
//
// BENTUK FILE (dua sheet, struktur sama):
//   data_PNS / data_P3K
//   baris 1  : judul grup bergabung ("GAJI" di atas blok gaji, "TUKIN" di atas blok tukin)
//   baris 2  : header sesungguhnya
//   baris 3+ : data
//   Kolom: No | KODE SATKER | NAMA SATUAN KERJA | NIK | NIP | NAMA PEGAWAI |
//          JENIS PEGAWAI | <blok GAJI: kode bank SPAN, rekening, nama_rekening,
//          nama_bank> | <blok TUKIN: idem>
//
// NIK SENGAJA TIDAK DIAMBIL. Konvensi proyek ini tidak mengimpor data pribadi
// yang tidak dibutuhkan skema (lihat importPegawaiSiap.ts), dan NIK tidak
// dipakai di perhitungan maupun berkas pembayaran manapun.
//
// CATATAN PII: file ini memuat nomor rekening bank ribuan pegawai - lihat
// catatan keamanan di model RekeningPegawai (schema.prisma).
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
  /** Hal yang tetap disimpan TAPI perlu dilihat manusia. */
  peringatan: string[];
  /** Berapa baris yang kolom NIK & NIP-nya tertukar lalu diperbaiki. */
  jumlahNikNipTertukar: number;
}

const KODE_BANK_SPAN_PANJANG = 12;

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
  kol: { kode: number; rek: number; namaRek: number; namaBank: number }
): RekeningBasisGaji | null {
  const kode = angkaSaja(teks(baris[kol.kode]));
  const nomor = angkaSaja(teks(baris[kol.rek]));
  if (!kode || !nomor) return null;
  return {
    kodeBankSpan: kode,
    namaBank: teks(baris[kol.namaBank]) ?? "",
    nomorRekening: nomor,
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
    peringatan: [],
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
  let kodeBankJanggal = 0;

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
          "Perbaiki di file sumber (format kolom NIP jadi Teks), lalu unggah ulang.",
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

    const gaji = kolGaji.kode >= 0 && kolGaji.rek >= 0 ? bacaRekening(r, kolGaji) : null;
    const tukin = kolTukin.rek >= 0 ? bacaRekening(r, kolTukin) : null;
    for (const rek of [gaji, tukin]) {
      if (rek && rek.kodeBankSpan.length !== KODE_BANK_SPAN_PANJANG) kodeBankJanggal++;
    }

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

  const peringatan: string[] = [];
  if (tertukar > 0) {
    peringatan.push(
      `${tertukar} baris di sheet "${namaSheet}" isi kolom NIK dan NIP-nya tertukar - sudah diperbaiki otomatis ` +
        `(NIK 16 digit, NIP 18 digit, jadi tidak mungkin salah kenali).`
    );
  }
  if (kodeBankJanggal > 0) {
    peringatan.push(
      `${kodeBankJanggal} kode bank SPAN di sheet "${namaSheet}" panjangnya bukan ${KODE_BANK_SPAN_PANJANG} digit. ` +
        `Baris tetap disimpan, TAPI pemisahan berkas ADK per bank memakai kode ini - periksa sebelum dipakai membayar.`
    );
  }

  return { baris, dilewati, peringatan, jumlahNikNipTertukar: tertukar };
}

/** Gabung hasil beberapa sheet jadi satu. */
export function gabungHasilBasisDataGaji(hasil: HasilParseBasisDataGaji[]): HasilParseBasisDataGaji {
  const error = hasil.find((h) => h.error)?.error;
  return {
    error,
    baris: hasil.flatMap((h) => h.baris),
    dilewati: hasil.flatMap((h) => h.dilewati),
    peringatan: hasil.flatMap((h) => h.peringatan),
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

/**
 * Kode bank SPAN yang dipakai dengan LEBIH DARI SATU nama bank.
 *
 * Bukan sekadar beda kapitalisasi: di file asli ada 343 baris ber-kode
 * 520002000990 (BRI) tapi nama banknya ditulis "BANK NEGARA INDONESIA".
 * Pemisahan berkas ADK memakai KODE, jadi baris-baris itu akan masuk berkas
 * BRI - dan hanya manusia yang bisa memutuskan mana yang benar.
 */
export function kodeBankBernamaGanda(
  baris: BarisBasisDataGaji[]
): { kodeBankSpan: string; nama: { nama: string; jumlah: number }[] }[] {
  const per = new Map<string, Map<string, number>>();
  for (const b of baris) {
    for (const rek of [b.gaji, b.tukin]) {
      if (!rek?.namaBank) continue;
      const kunci = rek.kodeBankSpan;
      const isi = per.get(kunci) ?? new Map<string, number>();
      const namaBaku = rek.namaBank.toUpperCase();
      isi.set(namaBaku, (isi.get(namaBaku) ?? 0) + 1);
      per.set(kunci, isi);
    }
  }
  return [...per.entries()]
    .filter(([, v]) => v.size > 1)
    .map(([kodeBankSpan, v]) => ({
      kodeBankSpan,
      nama: [...v.entries()].map(([nama, jumlah]) => ({ nama, jumlah })).sort((a, b) => b.jumlah - a.jumlah),
    }));
}
