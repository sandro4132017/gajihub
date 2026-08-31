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

/**
 * Alamat PUBLIK aplikasi ini - yang dilihat browser, bukan yang dilihat server.
 *
 * WAJIB dipakai untuk setiap redirect yang keluar dari Route Handler. Di
 * belakang proxy, `req.url` berisi alamat INTERNAL (http://localhost:3002),
 * sehingga `new URL("/login", req.url)` menghasilkan Location yang tidak bisa
 * dijangkau browser siapa pun. Terbukti di server: callback SSO membalas
 * `307 -> http://localhost:3002/login?...`, dan redirect SESUDAH login
 * berhasil pun kena hal yang sama.
 *
 * (Redirect di middleware TIDAK kena karena Next menormalkannya jadi relatif.)
 *
 * Urutan sumbernya disengaja:
 *   1. Asal NACO_REDIRECT_URI - alamat publik yang paling sahih, karena nilai
 *      itu HARUS sama persis dengan yang didaftarkan ke Naco.
 *   2. Header X-Forwarded-* dari proxy.
 *   3. Asal permintaan - jalur terakhir, benar saat jalan tanpa proxy.
 */
export function asalPublik(headers: Headers, asalPermintaan: string): string {
  const dariRedirect = process.env.NACO_REDIRECT_URI?.trim();
  if (dariRedirect) {
    try {
      return new URL(dariRedirect).origin;
    } catch {
      // Nilainya bukan URL sah - jatuh ke sumber berikutnya, jangan melempar.
      // Route yang melempar di sini membalas 500 pada halaman login.
    }
  }
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) {
    const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
    if (proto) return `${proto}://${host}`;
    try {
      return `${new URL(asalPermintaan).protocol}//${host}`;
    } catch {
      /* jatuh ke bawah */
    }
  }
  return new URL(asalPermintaan).origin;
}

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

/**
 * Membaca sebuah nilai sebagai NIP baru ASN (18 digit), atau `null`.
 *
 * DUA KEPUTUSAN DI SINI, keduanya soal SALAH ORANG - bukan soal kerapian.
 *
 * 1. **Pemisah dibersihkan, TAPI hanya spasi, titik, dan strip.** NIP lazim
 *    ditulis "19870323 201503 1 002", dan menolak bentuk itu berarti NIP yang
 *    sebenarnya DIKIRIM Naco terbaca sebagai tidak ada - pegawainya ditolak
 *    login untuk data yang sebetulnya lengkap. Yang dibersihkan sengaja cuma
 *    tiga karakter itu: membuang SEMUA non-digit bisa menyambung dua angka
 *    yang tidak berhubungan (mis. `"08123456789 / 2024"`) jadi 18 digit palsu.
 *
 * 2. **Tipe `number` DITOLAK, walau digitnya pas 18.** NIP 18 digit melebihi
 *    presisi bilangan JSON (float64 aman sampai 9007199254740991 - 16 digit),
 *    jadi begitu Naco mengirimnya sebagai angka, digit terakhirnya sudah
 *    berubah jadi nol SEBELUM kode ini melihatnya:
 *
 *        JSON.parse('{"nip": 197303072005011001}').nip  ->  197303072005011000
 *
 *    Nilainya tidak bisa dipulihkan dari mana pun, dan menerimanya berarti
 *    menerbitkan sesi atas NIP yang bukan milik siapa pun - atau, lebih buruk,
 *    milik orang lain yang NIP-nya kebetulan berakhir `000`. Ini jebakan yang
 *    SAMA PERSIS dengan 46 baris ber-NIP `...000` di `basis data
 *    gaji_Kemnaker.xlsx`, cuma lewat pintu yang berbeda. Yang benar: minta
 *    Naco mengirimkan NIP sebagai STRING, dan sampai itu terjadi login
 *    dihentikan dengan sebab yang disebutkan.
 */
export function normalkanNip(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/[ .\-]/g, "").trim();
  return s.length === PANJANG_NIP && /^\d+$/.test(s) ? s : null;
}

/** Bentuk NIP baru ASN: 18 digit, pemisah spasi/titik/strip boleh. */
export function berbentukNip(v: unknown): v is string {
  return normalkanNip(v) !== null;
}

/**
 * Apakah nilai ini SEHARUSNYA NIP tapi datang sebagai angka (jadi sudah rusak)?
 *
 * Dipakai HANYA untuk menjelaskan kegagalan ke log - supaya "tidak ketemu NIP"
 * bisa dibedakan dari "NIP dikirim, tapi tipenya salah". Dua sebab itu punya
 * tindak lanjut yang berbeda: yang pertama urusan scope ke Naco, yang kedua
 * cukup minta mereka mengubah tipe field-nya.
 */
export function nipRusakKarenaAngka(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v) && String(v).length === PANJANG_NIP;
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
    return normalkanNip(ambilJalur(info, fieldNip));
  }
  let ketemu: string | null = null;
  telusuri(info, (_jalur, nilai) => {
    if (ketemu !== null) return;
    const normal = normalkanNip(nilai);
    if (normal) ketemu = normal;
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
/**
 * Ringkasan BENTUK tiap field - nama, tipe, panjang, dan berapa digit yang
 * dikandungnya. NILAINYA TIDAK PERNAH IKUT, di jalur mana pun.
 *
 * `panjang` dan `jumlahDigit` ditambahkan setelah percobaan login dengan akun
 * PEGAWAI ternyata menghasilkan daftar field yang sama persis dengan akun
 * publik - tidak ada satu pun nilai 18 digit. Dua angka itu yang membedakan
 * "NIP-nya memang tidak dikirim" dari "NIP-nya dikirim tapi berformat lain",
 * mis. `19900101 201503 1 001` (21 karakter, 18 digit) yang ditolak
 * berbentukNip() karena ada spasinya. Tanpa keduanya, kedua kemungkinan itu
 * terlihat sama dan tidak bisa dibedakan tanpa membocorkan isinya.
 */
export function ringkasFieldInfo(
  info: unknown
): { jalur: string; tipe: string; berbentukNip: boolean; panjang: number; jumlahDigit: number }[] {
  const hasil: { jalur: string; tipe: string; berbentukNip: boolean; panjang: number; jumlahDigit: number }[] = [];
  telusuri(info, (jalur, nilai) => {
    const teks = typeof nilai === "string" || typeof nilai === "number" ? String(nilai) : "";
    hasil.push({
      jalur,
      tipe: Array.isArray(nilai) ? "array" : nilai === null ? "null" : typeof nilai,
      berbentukNip: berbentukNip(nilai),
      panjang: teks.length,
      jumlahDigit: (teks.match(/\d/g) ?? []).length,
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
