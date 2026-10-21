// ============================================================================
// ALAMAT YANG DITANAM KE DALAM QR PADA SPTJM.
//
// DULU DIAMBIL DARI HEADER PERMINTAAN (`x-forwarded-host` / `host`), dan itu
// keliru - bukan karena rapuh, tapi karena menjawab pertanyaan yang salah.
// Header itu menceritakan BAGAIMANA SATU ORANG membuka halaman saat menekan
// tombol tanda tangan; QR-nya dibaca ORANG LAIN, dari HP, berbulan-bulan
// kemudian. Dua hal yang sama sekali berbeda.
//
// Akibatnya terukur: nginx mem-proxy ke `localhost:3002`, jadi `Host` yang
// sampai ke aplikasi adalah `localhost:3002`, dan itulah yang tercetak di
// QR - HP yang memindainya membuka localhost MILIK HP ITU SENDIRI. Hal yang
// sama terjadi kalau penandatanganan dilakukan dari `npm run dev`.
//
// DAN ALAMATNYA PERMANEN. Begitu BSrE membubuhkan QR-nya, tautan itu terkunci
// di dalam PDF bertanda tangan; memperbaikinya berarti menandatangani ulang.
// Jadi lebih baik penandatanganan DIHENTIKAN dengan pesan yang jelas daripada
// menghasilkan dokumen sah yang QR-nya tidak menuju ke mana-mana.
//
// Header juga datang dari luar: nilainya bisa diatur pengirim permintaan.
// Menanam alamat pilihan orang lain ke dalam naskah dinas bertanda tangan
// elektronik bukan risiko yang perlu ditanggung demi kenyamanan.
// ============================================================================

/** Nama variabel yang dibaca, sesuai urutan keutamaan. */
export const VARIABEL_ALAMAT_TTE = [
  "TTE_VERIFY_BASE_URL",
  "NEXT_PUBLIC_APP_URL",
] as const;

/** Host yang TIDAK PERNAH berguna di QR - mereka menunjuk ke perangkat pemindai. */
const HOST_TIDAK_BISA_DIPINDAI = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "[::1]",
  "::1",
]);

const CONTOH =
  'contoh: TTE_VERIFY_BASE_URL="http://192.168.221.44:3002" atau "https://gajihub.kemnaker.go.id"';

/**
 * Alamat dasar untuk tautan di QR, tanpa garis miring di ujung.
 *
 * MELEMPAR kalau belum diatur atau tidak mungkin dipindai - sengaja, lihat
 * kepala berkas. Pola yang sama dengan `kunciSidikNik()`: kunci dan alamat
 * yang salah sama-sama gagal secara diam-diam kalau diberi nilai cadangan.
 */
export function alamatVerifikasiTte(
  env: NodeJS.ProcessEnv = process.env
): string {
  const mentah = VARIABEL_ALAMAT_TTE.map((nama) => env[nama])
    .map((v) => v?.trim().replace(/^["']|["']$/g, "") ?? "")
    .find((v) => v.length > 0);

  if (!mentah) {
    throw new Error(
      `Alamat verifikasi TTE belum diatur. Isi ${VARIABEL_ALAMAT_TTE[0]} di .env ` +
        `dengan alamat yang bisa dibuka dari HP pemindai QR - ${CONTOH}.`
    );
  }

  let url: URL;
  try {
    url = new URL(mentah);
  } catch {
    throw new Error(
      `Alamat verifikasi TTE bukan URL yang sah. Sertakan skemanya - ${CONTOH}.`
    );
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Alamat verifikasi TTE harus http atau https, bukan "${url.protocol}" - ${CONTOH}.`
    );
  }

  if (HOST_TIDAK_BISA_DIPINDAI.has(url.hostname.toLowerCase())) {
    throw new Error(
      `Alamat verifikasi TTE menunjuk "${url.hostname}", yang di HP pemindai berarti ` +
        `HP itu sendiri - QR-nya tidak akan menuju ke mana-mana. Pakai alamat yang ` +
        `dijangkau dari luar server - ${CONTOH}.`
    );
  }

  // Buang garis miring di ujung supaya penggabungannya tidak jadi "//tte/verify".
  const dasar = `${url.origin}${url.pathname}`.replace(/\/+$/, "");
  return dasar;
}

/** Tautan lengkap yang ditanam ke QR untuk satu dokumen. */
export function tautanVerifikasiDokumen(
  dokumenId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  return `${alamatVerifikasiTte(env)}/tte/verify/${dokumenId}`;
}
