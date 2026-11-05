import pg from "pg";
import { konfigurasiEpresensi } from "@/lib/epresensiConfig";

// ============================================================================
// PING DATABASE e-Presensi untuk indikator koneksi.
//
// READ-ONLY: satu-satunya perintah yang dijalankan adalah `SELECT 1`. Satu
// client sekali pakai, tanpa pool, selalu ditutup. Tidak ada host, port,
// pengguna, kata sandi, maupun `err.message` yang keluar dari fungsi ini -
// hanya kode galat berbentuk SQLSTATE/errno (mis. 28P01, ECONNREFUSED).
// ============================================================================

export type HasilPingEpresensi =
  | { jenis: "ok" }
  | { jenis: "jawaban_aneh" }
  | { jenis: "belum_diatur" }
  | { jenis: "galat"; kode: string | null; batasWaktu: boolean };

const BATAS_TOTAL_MS = 4_000;

function kodeAman(err: unknown): string | null {
  const kode = (err as { code?: unknown } | null)?.code;
  return typeof kode === "string" && /^[A-Z0-9_]{3,}$/.test(kode) ? kode : null;
}

export async function pingEpresensi(): Promise<HasilPingEpresensi> {
  const konfigurasi = konfigurasiEpresensi();
  if (!konfigurasi) return { jenis: "belum_diatur" };

  const client = new pg.Client({
    ...konfigurasi,
    connectionTimeoutMillis: 4_500,
    query_timeout: 4_500,
    // statement_timeout sengaja TIDAK dikirim: parameter awal koneksi itu bisa
    // ditolak perantara seperti pgbouncer, dan ping jadi selalu gagal padahal
    // database hidup. Batasnya cukup query_timeout + timer total di bawah.
    application_name: "gajihub-cek-koneksi",
  });
  // Tanpa handler, galat soket di client menganggur menjadi uncaught exception.
  client.on("error", () => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const batas = new Promise<HasilPingEpresensi>((selesai) => {
    timer = setTimeout(
      () => selesai({ jenis: "galat", kode: null, batasWaktu: true }),
      BATAS_TOTAL_MS
    );
  });

  const kerja = (async (): Promise<HasilPingEpresensi> => {
    await client.connect();
    const res = await client.query("SELECT 1");
    return res.rows?.length === 1 ? { jenis: "ok" } : { jenis: "jawaban_aneh" };
  })().catch(
    (err: unknown): HasilPingEpresensi => ({ jenis: "galat", kode: kodeAman(err), batasWaktu: false })
  );

  try {
    return await Promise.race([kerja, batas]);
  } finally {
    if (timer) clearTimeout(timer);
    // Tidak ditunggu: end() pada koneksi yang tak pernah tersambung bisa menggantung.
    try {
      void Promise.resolve(client.end()).catch(() => {});
    } catch {
      /* abaikan galat penutupan */
    }
  }
}
