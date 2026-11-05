// ============================================================================
// GALAT PER SUMBER DATA - pesan untuk layar vs. detail untuk log server.
//
// Satu aturan: pesan galat mentah (alamat server, nama user, string koneksi)
// TIDAK PERNAH sampai ke layar. Layar menerima kalimat awam + nama sumber +
// kode rujukan; detailnya (sudah disamarkan) hanya ditulis satu baris ke log
// server dengan kode rujukan yang sama, jadi Admin bisa menelusurinya.
//
// Modul ini murni: tidak mengimpor Prisma, pg, maupun mssql. Galat driver
// dikenali dari `code` / `name`-nya.
// ============================================================================
import type { SebabGangguan } from "./statusKoneksi";

export type SumberGalat = "EPRESENSI" | "SIAP" | "GAJIHUB_DB" | "LAINNYA";
export type JenisGalat = SebabGangguan | "TAK_DIKENAL";

export interface InfoGalat {
  sumber: SumberGalat;
  jenis: JenisGalat;
  kode: string | null;
}

/** Galat dari satu sumber data; `message` & `code` disalin dari galat aslinya. */
export class GalatSumber extends Error {
  readonly sumber: SumberGalat;
  readonly code?: string;
  constructor(sumber: SumberGalat, asli: unknown) {
    super(asli instanceof Error ? asli.message : String(asli), { cause: asli });
    this.name = "GalatSumber";
    this.sumber = sumber;
    const kode = (asli as { code?: unknown } | null)?.code;
    if (typeof kode === "string") this.code = kode;
  }
}

/** Konfigurasi env belum lengkap. Isi pesannya tidak ditampilkan ke layar. */
export class GalatKonfigurasi extends Error {
  readonly sumber: SumberGalat;
  constructor(message: string, sumber: SumberGalat = "LAINNYA") {
    super(message);
    this.name = "GalatKonfigurasi";
    this.sumber = sumber;
  }
}

/** Pesan yang memang ditulis aplikasi untuk pengguna; aman tampil apa adanya. */
export class GalatPengguna extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GalatPengguna";
  }
}

/** Jalankan `fn`; galat apa pun di luar tiga kelas di atas dibungkus GalatSumber. */
export async function denganSumber<T>(sumber: SumberGalat, fn: () => Promise<T> | T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof GalatPengguna || e instanceof GalatKonfigurasi || e instanceof GalatSumber) {
      throw e;
    }
    throw new GalatSumber(sumber, e);
  }
}

// ---------------------------------------------------------------------------
// Pemetaan kode -> sebab
// ---------------------------------------------------------------------------

const KODE_AMAN = /^[A-Z0-9_]{3,}$/;

const KODE_PG_KONFIGURASI = new Set(["28P01", "28000", "3D000", "42501"]);
const ERRNO_TIDAK_TERJANGKAU = new Set([
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "ECONNRESET",
  "EPIPE",
]);
const KODE_MSSQL_TIDAK_TERJANGKAU = new Set([
  "ESOCKET",
  "EINSTLOOKUP",
  "ECONNRESET",
  "ECONNCLOSED",
  "ENOCONN",
  "ENOTOPEN",
]);

const POLA_TIMEOUT =
  /timeout expired|query read timeout|connection terminated due to connection timeout|timed out/i;
// Diperiksa SETELAH POLA_TIMEOUT: "terminated due to connection timeout" tetap BATAS_WAKTU.
const POLA_TERPUTUS = /connection terminated|server closed the connection|connection ended unexpectedly/i;

/** SQLSTATE: kelas 08 = galat sambungan; 57P01-57P03 = server dimatikan / belum siap menerima. */
const KODE_PG_TERPUTUS = /^08[0-9A-Z]{3}$|^57P0[123]$/;

/** Sebab dari kode galat pg / errno node; null bila kode tidak dikenali. */
export function sebabDariKodePg(kode: string | null | undefined): SebabGangguan | null {
  if (!kode) return null;
  if (KODE_PG_KONFIGURASI.has(kode)) return "KONFIGURASI";
  if (ERRNO_TIDAK_TERJANGKAU.has(kode)) return "TIDAK_TERJANGKAU";
  if (KODE_PG_TERPUTUS.test(kode)) return "TIDAK_TERJANGKAU";
  if (kode === "53300") return "SIBUK";
  return null;
}

/** Sebab dari kode galat mssql; null bila tanpa kode. Kode lain = server menjawab dengan galat. */
export function sebabDariKodeMssql(kode: string | null | undefined): SebabGangguan | null {
  if (!kode) return null;
  if (KODE_MSSQL_TIDAK_TERJANGKAU.has(kode)) return "TIDAK_TERJANGKAU";
  if (kode === "ETIMEOUT" || kode === "ETIMEDOUT") return "BATAS_WAKTU";
  if (kode === "ELOGIN" || kode === "EENCRYPT") return "KONFIGURASI";
  if (ERRNO_TIDAK_TERJANGKAU.has(kode)) return "TIDAK_TERJANGKAU";
  return "GALAT_SERVER"; // EREQUEST dan kode lain: server menjawab, tapi dengan galat
}

function sebabPrisma(kode: string | null): SebabGangguan {
  switch (kode) {
    case "P1001":
      return "TIDAK_TERJANGKAU";
    case "P1002":
    case "P1008":
      return "BATAS_WAKTU";
    case "P1000":
    case "P1003":
      return "KONFIGURASI";
    case "P2024":
    case "P2034":
      return "SIBUK";
    default:
      return "GALAT_SERVER";
  }
}

function ambilKode(err: unknown): string | null {
  const o = err as { code?: unknown; errorCode?: unknown } | null;
  const mentah =
    typeof o?.code === "string" ? o.code : typeof o?.errorCode === "string" ? o.errorCode : null;
  return mentah && KODE_AMAN.test(mentah) ? mentah : null;
}

function galatPrisma(err: unknown, kode: string | null): boolean {
  if (kode && /^P\d{4}$/.test(kode)) return true;
  const nama = (err as { name?: unknown } | null)?.name;
  return typeof nama === "string" && nama.startsWith("PrismaClient");
}

/** Klasifikasi galat apa pun; tidak pernah melempar. */
export function jenisGalat(err: unknown): InfoGalat {
  if (err instanceof GalatKonfigurasi) {
    return { sumber: err.sumber, jenis: "KONFIGURASI", kode: null };
  }
  const asli = err instanceof GalatSumber ? (err.cause ?? err) : err;
  let sumber: SumberGalat = err instanceof GalatSumber ? err.sumber : "LAINNYA";
  const kode = ambilKode(err) ?? ambilKode(asli);
  const pesan = asli instanceof Error ? asli.message : typeof asli === "string" ? asli : "";

  if (galatPrisma(asli, kode)) {
    if (sumber === "LAINNYA") sumber = "GAJIHUB_DB";
    if (sumber === "GAJIHUB_DB") return { sumber, jenis: sebabPrisma(kode), kode };
  }

  let sebab: SebabGangguan | null = sumber === "SIAP" ? sebabDariKodeMssql(kode) : sebabDariKodePg(kode);
  if (!sebab && POLA_TIMEOUT.test(pesan)) sebab = "BATAS_WAKTU";
  if (!sebab && sumber !== "SIAP" && POLA_TERPUTUS.test(pesan)) sebab = "TIDAK_TERJANGKAU";
  // Kode SQLSTATE lima karakter dari server e-Presensi: server menjawab dengan galat.
  if (!sebab && sumber === "EPRESENSI" && kode && /^[0-9][0-9A-Z]{4}$/.test(kode)) {
    sebab = "GALAT_SERVER";
  }
  return { sumber, jenis: sebab ?? "TAK_DIKENAL", kode };
}

// ---------------------------------------------------------------------------
// Teks untuk layar
// ---------------------------------------------------------------------------

const NAMA_SUMBER: Record<SumberGalat, string> = {
  EPRESENSI: "e-Presensi",
  SIAP: "SIAP",
  GAJIHUB_DB: "Gajihub",
  LAINNYA: "sistem",
};

export function namaSumber(sumber: SumberGalat): string {
  return NAMA_SUMBER[sumber];
}

const GAJIHUB_TAK_BISA_DATA = "Gajihub sedang tidak bisa membaca atau menyimpan data";

/**
 * Kalimat awam untuk layar. Tidak memuat alamat server, user, maupun pesan
 * mentah. Tanpa istilah server/sambungan; sumber disebut dengan nama aplikasinya.
 */
export function pesanGalatAwam(info: InfoGalat, ref: string, konteks: string): string {
  const nama = NAMA_SUMBER[info.sumber];
  const rujukan = `kode rujukan ${ref}`;
  let isi: string;
  switch (info.jenis) {
    case "TIDAK_TERJANGKAU":
      isi =
        info.sumber === "GAJIHUB_DB"
          ? `${GAJIHUB_TAK_BISA_DATA}. Coba lagi beberapa saat (${rujukan}).`
          : `${nama} sedang tidak bisa dihubungi. Pastikan tersambung ke jaringan kantor/VPN, lalu coba lagi (${rujukan}).`;
      break;
    case "BATAS_WAKTU":
      isi = `${nama} terlalu lama menjawab. Coba lagi; kalau berulang, laporkan ke Admin Gajihub dengan ${rujukan}.`;
      break;
    case "SIBUK":
      isi =
        info.sumber === "GAJIHUB_DB"
          ? `${GAJIHUB_TAK_BISA_DATA}. Coba lagi beberapa saat (${rujukan}).`
          : `${nama} sedang sibuk. Coba lagi beberapa saat (${rujukan}).`;
      break;
    case "KONFIGURASI":
      isi =
        info.sumber === "GAJIHUB_DB"
          ? `${GAJIHUB_TAK_BISA_DATA}. Laporkan ke Admin Gajihub dengan ${rujukan}.`
          : `Gajihub belum bisa tersambung ke ${nama}. Laporkan ke Admin Gajihub dengan ${rujukan}.`;
      break;
    case "GALAT_SERVER":
      isi = `terjadi gangguan di ${nama}. Laporkan ke Admin Gajihub dengan ${rujukan}.`;
      break;
    default:
      isi = `terjadi gangguan yang belum dikenali. Laporkan ke Admin Gajihub dengan ${rujukan}.`;
  }
  return `${konteks}: ${isi}`;
}

// ---------------------------------------------------------------------------
// Log server
// ---------------------------------------------------------------------------

/**
 * Nilai rahasia diganti penanda; pola IPv4, string koneksi, dan user@host ikut
 * disamarkan, begitu juga deret 16-18 digit (NIK/NIP) yang bisa terbawa pesan
 * galat Prisma saat menyimpan - data pegawai tidak boleh masuk log.
 */
export function samarkanUntukLog(teks: string, rahasia: string[]): string {
  let hasil = teks;
  const daftar = [...new Set(rahasia.filter((r) => r && r.length >= 3))].sort(
    (a, b) => b.length - a.length
  );
  for (const r of daftar) hasil = hasil.split(r).join("<rahasia>");
  hasil = hasil.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@"']+@[^\s"']+/gi, "<koneksi>");
  hasil = hasil.replace(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "<user>@<host>");
  hasil = hasil.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "<host>");
  hasil = hasil.replace(/\b\d{16,18}\b/g, "<id>");
  return hasil;
}

function rahasiaDariEnv(): string[] {
  const e = process.env;
  const daftar: string[] = [
    e.EPRESENSI_HOST,
    e.EPRESENSI_USER,
    e.EPRESENSI_PASSWORD,
    e.SIAP_HOST,
    e.SIAP_SERVER,
    e.SIAP_USER,
    e.SIAP_PASSWORD,
    e.ESIGN_API_USER,
    e.ESIGN_API_PASS,
    e.NACO_CLIENT_SECRET,
  ].filter((v): v is string => typeof v === "string");
  if (e.DATABASE_URL) {
    try {
      const u = new URL(e.DATABASE_URL);
      daftar.push(u.hostname, decodeURIComponent(u.username), decodeURIComponent(u.password));
    } catch {
      // URL tidak terbaca: tidak ada yang bisa diekstrak
    }
  }
  if (e.ESIGN_BASE_URL) {
    try {
      daftar.push(new URL(e.ESIGN_BASE_URL).hostname);
    } catch {
      // bukan URL: abaikan
    }
  }
  return daftar;
}

export interface KetergantunganCatat {
  /** Nilai rahasia tambahan khusus panggilan ini (mis. passphrase TTE). */
  rahasia?: string[];
  buatRef?: () => string;
  log?: (baris: string) => void;
  /** Banyaknya kejadian yang diwakili baris ini (galat sejenis yang dikelompokkan). */
  jumlah?: number;
}

/**
 * Tulis SATU baris log server (tersamar) dan kembalikan kode rujukan + klasifikasi.
 * Tidak pernah mencetak stack maupun nilai env.
 */
export function catatGalat(
  konteks: string,
  err: unknown,
  deps: KetergantunganCatat = {}
): { ref: string; info: InfoGalat } {
  const ref = (deps.buatRef ?? (() => crypto.randomUUID().replace(/-/g, "").slice(0, 8)))();
  const info = jenisGalat(err);
  const mentah = err instanceof Error ? err.message : typeof err === "string" ? err : "(bukan Error)";
  const pesan = samarkanUntukLog(mentah, [...rahasiaDariEnv(), ...(deps.rahasia ?? [])])
    .replace(/\s+/g, " ")
    .replace(/"/g, "'")
    .slice(0, 300);
  const baris = `[${konteks}] ref=${ref} sumber=${info.sumber} jenis=${info.jenis} kode=${info.kode ?? "-"}${deps.jumlah !== undefined ? ` jumlah=${deps.jumlah}` : ""} pesan="${pesan}"`;
  (deps.log ?? ((b: string) => console.error(b)))(baris);
  return { ref, info };
}

/**
 * Pembungkus untuk blok `catch` Server Action / Route Handler: pesan untuk layar.
 * GalatPengguna tampil apa adanya; galat lain dicatat ke log server (tersamar)
 * dan layar hanya menerima kalimat awam + kode rujukan.
 */
export function pesanGalatUntukLayar(
  konteks: string,
  err: unknown,
  judul: string,
  rahasia?: string[]
): string {
  if (err instanceof GalatPengguna) return err.message;
  const { ref, info } = catatGalat(konteks, err, { rahasia });
  return pesanGalatAwam(info, ref, judul);
}
