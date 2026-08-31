import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sidik NIK - padanan NIK -> pegawai TANPA menyimpan NIK-nya.
 *
 * LATAR: SSO Naco tidak mengirimkan NIP. Diukur dua kali pada 2026-08-31 -
 * akun publik DAN akun pegawai - balasan `/users/me` pada scope `basic email`
 * berbentuk sama persis, dengan `data.username` berisi **NIK 16 digit** dan
 * tidak ada satu pun nilai 18 digit di seluruh balasan. Karena seluruh data
 * Gajihub berkunci NIP, tanpa padanan NIK->NIP tidak ada pegawai yang bisa
 * masuk lewat SSO.
 *
 * KENAPA HMAC, BUKAN HASH BIASA: NIK itu ruang yang bisa dicacah. 16 digit
 * dengan struktur yang diketahui (kode wilayah + tanggal lahir + urutan)
 * membuat SHA-256 polos bisa dibalik dengan tabel pelangi dalam waktu yang
 * masuk akal. Dengan kunci rahasia, membalikkannya butuh kunci itu - dan
 * kuncinya tidak ada di dalam database.
 *
 * KENAPA TIDAK MENYIMPAN NIK: yang dibutuhkan alur login cuma MENCOCOKKAN,
 * tidak pernah MEMBACA. Menyimpan NIK berarti menambah data pribadi 5.000
 * pegawai ke database yang sudah memuat 9.944 nomor rekening, di aplikasi
 * yang masih berjalan di HTTP dengan password = NIP.
 */

/** NIK Indonesia: 16 digit. NIP 18 digit - panjangnya yang membedakan. */
const PANJANG_NIK = 16;

/**
 * Membaca sebuah nilai sebagai NIK, atau `null`.
 *
 * Pemisah yang dibersihkan SENGAJA cuma spasi, titik, dan strip - alasan yang
 * sama persis dengan `normalkanNip()` di `sso.ts`: membuang semua non-digit
 * bisa menyambung dua angka tak berhubungan jadi 16 digit palsu.
 *
 * Tipe `number` DITOLAK. 16 digit sudah melewati batas aman bilangan JSON
 * (9007199254740991, 16 digit) - sebagian nilai 16 digit masih utuh, sebagian
 * sudah bergeser, dan tidak ada cara membedakannya setelah terlanjur di-parse.
 * Menerima yang "kebetulan utuh" berarti membiarkan sisanya salah orang.
 */
export function normalkanNik(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[ .\-]/g, "").trim();
  return s.length === PANJANG_NIK && /^\d+$/.test(s) ? s : null;
}

/**
 * Sidik untuk sebuah NIK, atau `null` kalau nilainya bukan NIK.
 *
 * `kunci` diterima sebagai PARAMETER, bukan dibaca dari `process.env` di dalam
 * sini - supaya fungsi ini tetap murni dan bisa diuji tanpa menyetel
 * lingkungan. Pembacaan env-nya ada di `kunciSidikNik()` di bawah.
 */
export function sidikNik(nik: unknown, kunci: string): string | null {
  const bersih = normalkanNik(nik);
  if (!bersih) return null;
  if (!kunci) throw new Error("Kunci sidik NIK kosong - lihat kunciSidikNik().");
  return createHmac("sha256", kunci).update(bersih, "utf8").digest("hex");
}

/**
 * Kunci dari lingkungan. **SENGAJA MELEMPAR kalau belum diisi**, tidak
 * memakai nilai cadangan.
 *
 * Ini pelajaran dari `getSecretKey()` di `session.ts`, yang diam-diam memakai
 * `"dev-only-insecure-secret-..."` kalau `SESSION_SECRET` kosong - tanpa galat,
 * tanpa peringatan, dan nilainya ada di repo yang PUBLIK. Kalau fungsi ini
 * ikut punya cadangan, kunci itu juga akan ada di repo publik, dan sidik NIK
 * seluruh pegawai bisa dihitung ulang siapa saja - persis menghapus satu-
 * satunya alasan memakai HMAC.
 *
 * Panjang minimum 32 karakter: kunci pendek membuat pencarian menyeluruh
 * kembali masuk akal.
 */
export function kunciSidikNik(): string {
  const kunci = process.env.SIDIK_NIK_SECRET?.trim();
  if (!kunci) {
    throw new Error(
      "SIDIK_NIK_SECRET belum diisi di .env. Tanpa itu padanan NIK->NIP tidak bisa dihitung, " +
        "dan login SSO tidak akan pernah cocok. Isi dengan nilai acak minimal 32 karakter " +
        "(mis. `openssl rand -hex 32`), lalu jalankan ulang `npm run sync:pegawai`."
    );
  }
  if (kunci.length < 32) {
    throw new Error("SIDIK_NIK_SECRET terlalu pendek - minimal 32 karakter.");
  }
  return kunci;
}

/**
 * Perbandingan dua sidik yang waktunya tidak bergantung isinya.
 *
 * Dipakai kalau suatu saat sidik dibandingkan di dalam kode (bukan lewat
 * `WHERE sidik_nik = ...` di database, yang memang tidak lewat sini).
 * Berlebihan? Mungkin. Tapi biayanya nol dan ini jalur autentikasi.
 */
export function sidikSama(a: string | null, b: string | null): boolean {
  if (!a || !b || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}
