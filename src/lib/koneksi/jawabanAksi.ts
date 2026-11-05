// ============================================================================
// JAWABAN ROUTE HANDLER AKSI - dibaca di browser, murni (tanpa React/Prisma).
//
// Alur kirim rekap memanggil Route Handler JSON, bukan Server Action, karena
// firewall jaringan memblokir body multipart Server Action. Kalau yang kembali
// BUKAN JSON (halaman blokir firewall, halaman login, galat proxy), isinya
// tidak pernah ditampilkan - hanya kalimat yang disusun di sini.
//
// `tidakPasti` = klien tidak tahu apakah server sempat memproses permintaannya.
// Pemanggil wajib menyegarkan halaman dan tidak boleh berkata "tidak ada data
// yang berubah".
// ============================================================================

export interface JawabanAksi {
  error?: string;
  success?: string;
  tidakPasti?: boolean;
}

export const PESAN_JARINGAN =
  "Tidak dapat menghubungi server Gajihub. Periksa jaringan kantor/VPN lalu coba lagi.";

/** Kalimat untuk jawaban yang bukan JSON. Isi body tidak ikut dipakai. */
export function pesanResponsBukanJson(status: number, redirected: boolean, url: string): string {
  let jalur = url;
  try {
    jalur = new URL(url, "http://lokal").pathname;
  } catch {
    // url tak terbaca: pakai apa adanya
  }
  if (redirected || /\/login\/?$/.test(jalur)) return "Sesi berakhir, silakan login ulang.";
  if (status === 502 || status === 504) {
    return `Waktu tunggu proxy habis (HTTP ${status}). Periksa dulu hasilnya sebelum mengulang.`;
  }
  if (status === 401 || status === 403) {
    return `Server menolak permintaan (HTTP ${status}). Kemungkinan diblokir firewall atau sesi berakhir; laporkan ke Admin Gajihub bila berulang.`;
  }
  if (status === 500) {
    return "Permintaan ditolak firewall jaringan. Jangan diulang berkali-kali (alamat IP bisa terkunci sementara); laporkan ke Admin Gajihub.";
  }
  return `Server memberi jawaban yang tidak terduga (HTTP ${status}). Laporkan ke Admin Gajihub bila berulang.`;
}

/** Baca Response dari Route Handler aksi. Tidak pernah melempar. */
export async function bacaJawabanAksi(res: Response): Promise<JawabanAksi> {
  const tipe = res.headers.get("content-type") ?? "";
  if (!tipe.includes("application/json")) {
    return { error: pesanResponsBukanJson(res.status, res.redirected, res.url), tidakPasti: true };
  }
  try {
    const data: unknown = await res.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { error: pesanResponsBukanJson(res.status, false, ""), tidakPasti: true };
    }
    const { error, success } = data as { error?: unknown; success?: unknown };
    const hasil: JawabanAksi = {};
    if (typeof error === "string") hasil.error = error;
    if (typeof success === "string") hasil.success = success;
    // Galat server (5xx): permintaannya bisa saja sudah sempat tertulis.
    if (res.status >= 500) hasil.tidakPasti = true;
    if (!hasil.error && !hasil.success) {
      return { error: pesanResponsBukanJson(res.status, false, ""), tidakPasti: true };
    }
    return hasil;
  } catch {
    return { error: pesanResponsBukanJson(res.status, false, ""), tidakPasti: true };
  }
}

/** POST JSON lalu baca jawabannya; kegagalan jaringan menjadi `tidakPasti`. */
export async function kirimAksiJson(url: string, body: Record<string, string | number>): Promise<JawabanAksi> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: PESAN_JARINGAN, tidakPasti: true };
  }
  return bacaJawabanAksi(res);
}
