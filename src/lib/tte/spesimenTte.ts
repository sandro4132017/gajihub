// ============================================================================
// SPESIMEN TANDA TANGAN ELEKTRONIK - QR berlogo Gajihub, dikirim ke BSrE
// sebagai `imageTTD`.
//
// KENAPA KITA YANG MENGGAMBAR. Esign Client punya dua cabang visualisasi yang
// saling eksklusif (petunjuk teknis v2.2.1, butir 5-7):
//
//   image=false + linkQR   -> BSrE menggambar QR POLOS. Tidak ada satu pun
//                             tombol gaya; itulah kenapa QR lama terlihat
//                             seperti QR biasa.
//   image=true  + imageTTD -> spesimen KUSTOM yang kita unggah sendiri.
//
// Tidak ada cabang yang memberi keduanya. Jadi QR berlogo berarti kita yang
// merendernya - sama seperti SRIKANDI dan aplikasi naskah dinas lain.
//
// YANG TIDAK BERUBAH: tanda tangan kriptografisnya tetap milik BSrE. Gambar
// ini ikut masuk ke dalam bita yang ditandatangani, jadi tidak bisa diubah
// diam-diam tanpa merusak tanda tangannya.
//
// TANPA PUSTAKA GAMBAR. Proyek ini tidak memasang sharp/canvas/jimp, dan
// menambah dependensi biner hanya untuk satu stempel tidak sepadan. Modulnya
// menggambar sendiri ke penyangga RGBA lalu menyandikan PNG dengan zlib
// bawaan Node. Logonya pun geometri murni - salinan src/app/icon.svg, yang
// isinya memang cuma persegi membulat, busur, batang, dan lingkaran.
//
// TEMPLATE-NYA PARAMETER, BUKAN ANGKA TERTANAM. Semua ukuran dan warna masuk
// lewat `TemplateSpesimenTte`, dan `ambilTemplateSpesimen()` adalah satu-
// satunya tempat nilainya ditentukan. Saat halaman pengaturan Admin dibuat
// nanti, yang diubah cukup isi fungsi itu - sisa berkas ini tidak tersentuh.
// ============================================================================

import zlib from "zlib";
import QRCode from "qrcode";

export type Warna = readonly [number, number, number];

export interface TemplateSpesimenTte {
  /** Piksel per modul QR. Makin besar makin tajam saat dicetak. */
  pikselPerModul: number;
  /** Lebar tepi putih di sekeliling QR, dalam satuan modul. Standar QR: 4. */
  modulTepi: number;
  /** Warna modul gelap. */
  warnaQr: Warna;
  /** Warna latar. Tepi putih WAJIB terang supaya QR tetap terbaca. */
  warnaLatar: Warna;
  /** Pasang lencana logo di tengah QR. */
  pakaiLogo: boolean;
  /** Sisi lencana tengah sebagai pecahan lebar QR. Jangan lewat 0,3. */
  rasioLencana: number;
}

/**
 * Nilai bawaan.
 *
 * `rasioLencana` 0,26 berarti lencananya menutup sekitar 7% luas QR -
 * jauh di bawah daya pulih 30% milik koreksi galat tingkat H yang dipakai di
 * bawah. Menaikkannya melewati 0,3 membuat QR berhenti terbaca di sebagian
 * pemindai, dan gagalnya tidak merata: terbaca di satu HP, gagal di HP lain.
 */
export const TEMPLATE_BAWAAN: TemplateSpesimenTte = {
  pikselPerModul: 8,
  modulTepi: 4,
  warnaQr: [19, 65, 107], // navy Gajihub
  warnaLatar: [255, 255, 255],
  pakaiLogo: true,
  rasioLencana: 0.26,
};

/**
 * Template yang sedang berlaku.
 *
 * SATU-SATUNYA tempat nilai template ditentukan. Sekarang mengembalikan nilai
 * bawaan; halaman pengaturan Admin nanti cukup membaca simpanannya di sini dan
 * menimpa sebagian isinya.
 */
export function ambilTemplateSpesimen(
  penimpa: Partial<TemplateSpesimenTte> = {}
): TemplateSpesimenTte {
  return { ...TEMPLATE_BAWAAN, ...penimpa };
}

// ---------------------------------------------------------------------------
// Penyangga piksel
// ---------------------------------------------------------------------------

/** Berapa titik contoh per sisi piksel saat menggambar bentuk lengkung. */
const CONTOH = 4;

class Kanvas {
  readonly lebar: number;
  readonly tinggi: number;
  readonly rgba: Uint8Array;

  constructor(lebar: number, tinggi: number, latar: Warna) {
    this.lebar = lebar;
    this.tinggi = tinggi;
    this.rgba = new Uint8Array(lebar * tinggi * 4);
    for (let i = 0; i < lebar * tinggi; i++) {
      this.rgba[i * 4] = latar[0];
      this.rgba[i * 4 + 1] = latar[1];
      this.rgba[i * 4 + 2] = latar[2];
      this.rgba[i * 4 + 3] = 255;
    }
  }

  /** Timpa satu piksel dengan warna, sebanding tutupannya (0..1). */
  private campur(x: number, y: number, warna: Warna, tutupan: number): void {
    if (tutupan <= 0 || x < 0 || y < 0 || x >= this.lebar || y >= this.tinggi) return;
    const i = (y * this.lebar + x) * 4;
    const a = Math.min(1, tutupan);
    for (let k = 0; k < 3; k++) {
      this.rgba[i + k] = Math.round(this.rgba[i + k] * (1 - a) + warna[k] * a);
    }
    this.rgba[i + 3] = 255;
  }

  /** Kotak tajam - dipakai modul QR, jadi tanpa penghalusan tepi. */
  kotak(x: number, y: number, lebar: number, tinggi: number, warna: Warna): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.lebar, Math.round(x + lebar));
    const y1 = Math.min(this.tinggi, Math.round(y + tinggi));
    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) this.campur(i, j, warna, 1);
    }
  }

  /**
   * Isi daerah yang ditentukan fungsi `didalam`, dengan penghalusan tepi.
   * Kotak pembatas dipakai supaya tidak menyapu seluruh kanvas.
   */
  bentuk(
    batas: { x0: number; y0: number; x1: number; y1: number },
    warna: Warna,
    didalam: (x: number, y: number) => boolean
  ): void {
    const x0 = Math.max(0, Math.floor(batas.x0));
    const y0 = Math.max(0, Math.floor(batas.y0));
    const x1 = Math.min(this.lebar, Math.ceil(batas.x1));
    const y1 = Math.min(this.tinggi, Math.ceil(batas.y1));
    const langkah = 1 / CONTOH;
    const awal = langkah / 2;

    for (let j = y0; j < y1; j++) {
      for (let i = x0; i < x1; i++) {
        let kena = 0;
        for (let sy = 0; sy < CONTOH; sy++) {
          for (let sx = 0; sx < CONTOH; sx++) {
            if (didalam(i + awal + sx * langkah, j + awal + sy * langkah)) kena++;
          }
        }
        if (kena > 0) this.campur(i, j, warna, kena / (CONTOH * CONTOH));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bentuk dasar sebagai uji "titik ini di dalam atau tidak"
// ---------------------------------------------------------------------------

function diDalamPersegiMembulat(
  x: number, y: number, px: number, py: number, lebar: number, tinggi: number, r: number
): boolean {
  if (x < px || y < py || x > px + lebar || y > py + tinggi) return false;
  const kiri = px + r;
  const kanan = px + lebar - r;
  const atas = py + r;
  const bawah = py + tinggi - r;
  const cx = x < kiri ? kiri : x > kanan ? kanan : x;
  const cy = y < atas ? atas : y > bawah ? bawah : y;
  if (cx === x || cy === y) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function diDalamCakram(x: number, y: number, cx: number, cy: number, r: number): boolean {
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Jarak titik ke ruas garis - dipakai untuk batang bertutup bulat. */
function diDalamRuas(
  x: number, y: number, x1: number, y1: number, x2: number, y2: number, tebalSetengah: number
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const panjang2 = dx * dx + dy * dy;
  let t = panjang2 === 0 ? 0 : ((x - x1) * dx + (y - y1) * dy) / panjang2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return (x - px) ** 2 + (y - py) ** 2 <= tebalSetengah * tebalSetengah;
}

// ---------------------------------------------------------------------------
// Logo Gajihub - salinan geometri src/app/icon.svg pada ruang gambar 64x64
// ---------------------------------------------------------------------------

const LOGO_LATAR: Warna = [16, 32, 60]; // #10203c
const LOGO_BUSUR: Warna = [0, 179, 164]; // #00B3A4
const LOGO_TITIK: Warna = [212, 160, 23]; // #D4A017

/** Sudut ujung busur terhadap pusat (32,32) pada ikon aslinya. */
const SUDUT_UJUNG = Math.atan2(16, 13); // ~0,888 rad

function gambarLogoGajihub(k: Kanvas, px: number, py: number, sisi: number): void {
  const s = sisi / 64;
  const X = (v: number) => px + v * s;
  const Y = (v: number) => py + v * s;
  const batasPenuh = { x0: px, y0: py, x1: px + sisi, y1: py + sisi };

  // rect 64x64 rx=14
  k.bentuk(batasPenuh, LOGO_LATAR, (x, y) =>
    diDalamPersegiMembulat(x, y, px, py, sisi, sisi, 14 * s)
  );

  // Busur "G": lingkaran berpusat (32,32) jari-jari 21, tebal 10,5, TERBUKA di
  // sisi kanan - large-arc=1 pada ikon aslinya berarti jalan memutar.
  const cx = X(32);
  const cy = Y(32);
  const jari = 21 * s;
  const tebal = 5.25 * s;
  k.bentuk(batasPenuh, LOGO_BUSUR, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.hypot(dx, dy);
    if (Math.abs(d - jari) > tebal) return false;
    // Bagian yang DILEWATI busur: sudut di luar celah kanan.
    return Math.abs(Math.atan2(dy, dx)) > SUDUT_UJUNG;
  });

  // Tutup bulat di kedua ujung busur.
  for (const [ux, uy] of [
    [X(45), Y(16)],
    [X(45), Y(48)],
  ]) {
    k.bentuk(batasPenuh, LOGO_BUSUR, (x, y) => diDalamCakram(x, y, ux, uy, tebal));
  }

  // Batang mendatar "G".
  k.bentuk(batasPenuh, LOGO_BUSUR, (x, y) =>
    diDalamRuas(x, y, X(31), Y(31), X(45), Y(31), tebal)
  );

  // Titik emas.
  k.bentuk(batasPenuh, LOGO_TITIK, (x, y) =>
    diDalamCakram(x, y, X(45.5), Y(45.5), 8 * s)
  );
}

// ---------------------------------------------------------------------------
// Penyandi PNG
// ---------------------------------------------------------------------------

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABEL_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bagian(jenis: string, data: Buffer): Buffer {
  const panjang = Buffer.alloc(4);
  panjang.writeUInt32BE(data.length, 0);
  const isi = Buffer.concat([Buffer.from(jenis, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(isi), 0);
  return Buffer.concat([panjang, isi, crc]);
}

/** PNG 8-bit RGBA, tanpa interlace. Cukup untuk keperluan di sini. */
export function sandikanPng(lebar: number, tinggi: number, rgba: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lebar, 0);
  ihdr.writeUInt32BE(tinggi, 4);
  ihdr[8] = 8; // kedalaman bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // kompresi deflate
  ihdr[11] = 0; // penyaring standar
  ihdr[12] = 0; // tanpa interlace

  // Tiap baris didahului satu bita jenis penyaring; 0 = tanpa penyaring.
  const mentah = Buffer.alloc(tinggi * (1 + lebar * 4));
  for (let y = 0; y < tinggi; y++) {
    const awalBaris = y * (1 + lebar * 4);
    mentah[awalBaris] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * lebar * 4, lebar * 4).copy(
      mentah,
      awalBaris + 1
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bagian("IHDR", ihdr),
    bagian("IDAT", zlib.deflateSync(mentah, { level: 9 })),
    bagian("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Spesimen
// ---------------------------------------------------------------------------

export interface HasilSpesimen {
  png: Buffer;
  lebar: number;
  tinggi: number;
  /** Jumlah modul per sisi QR - berguna untuk diperiksa di test. */
  modul: number;
}

/**
 * QR berlogo Gajihub sebagai PNG.
 *
 * Koreksi galat tingkat **H** (pulih sampai 30%) dipakai SELALU, bukan pilihan
 * template: tanpa itu, melubangi tengahnya untuk logo membuat QR gagal dibaca.
 */
export function buatSpesimenQr(
  tautan: string,
  template: TemplateSpesimenTte = TEMPLATE_BAWAAN
): HasilSpesimen {
  const qr = QRCode.create(tautan, { errorCorrectionLevel: "H" });
  const modul = qr.modules.size;
  const data = qr.modules.data;

  const mp = template.pikselPerModul;
  const tepi = template.modulTepi * mp;
  const sisiQr = modul * mp;
  const sisi = sisiQr + tepi * 2;

  const k = new Kanvas(sisi, sisi, template.warnaLatar);

  for (let baris = 0; baris < modul; baris++) {
    for (let kolom = 0; kolom < modul; kolom++) {
      if (data[baris * modul + kolom]) {
        k.kotak(tepi + kolom * mp, tepi + baris * mp, mp, mp, template.warnaQr);
      }
    }
  }

  if (template.pakaiLogo) {
    const sisiLencana = Math.round(sisiQr * template.rasioLencana);
    // Bantalan putih di sekeliling logo supaya modul gelap tidak menempel ke
    // tepinya - pemindai butuh batas yang bersih.
    const bantalan = Math.max(2, Math.round(mp * 0.75));
    const kotakSisi = sisiLencana + bantalan * 2;
    const kotakX = Math.round((sisi - kotakSisi) / 2);
    const kotakY = kotakX;
    const batasKotak = {
      x0: kotakX,
      y0: kotakY,
      x1: kotakX + kotakSisi,
      y1: kotakY + kotakSisi,
    };
    k.bentuk(batasKotak, template.warnaLatar, (x, y) =>
      diDalamPersegiMembulat(x, y, kotakX, kotakY, kotakSisi, kotakSisi, kotakSisi * 0.22)
    );
    gambarLogoGajihub(k, kotakX + bantalan, kotakY + bantalan, sisiLencana);
  }

  return { png: sandikanPng(sisi, sisi, k.rgba), lebar: sisi, tinggi: sisi, modul };
}
