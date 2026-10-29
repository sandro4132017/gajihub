// ============================================================================
// PENYIMPANAN BERKAS PRIVAT - unggahan yang TIDAK boleh dilayani sebagai berkas
// statis.
//
// Berkas di `public/` dilayani Next.js apa adanya; satu-satunya penjaganya
// middleware, dan itu hanya menjawab "ada sesi atau tidak" - bukan "orang ini
// berhak atas dokumen ini". Bukti dukung banding memuat dokumen pribadi pegawai
// (SK, surat sakit), dan SPTJM memuat agregasi nominal unit. Maka berkas disimpan
// DI LUAR `public/` dan hanya keluar lewat Route Handler yang memeriksa izin
// per dokumen.
//
// KUNCI YANG DISIMPAN DI DATABASE berbentuk `<jenis>/<relatif>` (tanpa garis
// miring depan, tanpa encoding). Bentuk lama `/uploads/<jenis>/<relatif>?query`
// tetap DIBACA supaya baris lama tidak perlu diubah, tapi tidak lagi ditulis.
//
// Semua fungsi penguraian di sini PURE. Yang menyentuh disk hanya
// `bacaBerkasPrivat`.
// ============================================================================

import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";

export const JENIS_BERKAS = ["bukti-dukung", "tte"] as const;
export type JenisBerkas = (typeof JENIS_BERKAS)[number];

export interface ReferensiUrai {
  jenis: JenisBerkas;
  /** Jalur di bawah folder jenis, selalu berpemisah `/`, tanpa encoding. */
  relatif: string;
}

/**
 * Folder akar penyimpanan. `GAJIHUB_STORAGE_DIR` (path absolut) menimpa bawaan
 * `<root proyek>/storage/uploads` - berguna kalau deploy ingin menaruh unggahan
 * di volume terpisah supaya tidak ikut terhapus saat rilis.
 */
export function akarStorage(): string {
  const dariEnv = process.env.GAJIHUB_STORAGE_DIR?.trim();
  if (dariEnv && path.isAbsolute(dariEnv)) return dariEnv;
  return path.join(process.cwd(), "storage", "uploads");
}

/** Folder cadangan bila nama unit tidak bisa dijadikan nama folder. */
export const FOLDER_UNIT_CADANGAN = "_unit-tidak-diketahui";
const PANJANG_MAKS_FOLDER = 120;
const NAMA_RESERVED_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * Nama satuan kerja -> nama folder yang sah di Windows maupun Linux. PURE, tidak
 * pernah melempar, dan hasilnya selalu satu segmen (tanpa pemisah path) yang
 * lolos `uraiReferensi`.
 *
 * Memakai NAMA LENGKAP, bukan slug 32 huruf: dua unit berawalan sama tidak boleh
 * berbagi folder. Kalau harus dipotong (> 120 karakter), akhiran hash dari nama
 * ASLI ditambahkan supaya dua nama panjang yang awalnya sama tetap berbeda.
 */
export function namaFolderUnit(satuanKerja: string | null | undefined): string {
  const asli = typeof satuanKerja === "string" ? satuanKerja : "";
  let nama = asli
    // eslint-disable-next-line no-control-regex
    .replace(/[\/\\:*?"<>|\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    // Windows menolak titik/spasi di ujung nama folder.
    .replace(/^[. ]+|[. ]+$/g, "");

  if (!nama) return FOLDER_UNIT_CADANGAN;

  if (nama.length > PANJANG_MAKS_FOLDER) {
    const sidik = createHash("sha256").update(asli).digest("hex").slice(0, 8);
    nama = nama.slice(0, PANJANG_MAKS_FOLDER - 9).replace(/[. ]+$/g, "") + "-" + sidik;
  }
  if (NAMA_RESERVED_WINDOWS.test(nama)) nama = "_" + nama;
  return nama;
}

/** `2026-08`. Melempar untuk periode yang bukan bulan/tahun sah. */
export function folderPeriode(tahun: number, bulan: number): string {
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun) || tahun < 2000 || tahun > 2200) {
    throw new Error("Periode tidak sah.");
  }
  return `${tahun}-${String(bulan).padStart(2, "0")}`;
}

/** Kunci draft SPTJM: `tte/<unit>/<tahun-bulan>/draft_<id>.pdf`. */
export function kunciDraftTte(satker: string, tahun: number, bulan: number, id: string): string {
  return `tte/${namaFolderUnit(satker)}/${folderPeriode(tahun, bulan)}/draft_${id}.pdf`;
}

/** Kunci berkas bertanda tangan: `tte/<unit>/<tahun-bulan>/<id>/<nama>`. */
export function kunciSignedTte(
  satker: string,
  tahun: number,
  bulan: number,
  id: string,
  namaResmi: string
): string {
  return `tte/${namaFolderUnit(satker)}/${folderPeriode(tahun, bulan)}/${id}/${namaResmi}`;
}

/** Kunci pratinjau tanpa baris DB: `tte/<unit>/<tahun-bulan>/Draft - <nama>`. */
export function kunciPratinjauTte(
  satker: string,
  tahun: number,
  bulan: number,
  namaResmi: string
): string {
  return `tte/${namaFolderUnit(satker)}/${folderPeriode(tahun, bulan)}/Draft - ${namaResmi}`;
}

/** Kunci bukti dukung: `bukti-dukung/<unit pegawai>/<nama tersimpan>`. */
export function kunciBuktiDukung(satkerPegawai: string, namaTersimpan: string): string {
  return `bukti-dukung/${namaFolderUnit(satkerPegawai)}/${namaTersimpan}`;
}

function jenisSah(nilai: string): nilai is JenisBerkas {
  return (JENIS_BERKAS as readonly string[]).includes(nilai);
}

/**
 * Mengurai referensi berkas dari database menjadi `{jenis, relatif}`, atau
 * `null` kalau bentuknya tidak sah.
 *
 * Dua bentuk diterima: `/uploads/<jenis>/<rel>?query` (lama, ter-encode) dan
 * `<jenis>/<rel>` (baru). Yang ditolak tanpa kompromi: URL berskema
 * (`http://placeholder.local/...` dari seed), segmen `..`/`.`/kosong, `\`,
 * NUL, `:` (huruf drive Windows), segmen berakhiran titik atau spasi, dan
 * jenis di luar daftar. Penolakan dilakukan SESUDAH decode, jadi `..%2F` dan
 * `%2e%2e` tidak lolos.
 *
 * Segmen berakhiran titik/spasi ditolak karena Win32 membuangnya diam-diam:
 * `".. "` lolos pemeriksaan `..` di sini tapi dibaca sebagai `..` oleh sistem
 * berkas. Penolakan ini membuat hasilnya sama di Windows maupun Linux. Nama
 * yang dibentuk Gajihub sendiri tidak pernah berakhiran begitu - lihat
 * namaFolderUnit().
 */
export function uraiReferensi(ref: string): ReferensiUrai | null {
  if (typeof ref !== "string") return null;
  const mentah = ref.trim();
  if (!mentah) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(mentah)) return null;

  const tanpaQuery = mentah.split("?")[0];

  let isi: string;
  if (tanpaQuery.startsWith("/uploads/")) {
    try {
      isi = decodeURIComponent(tanpaQuery.slice("/uploads/".length));
    } catch {
      return null;
    }
  } else if (tanpaQuery.startsWith("/")) {
    return null;
  } else {
    isi = tanpaQuery;
  }

  if (isi.includes("\\") || isi.includes("\0") || isi.includes(":")) return null;

  const segmen = isi.split("/");
  if (segmen.length < 2) return null;
  if (segmen.some((s) => s === "" || s === "." || s === ".." || /[. ]$/.test(s))) return null;

  const [jenis, ...sisa] = segmen;
  if (!jenisSah(jenis)) return null;
  return { jenis, relatif: sisa.join("/") };
}

/**
 * Referensi -> path absolut di bawah folder jenisnya, atau `null`.
 * Jenis hasil urai HARUS sama dengan yang diharapkan pemanggil: baris bukti
 * dukung tidak boleh dipakai membaca berkas TTE, dan sebaliknya.
 */
export function jalurAman(
  ref: string,
  jenisDiharapkan: JenisBerkas,
  akar: string = akarStorage()
): string | null {
  const urai = uraiReferensi(ref);
  if (!urai || urai.jenis !== jenisDiharapkan) return null;

  const dirJenis = path.resolve(akar, urai.jenis);
  const hasil = path.resolve(dirJenis, ...urai.relatif.split("/"));
  const rel = path.relative(dirJenis, hasil);
  if (!rel || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    return null;
  }
  return hasil;
}

function diDalam(dir: string, target: string): boolean {
  const rel = path.relative(dir, target);
  return !!rel && rel !== ".." && !rel.startsWith(".." + path.sep) && !path.isAbsolute(rel);
}

/**
 * Membaca berkas di `jalur` (hasil jalurAman) SETELAH memastikan lokasi
 * aslinya masih di dalam folder jenisnya.
 *
 * jalurAman hanya memeriksa teks path. Symlink di bawah penyimpanan bisa
 * menunjuk ke mana saja (mis. ke `.env` atau berkas unit lain), jadi lokasi
 * nyata kedua sisi dibandingkan lewat `realpath`. Kalau keluar, dilempar
 * galat ber-`code` "ENOENT" - pemanggil memperlakukannya sama dengan berkas
 * yang hilang (404), tanpa membocorkan bahwa ada sesuatu di sana.
 */
export async function bacaBerkasDalamAkar(
  jalur: string,
  jenis: JenisBerkas,
  akar: string = akarStorage()
): Promise<Buffer> {
  const [asli, dirAsli] = await Promise.all([fs.realpath(jalur), fs.realpath(path.resolve(akar, jenis))]);
  if (!diDalam(dirAsli, asli)) {
    throw Object.assign(new Error("Berkas berada di luar penyimpanan."), { code: "ENOENT" });
  }
  return fs.readFile(asli);
}

/** Membaca satu berkas dari penyimpanan privat. `null` bila referensi tak sah. */
export async function bacaBerkasPrivat(
  ref: string,
  jenisDiharapkan: JenisBerkas
): Promise<Buffer | null> {
  const jalur = jalurAman(ref, jenisDiharapkan);
  if (!jalur) return null;
  return bacaBerkasDalamAkar(jalur, jenisDiharapkan);
}

const TIPE_KONTEN: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/** Daftar putih tipe yang boleh disajikan inline. Selain itu `null`. */
export function tipeKonten(nama: string): string | null {
  const ext = path.extname(nama).toLowerCase();
  return TIPE_KONTEN[ext] ?? null;
}

function namaAscii(nama: string): string {
  return nama.replace(/[^\x20-\x7e]/g, "_").replace(/["\\%;]/g, "_");
}

function encodeRfc5987(nilai: string): string {
  return encodeURIComponent(nilai).replace(
    /['()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

/**
 * Header respons untuk menyajikan satu berkas privat. Tipe di luar daftar putih
 * dipaksa `attachment` bertipe `application/octet-stream`: peramban tidak
 * pernah diminta menafsirkannya.
 *
 * `private, no-store` dan `nosniff` WAJIB - dokumen penggajian tidak boleh
 * mengendap di cache bersama, dan isinya tidak boleh ditebak ulang tipenya.
 *
 * `Content-Security-Policy: sandbox` dipasang untuk SEMUA tipe KECUALI PDF:
 * gambar yang dibuka langsung tidak bisa menjalankan skrip atau memuat apa pun
 * walau isinya dimanipulasi. PDF sengaja dikecualikan - penampil PDF bawaan
 * peramban (Chrome) tidak jalan di dokumen ber-sandbox dan halamannya tampil
 * kosong. PDF dijaga oleh pemeriksaan magic byte saat unggah dan `nosniff`.
 */
export function headerUnduh(
  nama: string,
  opsi: { inline: boolean; panjang: number }
): Record<string, string> {
  const tipe = tipeKonten(nama);
  const inline = opsi.inline && tipe !== null;
  return {
    "Content-Type": tipe ?? "application/octet-stream",
    "Content-Length": String(opsi.panjang),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${namaAscii(
      nama
    )}"; filename*=UTF-8''${encodeRfc5987(nama)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    ...(tipe === "application/pdf"
      ? {}
      : { "Content-Security-Policy": "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
  };
}

/**
 * Apakah isi berkas sesuai ekstensi yang diklaim? Ekstensi hanya label dari
 * pengunggah; yang menentukan adalah bita pertamanya.
 */
export function cocokTandaTangan(isi: Uint8Array, ekstensi: string): boolean {
  const ext = ekstensi.toLowerCase().replace(/^\./, "");
  const awal = (...bita: number[]) => bita.every((b, i) => isi[i] === b);
  switch (ext) {
    case "pdf":
      return isi.length >= 5 && awal(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
    case "png":
      return isi.length >= 8 && awal(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "jpg":
    case "jpeg":
      return isi.length >= 3 && awal(0xff, 0xd8, 0xff);
    case "webp":
      return (
        isi.length >= 12 &&
        awal(0x52, 0x49, 0x46, 0x46) && // RIFF
        isi[8] === 0x57 &&
        isi[9] === 0x45 &&
        isi[10] === 0x42 &&
        isi[11] === 0x50 // WEBP
      );
    default:
      return false;
  }
}
