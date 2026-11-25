// Bagian bersama PDF dokumen lembur (Surat Tugas harian & SPKL bulanan).
// Kop surat dan font memakai ulang `siapkanKertasBerkop` milik sptjmPdf.ts;
// di sini hanya yang khas dokumen lembur: footer BSrE, penanda koordinat QR,
// blok tanda tangan, butir bernomor, dan tabel lampiran berhalaman.
//
// Murni: tanpa I/O database/jaringan.

import { rgb, type PDFDocument, type PDFFont, type PDFPage } from "pdf-lib";

/** Titik tengah tanda tangan; sama dengan SPTJM (dipakai terapkanStempelTteSimulasi). */
export const TENGAH_TTD_X = 412.67;

/** Klausul resmi BSrE (Kriteria Integrasi BSrE XI) - wajib di setiap berkas PDF. */
export const FOOTER_BSRE =
  "Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik yang diterbitkan oleh Balai Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara.";

// TODO(confirm): "Dasar" di bawah dipinjam dari template SPKL Oktober 2026
// sebagai placeholder untuk Surat Tugas maupun SPKL; dasar hukum final
// menunggu konfirmasi Biro Hukum / persuratan.
export const NOMOR_DIPA_PLACEHOLDER = "[nomor DIPA belum dikonfirmasi]"; // TODO(confirm)
export const AKUN_PLACEHOLDER = "[kode akun belum dikonfirmasi]"; // TODO(confirm)

export const DASAR_LEMBUR: readonly string[] = [
  "Peraturan Menteri Ketenagakerjaan Nomor 1 Tahun 2021 tentang Organisasi dan Tata Kerja Kementerian Ketenagakerjaan;",
  "Peraturan Menteri Ketenagakerjaan Nomor 9 Tahun 2021 tentang Uraian Fungsi Organisasi Jabatan Pimpinan Tinggi Pratama dan Tugas Koordinator Jabatan Fungsional di Lingkungan Kementerian Ketenagakerjaan;",
  "Keputusan Menteri Ketenagakerjaan Republik Indonesia Nomor 195 Tahun 2021 tentang Pengangkatan Pejabat Perbendaharaan Negara pada Satuan Kerja Pusat dan Satuan Unit Pelaksanaan Teknis Pusat Kementerian Ketenagakerjaan;",
  "Keputusan Kuasa Pengguna Anggaran/Kuasa Pengguna Barang Sekretariat Jenderal Nomor 1/05/KU.04/I/2026 tentang Pejabat Pembuat Komitmen Unit Sekretariat Jenderal Daftar Isian Pelaksanaan Anggaran (DIPA) Kementerian Ketenagakerjaan Tahun 2026;",
  `Daftar Isian Pelaksanaan Anggaran (DIPA) Sekretariat Jenderal Kementerian Ketenagakerjaan Tahun 2026 Nomor : ${NOMOR_DIPA_PLACEHOLDER};`,
  "Petunjuk Operasional Kegiatan (POK) Sekretariat Jenderal Kementerian Ketenagakerjaan Tahun Anggaran 2026.",
];

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** "2026-10-14" -> "Rabu, 14 Oktober 2026". Tanggal tidak sah dikembalikan apa adanya. */
export function hariTanggalId(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== Number(m[2]) - 1) return iso;
  return `${HARI[d.getUTCDay()]}, ${d.getUTCDate()} ${BULAN[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Date -> "19 November 2026" (zona waktu dibaca apa adanya dari objek Date lokal). */
export function tanggalPanjangId(d: Date): string {
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Jumlah hari dalam bulan (bulan 1-12). */
export function hariDalamBulan(bulan: number, tahun: number): number {
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

/**
 * Helvetica standar hanya bisa menulis WinAnsi. Karakter di luarnya
 * dipetakan ke padanan ASCII atau "?" supaya pembuatan PDF tidak melempar galat.
 */
export function amankanTeks(teks: string): string {
  return teks
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[\r\t]+/g, " ")
    // "#" adalah tagKoordinat BSrE; hanya penanda di gambarBlokTtd yang boleh
    // ada di dokumen, supaya BSrE tidak menemukan lebih dari satu koordinat.
    .replace(/#/g, "No.")
    .replace(/[^\n\x20-\x7E -ÿ]/g, "?");
}

/** Memecah teks (juga pada "\n") menjadi baris selebar `lebar`. */
export function bungkusTeks(font: PDFFont, teks: string, ukuran: number, lebar: number): string[] {
  const hasil: string[] = [];
  for (const paragraf of amankanTeks(teks).split("\n")) {
    const kata = paragraf.split(/\s+/).filter(Boolean);
    if (kata.length === 0) {
      hasil.push("");
      continue;
    }
    let baris = "";
    for (let kt of kata) {
      // Kata yang lebih lebar dari kolom dipotong per karakter.
      while (font.widthOfTextAtSize(kt, ukuran) > lebar && kt.length > 1) {
        let n = kt.length - 1;
        while (n > 1 && font.widthOfTextAtSize(kt.slice(0, n), ukuran) > lebar) n--;
        if (baris) {
          hasil.push(baris);
          baris = "";
        }
        hasil.push(kt.slice(0, n));
        kt = kt.slice(n);
      }
      const calon = baris ? `${baris} ${kt}` : kt;
      if (baris && font.widthOfTextAtSize(calon, ukuran) > lebar) {
        hasil.push(baris);
        baris = kt;
      } else {
        baris = calon;
      }
    }
    if (baris) hasil.push(baris);
  }
  return hasil;
}

export interface KonteksTulis {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  ukuran: number;
  jarakBaris: number;
}

export function tulis(
  k: KonteksTulis,
  teks: string,
  x: number,
  y: number,
  opsi: { tebal?: boolean; ukuran?: number } = {},
): void {
  k.page.drawText(amankanTeks(teks), {
    x,
    y,
    size: opsi.ukuran ?? k.ukuran,
    font: opsi.tebal ? k.fontBold : k.font,
    color: rgb(0, 0, 0),
  });
}

export function tulisTengah(
  k: KonteksTulis,
  teks: string,
  tengahX: number,
  y: number,
  opsi: { tebal?: boolean; ukuran?: number } = {},
): void {
  const f = opsi.tebal ? k.fontBold : k.font;
  const ukuran = opsi.ukuran ?? k.ukuran;
  const t = amankanTeks(teks);
  tulis(k, t, tengahX - f.widthOfTextAtSize(t, ukuran) / 2, y, opsi);
}

export const MARGIN_KIRI = 70;
export const X_TITIK_DUA = 128;
export const X_ISI = 138;
export const X_ISI_BUTIR = 153;
export const MARGIN_KANAN = 525;

/**
 * Tulis satu baris rata kiri-kanan: sisa lebar dibagi rata ke celah antarkata.
 * Baris terakhir paragraf dan baris satu kata ditulis rata kiri biasa.
 */
function tulisBaris(
  k: KonteksTulis,
  teks: string,
  x: number,
  y: number,
  lebar: number,
  rataPenuh: boolean,
  terakhir: boolean,
): void {
  const kata = teks.split(" ").filter(Boolean);
  if (!rataPenuh || terakhir || kata.length < 2) {
    tulis(k, teks, x, y);
    return;
  }
  const total = kata.reduce((n, kt) => n + k.font.widthOfTextAtSize(kt, k.ukuran), 0);
  const celah = (lebar - total) / (kata.length - 1);
  // Celah yang terlalu lebar terlihat janggal: kembali ke rata kiri.
  if (celah < 0 || celah > k.ukuran * 2.5) {
    tulis(k, teks, x, y);
    return;
  }
  let cx = x;
  for (const kt of kata) {
    tulis(k, kt, cx, y);
    cx += k.font.widthOfTextAtSize(kt, k.ukuran) + celah;
  }
}

/** Kolom tab satu halaman (opt-in; bawaan = konstanta di atas). */
export interface TataLetakBaris {
  kiri: number;
  xTitikDua: number;
  /** x nomor butir ("1."). */
  xNo: number;
  /** x isi tanpa nomor. */
  xIsi: number;
  /** x isi butir bernomor. */
  xIsiButir: number;
  kanan: number;
}

const TATA_BAWAAN: TataLetakBaris = {
  kiri: MARGIN_KIRI,
  xTitikDua: X_TITIK_DUA,
  xNo: X_ISI,
  xIsi: X_ISI,
  xIsiButir: X_ISI_BUTIR,
  kanan: MARGIN_KANAN,
};

/**
 * Satu baris berlabel ("Dasar :", "Kepada :", ...) dengan butir bernomor atau
 * teks tunggal. Mengembalikan y baris kosong berikutnya. `rataPenuh` (opt-in,
 * template SPKL) memberi teks rata kiri-kanan; bawaannya rata kiri. `tata`
 * (opt-in) menggantikan kolom tab bawaan.
 */
export function gambarBaris(
  k: KonteksTulis,
  label: string,
  butir: readonly { no?: string; teks: string }[],
  yAwal: number,
  rataPenuh = false,
  tata: TataLetakBaris = TATA_BAWAAN,
): number {
  let y = yAwal;
  tulis(k, label, tata.kiri, y);
  tulis(k, ":", tata.xTitikDua, y);
  for (const b of butir) {
    const xTeks = b.no ? tata.xIsiButir : tata.xIsi;
    if (b.no) tulis(k, b.no, tata.xNo, y);
    const baris = bungkusTeks(k.font, b.teks, k.ukuran, tata.kanan - xTeks);
    baris.forEach((l, i) => {
      tulisBaris(k, l, xTeks, y, tata.kanan - xTeks, rataPenuh, i === baris.length - 1);
      y -= k.jarakBaris;
    });
  }
  return y;
}

/** Paragraf polos (tanpa label) dari `x` selebar sampai margin kanan. `rataPenuh` opt-in. */
export function gambarParagraf(
  k: KonteksTulis,
  teks: string,
  x: number,
  yAwal: number,
  rataPenuh = false,
  kanan = MARGIN_KANAN,
): number {
  let y = yAwal;
  const baris = bungkusTeks(k.font, teks, k.ukuran, kanan - x);
  baris.forEach((l, i) => {
    tulisBaris(k, l, x, y, kanan - x, rataPenuh, i === baris.length - 1);
    y -= k.jarakBaris;
  });
  return y;
}

/**
 * Blok tanda tangan di tengah kanan. Mengembalikan posisi nama dan NIP.
 *
 * Tanpa `previewTte`: tanda '#' putih kecil sebagai penanda koordinat QR BSrE
 * (tagKoordinat "#"), persis seperti SPTJM. Dengan `previewTte`: hanya
 * keterangan ruang QR - draft tidak boleh tampak sudah ber-TTE.
 * Hanya boleh ada SATU '#' di seluruh dokumen.
 */
export function gambarBlokTtd(
  k: KonteksTulis,
  doc: PDFDocument,
  p: {
    yAtas: number;
    barisAtas: readonly string[];
    nama: string;
    nip: string;
    previewTte?: boolean;
    /**
     * Opt-in (SPKL harian): titik tengah lain, dua baris pertama rata kiri di
     * `xKiriAtas`, jarak baris sendiri, dan jumlah baris kosong sebelum nama.
     * SIGN_X dicatat supaya stempel simulasi mengikuti titik tengah ini.
     */
    tata?: { tengahX: number; xKiriAtas: number; jarak: number; barisKosong: number; lebarJabatan: number };
  },
): { yNama: number; yNip: number } {
  const tata = p.tata;
  const tengahX = tata?.tengahX ?? TENGAH_TTD_X;
  const jarak = tata?.jarak ?? 13.82;
  let y = p.yAtas;
  p.barisAtas.forEach((teks, idx) => {
    if (tata && idx < 2) {
      tulis(k, teks, tata.xKiriAtas, y);
      y -= jarak;
      return;
    }
    for (const l of bungkusTeks(k.font, teks, k.ukuran, tata?.lebarJabatan ?? 210)) {
      tulisTengah(k, l, tengahX, y);
      y -= jarak;
    }
  });
  // y kini satu baris di bawah baris jabatan terakhir.
  const yNama = tata ? y + jarak - (tata.barisKosong + 1) * jarak : y + 13.82 - 88.47;
  const yNip = yNama - 14.28;

  doc.setKeywords(tata ? [`SIGN_Y:${yNama.toFixed(2)}`, `SIGN_X:${tengahX.toFixed(2)}`] : [`SIGN_Y:${yNama.toFixed(2)}`]);

  if (p.previewTte) {
    tulisTengah(k, "[ ruang QR tanda tangan elektronik BSrE ]", tengahX, yNama + 44, { ukuran: 7 });
  } else {
    // Kotak QR 60x60 berpusat di (TENGAH_TTD_X, yNama + 48): bebas dari
    // teks jabatan (di atas) dan nama (di bawah).
    k.page.drawText("#", {
      x: tengahX,
      y: yNama + 48,
      size: 2,
      font: k.font,
      color: rgb(1, 1, 1),
    });
  }
  tulisTengah(k, p.nama, tengahX, yNama);
  tulisTengah(k, `NIP ${p.nip}`, tengahX, yNip);
  return { yNama, yNip };
}

/** Pengganti footer pada pratinjau: draft belum ber-TTE, tidak boleh mengaku sudah. */
export const FOOTER_PRATINJAU =
  "Pratinjau - dokumen ini belum ditandatangani secara elektronik.";

/**
 * Footer BSrE di dasar SETIAP halaman (Kriteria XI). Panggil setelah semua
 * halaman ada. Pada `pratinjau` yang dicetak keterangan pratinjau, bukan klausul BSrE.
 */
export function gambarFooterBsreSemuaHalaman(
  doc: PDFDocument,
  font: PDFFont,
  pratinjau = false,
): void {
  for (const page of doc.getPages()) {
    const { width } = page.getSize();
    const lebar = width - 100;
    const baris = bungkusTeks(font, pratinjau ? FOOTER_PRATINJAU : FOOTER_BSRE, 8, lebar);
    let y = 14 + (baris.length - 1) * 10;
    for (const l of baris) {
      page.drawText(l, { x: 50, y, size: 8, font, color: rgb(0, 0, 0) });
      y -= 10;
    }
  }
}

export interface KolomTabel {
  judul: string;
  lebar: number;
  rata?: "kiri" | "tengah";
  /**
   * Opt-in: baris "\n" di sel dipisah garis horizontal di dalam sel
   * (mis. NAMA di atas, NIP di bawah). Bawaan: "\n" hanya pindah baris.
   */
  pemisahSel?: boolean;
  /** Opt-in: isi sel baris data diletakkan di tengah tinggi baris. Bawaan: rata atas. */
  tengahVertikal?: boolean;
  /** Opt-in: judul kolom rata kiri (bawaan: tengah). */
  headerKiri?: boolean;
}

/** Penanda internal satu baris sel yang digambar sebagai garis pemisah. */
const BARIS_GARIS = "\u0001GARIS";

function bungkusSel(font: PDFFont, teks: string, ukuran: number, lebar: number, pemisah: boolean): string[] {
  if (!pemisah) return bungkusTeks(font, teks, ukuran, lebar);
  const hasil: string[] = [];
  teks.split("\n").forEach((bagian, i) => {
    if (i > 0) hasil.push(BARIS_GARIS);
    hasil.push(...bungkusTeks(font, bagian, ukuran, lebar));
  });
  return hasil;
}

/**
 * Tabel berkisi dengan pembungkus teks dan paginasi (judul kolom diulang).
 * Baris yang lebih tinggi dari satu halaman dilanjutkan di halaman berikut,
 * bukan dipotong.
 */
export function gambarTabel(
  doc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  o: {
    halaman: PDFPage;
    yAwal: number;
    kiri: number;
    kolom: readonly KolomTabel[];
    baris: readonly (readonly string[])[];
    ukuran: number;
    ukuranHalaman: [number, number];
    batasBawah?: number;
    /** Opt-in: y awal tabel di halaman lanjutan (bawaan: tinggi halaman - 45). */
    atasHalamanBaru?: number;
    /** Opt-in: judul kolom di tengah tinggi header (bawaan: rata atas). */
    headerTengahVertikal?: boolean;
    /** Opt-in: bantalan sel dan ukuran font judul (bawaan 3 dan = ukuran). */
    pad?: number;
    ukuranHeader?: number;
  },
): { halaman: PDFPage; y: number } {
  const pad = o.pad ?? 3;
  const ukH = o.ukuranHeader ?? o.ukuran;
  const lh = o.ukuran * 1.3;
  const batasBawah = o.batasBawah ?? 50;
  const atasHalamanBaru = o.atasHalamanBaru ?? o.ukuranHalaman[1] - 45;
  let page = o.halaman;
  let y = o.yAwal;

  const kotak = (x: number, yAtas: number, w: number, h: number, tebal: boolean) => {
    page.drawRectangle({
      x,
      y: yAtas - h,
      width: w,
      height: h,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.6,
      color: tebal ? rgb(0.9, 0.9, 0.9) : undefined,
    });
  };

  const gambarSel = (teksBaris: string[], kol: KolomTabel, x: number, yAtas: number, tebal: boolean, tinggiBaris = 0) => {
    const f = tebal ? fontBold : font;
    const tengah = tebal ? o.headerTengahVertikal === true : kol.tengahVertikal;
    const geser = tengah ? Math.max(0, (tinggiBaris - 2 * pad - teksBaris.length * lh) / 2) : 0;
    yAtas -= geser;
    teksBaris.forEach((t, i) => {
      if (t === BARIS_GARIS) {
        const yg = yAtas - pad - (i + 0.5) * lh;
        page.drawLine({ start: { x, y: yg }, end: { x: x + kol.lebar, y: yg }, thickness: 0.6, color: rgb(0, 0, 0) });
        return;
      }
      const tx =
        kol.rata === "tengah" || (tebal && !kol.headerKiri)
          ? x + (kol.lebar - f.widthOfTextAtSize(t, (tebal ? ukH : o.ukuran))) / 2
          : x + pad;
      page.drawText(t, { x: tx, y: yAtas - pad - (tebal ? ukH : o.ukuran) - i * lh + (lh - (tebal ? ukH : o.ukuran)) / 2, size: (tebal ? ukH : o.ukuran), font: f, color: rgb(0, 0, 0) });
    });
  };

  const gambarHeader = () => {
    const sel = o.kolom.map((c) => bungkusTeks(fontBold, c.judul, ukH, c.lebar - 2 * pad));
    const n = Math.max(...sel.map((s) => s.length));
    const h = n * lh + 2 * pad;
    let x = o.kiri;
    o.kolom.forEach((c, i) => {
      kotak(x, y, c.lebar, h, true);
      gambarSel(sel[i], c, x, y, true, h);
      x += c.lebar;
    });
    y -= h;
  };

  const halamanBaru = () => {
    page = doc.addPage(o.ukuranHalaman);
    y = atasHalamanBaru;
    gambarHeader();
  };

  gambarHeader();

  for (const row of o.baris) {
    let sisa = row.map((teks, i) =>
      bungkusSel(font, teks, o.ukuran, o.kolom[i].lebar - 2 * pad, o.kolom[i].pemisahSel === true),
    );
    while (sisa.some((c) => c.length > 0)) {
      const butuh = Math.max(...sisa.map((c) => c.length));
      const muat = Math.floor((y - batasBawah - 2 * pad) / lh);
      const kapasitasPenuh = Math.floor((atasHalamanBaru - batasBawah - 2 * pad - 30) / lh);
      if (muat < 1 || (butuh > muat && butuh <= kapasitasPenuh)) {
        halamanBaru();
        continue;
      }
      const n = Math.min(butuh, muat);
      const h = n * lh + 2 * pad;
      let x = o.kiri;
      o.kolom.forEach((c, i) => {
        kotak(x, y, c.lebar, h, false);
        gambarSel(sisa[i].slice(0, n), c, x, y, false, h);
        x += c.lebar;
      });
      y -= h;
      sisa = sisa.map((c) => c.slice(n));
      if (sisa.some((c) => c.length > 0)) halamanBaru();
    }
  }
  return { halaman: page, y };
}

/**
 * Opt-in: baris cap di kepala SETIAP halaman (mis. dokumen SEMENTARA yang
 * isinya masih bisa bertambah). Dipanggil setelah semua halaman ada.
 */
export function gambarCapSemuaHalaman(doc: PDFDocument, fontBold: PDFFont, teks: string): void {
  const aman = amankanTeks(teks);
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize();
    const ukuran = 8;
    const lebar = fontBold.widthOfTextAtSize(aman, ukuran);
    page.drawText(aman, { x: (width - lebar) / 2, y: height - 11, size: ukuran, font: fontBold, color: rgb(0.7, 0.1, 0.1) });
  }
}
