import { konfigurasiSiap } from "@/lib/siapConfig";
import { GalatKonfigurasi } from "@/lib/koneksi/galatSumber";

// ============================================================================
// PING DATABASE SIAP untuk indikator koneksi.
//
// READ-ONLY: satu-satunya perintah yang dijalankan adalah `SELECT 1`, lewat
// pool sekali pakai milik pemanggil sendiri (max 1, tanpa pool bersama) yang
// selalu ditutup. Tidak ada host, instance, pengguna, kata sandi, maupun
// `err.message` yang keluar dari fungsi ini - hanya kode galat berbentuk
// errno/kode mssql (mis. ELOGIN, ESOCKET).
//
// Batas 8 detik (lebih longgar dari e-Presensi): named instance ditemukan lewat
// SQL Server Browser (UDP 1434), dan jabat tangan TLS 1.0 SIAP memakan ±1 detik.
// Connect & query masing-masing dibatasi driver 6 detik, di bawah batas total,
// supaya koneksi yang terlambat diakhiri driver sendiri lalu ditutup `kerja`.
// ============================================================================

export type HasilPingSiap =
  | { jenis: "ok" }
  | { jenis: "jawaban_aneh" }
  | { jenis: "belum_diatur" }
  | { jenis: "galat"; kode: string | null; batasWaktu: boolean };

const BATAS_TOTAL_MS = 8_000;

function kodeAman(err: unknown): string | null {
  const kode = (err as { code?: unknown } | null)?.code;
  return typeof kode === "string" && /^[A-Z0-9_]{3,}$/.test(kode) ? kode : null;
}

export async function pingSiap(): Promise<HasilPingSiap> {
  let konfigurasi: ReturnType<typeof konfigurasiSiap>;
  try {
    konfigurasi = konfigurasiSiap();
  } catch (err) {
    if (err instanceof GalatKonfigurasi) return { jenis: "belum_diatur" };
    return { jenis: "galat", kode: kodeAman(err), batasWaktu: false };
  }

  // Batas sudah lewat: `kerja` yang terlambat tidak boleh lagi menjalankan query.
  let selesai = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const batas = new Promise<HasilPingSiap>((tuntas) => {
    timer = setTimeout(
      () => tuntas({ jenis: "galat", kode: null, batasWaktu: true }),
      BATAS_TOTAL_MS
    );
  });

  // Pool SELALU ditutup oleh `kerja` sendiri setelah connect selesai atau gagal,
  // berapa pun lambatnya - menutup dari luar selagi connect berjalan ditolak
  // mssql ("Cannot close a pool while it is connecting") dan koneksinya tetap
  // terbentuk. Timer di atas hanya menentukan kapan jawaban dikembalikan.
  const kerja = (async (): Promise<HasilPingSiap> => {
    // Import dinamis + `default ?? mod`: lihat catatan di bukaPoolSiap (siapConfig.ts).
    const mod = await import("mssql");
    const mssql = mod.default ?? mod;
    if (selesai) return { jenis: "galat", kode: null, batasWaktu: true };
    const kolam = new mssql.ConnectionPool({
      ...konfigurasi,
      connectionTimeout: 6_000,
      requestTimeout: 6_000,
      pool: { max: 1, min: 0 },
    });
    // Tanpa handler, galat soket pada pool menganggur menjadi uncaught exception.
    kolam.on("error", () => {});
    try {
      await kolam.connect();
      if (selesai) return { jenis: "galat", kode: null, batasWaktu: true };
      const res = await kolam.request().query("SELECT 1");
      return res.recordset?.length === 1 ? { jenis: "ok" } : { jenis: "jawaban_aneh" };
    } finally {
      try {
        await Promise.resolve(kolam.close()).catch(() => {});
      } catch {
        /* abaikan galat penutupan */
      }
    }
  })().catch(
    (err: unknown): HasilPingSiap => ({ jenis: "galat", kode: kodeAman(err), batasWaktu: false })
  );

  try {
    return await Promise.race([kerja, batas]);
  } finally {
    selesai = true;
    if (timer) clearTimeout(timer);
  }
}
