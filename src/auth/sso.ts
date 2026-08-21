/**
 * SSO Kemnaker (Naco) - OAuth 2.0 Authorization Code Grant.
 *
 * Sumber: https://codes.kemnaker.go.id/naker-api/naco-api
 * (`README.md` + `AUTH_CODE_GRANT.md`, dibaca 21 Agustus 2026).
 *
 * Alur resminya:
 *   1. Arahkan browser ke  GET  {BASE}/auth?response_type=code&client_id=..
 *                               &redirect_uri=..&scope=basic email
 *   2. Pengguna login & mengizinkan (layanan terverifikasi lolos otomatis)
 *   3. Naco mengalihkan balik ke  {redirect_uri}?code=AUTHORIZATION_CODE
 *   4. Server menukar kode:  POST {BASE}/api/v1/tokens   (JSON)
 *   5. Balasannya  { data: { access_token, refresh_token, expires_in, .. } }
 *   6. Ambil identitas:      GET  {BASE}/api/v1/users/me  (Bearer token)
 *   7. Refresh:              POST {BASE}/api/v1/tokens  grant_type=refresh_token
 *
 * ---------------------------------------------------------------------------
 * CATATAN PENTING - LANGKAH 6 BELUM TERDOKUMENTASI
 * ---------------------------------------------------------------------------
 * Dokumentasi Naco memberi contoh balasan untuk langkah 5, TAPI TIDAK untuk
 * langkah 6. Padahal justru di situ satu-satunya hal yang benar-benar
 * dibutuhkan Gajihub: **NIP**.
 *
 * Seluruh data di sistem ini berkunci NIP - `Pegawai`, `User`, presensi,
 * kalkulasi, approval, banding. Sementara scope yang disebut dokumentasi
 * cuma `basic email`, dan email BUKAN NIP.
 *
 * Karena bentuk balasannya belum diketahui, `cariNipDariInfo()` di bawah
 * MENCARI, bukan menebak: ia menelusuri seluruh isi balasan untuk menemukan
 * nilai berbentuk NIP (18 digit). Kalau ketemu, dipakai; kalau tidak, alur
 * login DIHENTIKAN dengan halaman yang mendaftar nama-nama field yang
 * benar-benar dikirim Naco - jadi satu kali percobaan login sudah cukup untuk
 * memastikan bentuknya, tanpa menebak-nebak.
 *
 * Begitu bentuknya diketahui, isi `NACO_FIELD_NIP` di `.env` supaya
 * pembacaannya jadi eksplisit dan tidak lagi bergantung pada penelusuran.
 */

export interface KonfigurasiSso {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  /** Nama field NIP di balasan /users/me, kalau sudah diketahui. */
  fieldNip: string | null;
}

/** Panjang NIP baru ASN. Dipakai mengenali NIP di balasan yang belum diketahui bentuknya. */
const PANJANG_NIP = 18;

export function konfigurasiSso(): KonfigurasiSso | null {
  const clientId = process.env.NACO_CLIENT_ID?.trim();
  const clientSecret = process.env.NACO_CLIENT_SECRET?.trim();
  const redirectUri = process.env.NACO_REDIRECT_URI?.trim();
  // Semua wajib. Kalau salah satu kosong, SSO dianggap BELUM dipasang dan
  // tombolnya tidak dirender - lebih baik daripada tombol yang kelihatan
  // aktif lalu gagal dengan galat mentah dari Naco.
  if (!clientId || !clientSecret || !redirectUri) return null;

  return {
    baseUrl: (process.env.NACO_BASE_URL?.trim() || "https://account.kemnaker.go.id").replace(/\/+$/, ""),
    clientId,
    clientSecret,
    redirectUri,
    scope: process.env.NACO_SCOPE?.trim() || "basic email",
    fieldNip: process.env.NACO_FIELD_NIP?.trim() || null,
  };
}

export function ssoAktif(): boolean {
  return konfigurasiSso() !== null;
}

/** Langkah 1 - alamat yang dibukakan ke browser pengguna. */
export function urlOtorisasi(cfg: KonfigurasiSso, state: string): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: cfg.scope,
    // TIDAK disebut dokumentasi Naco, tapi WAJIB ada: tanpa `state`, alamat
    // callback bisa dipanggil siapa saja dengan kode milik orang lain (CSRF
    // login). Nilainya dicocokkan ulang dengan cookie di Route Handler.
    state,
  });
  return `${cfg.baseUrl}/auth?${q.toString()}`;
}

export interface HasilToken {
  accessToken: string;
  refreshToken: string | null;
  kedaluwarsaDetik: number | null;
}

/** Langkah 4 & 5 - tukar authorization code jadi access token. */
export async function tukarKodeKeToken(cfg: KonfigurasiSso, code: string): Promise<HasilToken> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/tokens`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: cfg.redirectUri,
    }),
    cache: "no-store",
  });

  const teks = await res.text();
  if (!res.ok) {
    // Isi balasannya ikut dibawa: galat Naco biasanya menjelaskan sebabnya
    // (redirect_uri tidak cocok, kode kedaluwarsa, client salah), dan tanpa
    // itu yang terbaca cuma "gagal".
    throw new Error(`Naco menolak penukaran kode (HTTP ${res.status}): ${teks.slice(0, 300)}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(teks);
  } catch {
    throw new Error(`Balasan Naco bukan JSON: ${teks.slice(0, 200)}`);
  }

  // Dokumentasi membungkus isinya di dalam `data`. Bentuk tanpa pembungkus
  // ikut diterima supaya tidak patah kalau formatnya berbeda antar lingkungan.
  const d = (isObjek(json) && isObjek(json.data) ? json.data : json) as Record<string, unknown>;
  const accessToken = typeof d.access_token === "string" ? d.access_token : null;
  if (!accessToken) {
    throw new Error(`Balasan Naco tidak memuat access_token. Field yang ada: ${Object.keys(d).join(", ")}`);
  }

  return {
    accessToken,
    refreshToken: typeof d.refresh_token === "string" ? d.refresh_token : null,
    kedaluwarsaDetik: typeof d.expires_in === "number" ? d.expires_in : null,
  };
}

/** Langkah 6 - identitas pengguna. Balasannya dikembalikan APA ADANYA. */
export async function ambilInfoPengguna(cfg: KonfigurasiSso, accessToken: string): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
  });
  const teks = await res.text();
  if (!res.ok) {
    throw new Error(`Naco menolak permintaan identitas (HTTP ${res.status}): ${teks.slice(0, 300)}`);
  }
  try {
    return JSON.parse(teks);
  } catch {
    throw new Error(`Balasan identitas bukan JSON: ${teks.slice(0, 200)}`);
  }
}

function isObjek(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Bentuk NIP baru ASN: 18 digit, tanpa pemisah. */
export function berbentukNip(v: unknown): v is string {
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
  return s.length === PANJANG_NIP && /^\d+$/.test(s);
}

/**
 * Menemukan NIP di dalam balasan `/users/me` yang bentuknya belum
 * terdokumentasi.
 *
 * Dua tahap, dan urutannya disengaja:
 *   1. Kalau `NACO_FIELD_NIP` diisi, pakai field itu SAJA - eksplisit menang
 *      atas tebakan, dan begitu bentuknya sudah dipastikan manusia, tidak ada
 *      lagi penelusuran yang bisa salah sasaran.
 *   2. Kalau belum diisi, telusuri seluruh isi balasan dan ambil nilai
 *      pertama yang BERBENTUK NIP (18 digit).
 *
 * Tahap 2 SENGAJA tidak mencocokkan nama field (`nip`, `employee_id`, dst):
 * nama field bisa apa saja, sementara bentuk 18 digit jauh lebih jarang
 * salah. Field yang namanya jelas-jelas bukan identitas pegawai (nomor
 * telepon, NIK 16 digit) tidak akan lolos karena panjangnya berbeda.
 */
export function cariNipDariInfo(info: unknown, fieldNip: string | null): string | null {
  if (fieldNip) {
    const nilai = ambilJalur(info, fieldNip);
    return berbentukNip(nilai) ? String(nilai).trim() : null;
  }
  let ketemu: string | null = null;
  telusuri(info, (_jalur, nilai) => {
    if (ketemu === null && berbentukNip(nilai)) ketemu = String(nilai).trim();
  });
  return ketemu;
}

/** Ambil nilai lewat jalur bertitik, mis. "data.user.nip". */
function ambilJalur(sumber: unknown, jalur: string): unknown {
  let kini: unknown = sumber;
  for (const bagian of jalur.split(".")) {
    if (!isObjek(kini)) return undefined;
    kini = kini[bagian];
  }
  return kini;
}

/**
 * Daftar field yang benar-benar dikirim Naco, untuk ditampilkan waktu NIP
 * tidak ketemu.
 *
 * NILAINYA SENGAJA TIDAK IKUT DITAMPILKAN, kecuali yang berbentuk NIP. Ini
 * halaman galat yang muncul di layar orang yang sedang login, dan balasan
 * identitas bisa memuat data pribadi (email, nomor telepon, NIK). Yang
 * dibutuhkan untuk memperbaiki konfigurasi cuma NAMA field-nya.
 */
export function ringkasFieldInfo(info: unknown): { jalur: string; tipe: string; berbentukNip: boolean }[] {
  const hasil: { jalur: string; tipe: string; berbentukNip: boolean }[] = [];
  telusuri(info, (jalur, nilai) => {
    hasil.push({
      jalur,
      tipe: Array.isArray(nilai) ? "array" : nilai === null ? "null" : typeof nilai,
      berbentukNip: berbentukNip(nilai),
    });
  });
  return hasil;
}

/** Menelusuri seluruh nilai skalar di dalam objek/array bersarang. */
function telusuri(sumber: unknown, pada: (jalur: string, nilai: unknown) => void, awalan = ""): void {
  if (isObjek(sumber)) {
    for (const [k, v] of Object.entries(sumber)) {
      const jalur = awalan ? `${awalan}.${k}` : k;
      if (isObjek(v) || Array.isArray(v)) telusuri(v, pada, jalur);
      else pada(jalur, v);
    }
    return;
  }
  if (Array.isArray(sumber)) {
    sumber.forEach((v, i) => {
      const jalur = `${awalan}[${i}]`;
      if (isObjek(v) || Array.isArray(v)) telusuri(v, pada, jalur);
      else pada(jalur, v);
    });
  }
}
