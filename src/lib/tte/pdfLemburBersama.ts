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
 * Satu baris berlabel ("Dasar :", "Kepada :", ...) dengan butir bernomor atau
 * teks tunggal. Mengembalikan y baris kosong berikutnya.
 */
export function gambarBaris(
  k: KonteksTulis,
  label: string,
  butir: readonly { no?: string; teks: string }[],
  yAwal: number,
): number {
  let y = yAwal;
  tulis(k, label, MARGIN_KIRI, y);
  tulis(k, ":", X_TITIK_DUA, y);
  for (const b of butir) {
    const xTeks = b.no ? X_ISI_BUTIR : X_ISI;
    if (b.no) tulis(k, b.no, X_ISI, y);
    const baris = bungkusTeks(k.font, b.teks, k.ukuran, MARGIN_KANAN - xTeks);
    for (const l of baris) {
      tulis(k, l, xTeks, y);
      y -= k.jarakBaris;
    }
  }
  return y;
}

/** Paragraf polos (tanpa label) dari `x` selebar sampai margin kanan. */
export function gambarParagraf(k: KonteksTulis, teks: string, x: number, yAwal: number): number {
  let y = yAwal;
  for (const l of bungkusTeks(k.font, teks, k.ukuran, MARGIN_KANAN - x)) {
    tulis(k, l, x, y);
    y -= k.jarakBaris;
  }
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
  },
): { yNama: number; yNip: number } {
  let y = p.yAtas;
  for (const teks of p.barisAtas) {
    for (const l of bungkusTeks(k.font, teks, k.ukuran, 210)) {
      tulisTengah(k, l, TENGAH_TTD_X, y);
      y -= 13.82;
    }
  }
  // y kini satu baris di bawah baris jabatan terakhir (jarak 13.82).
  const yNama = y + 13.82 - 88.47;
  const yNip = yNama - 14.28;

  doc.setKeywords([`SIGN_Y:${yNama.toFixed(2)}`]);

  if (p.previewTte) {
    tulisTengah(k, "[ ruang QR tanda tangan elektronik BSrE ]", TENGAH_TTD_X, yNama + 44, { ukuran: 7 });
  } else {
    // Kotak QR 60x60 berpusat di (TENGAH_TTD_X, yNama + 48): bebas dari
    // teks jabatan (di atas) dan nama (di bawah).
    k.page.drawText("#", {
      x: TENGAH_TTD_X,
      y: yNama + 48,
      size: 2,
      font: k.font,
      color: rgb(1, 1, 1),
    });
  }
  tulisTengah(k, p.nama, TENGAH_TTD_X, yNama);
  tulisTengah(k, `NIP ${p.nip}`, TENGAH_TTD_X, yNip);
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
  },
): void {
  const pad = 3;
  const lh = o.ukuran * 1.3;
  const batasBawah = o.batasBawah ?? 50;
  const atasHalamanBaru = o.ukuranHalaman[1] - 45;
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

  const gambarSel = (teksBaris: string[], kol: KolomTabel, x: number, yAtas: number, tebal: boolean) => {
    const f = tebal ? fontBold : font;
    teksBaris.forEach((t, i) => {
      const tx =
        kol.rata === "tengah" || tebal
          ? x + (kol.lebar - f.widthOfTextAtSize(t, o.ukuran)) / 2
          : x + pad;
      page.drawText(t, { x: tx, y: yAtas - pad - o.ukuran - i * lh + (lh - o.ukuran) / 2, size: o.ukuran, font: f, color: rgb(0, 0, 0) });
    });
  };

  const gambarHeader = () => {
    const sel = o.kolom.map((c) => bungkusTeks(fontBold, c.judul, o.ukuran, c.lebar - 2 * pad));
    const n = Math.max(...sel.map((s) => s.length));
    const h = n * lh + 2 * pad;
    let x = o.kiri;
    o.kolom.forEach((c, i) => {
      kotak(x, y, c.lebar, h, true);
      gambarSel(sel[i], c, x, y, true);
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
    let sisa = row.map((teks, i) => bungkusTeks(font, teks, o.ukuran, o.kolom[i].lebar - 2 * pad));
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
        gambarSel(sisa[i].slice(0, n), c, x, y, false);
        x += c.lebar;
      });
      y -= h;
      sisa = sisa.map((c) => c.slice(n));
      if (sisa.some((c) => c.length > 0)) halamanBaru();
    }
  }
}
