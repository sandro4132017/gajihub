import Link from "next/link";

// ============================================================================
// PAGINASI BERBASIS URL
//
// Nomor halaman & ukuran halaman disimpan di query string (`hal`, `per`),
// BUKAN di state klien. Alasannya sama dengan filter periode dan tombol
// "Lihat rincian lengkap" yang sudah ada: halamannya tetap jalan tanpa
// JavaScript, link-nya bisa dibagikan/di-bookmark, dan tombol back browser
// berperilaku wajar.
//
// Komponen ini murni tampilan - pemanggil yang memotong datanya sendiri
// (lihat hitungPaginasi di bawah).
// ============================================================================

/** Pilihan ukuran halaman yang ditawarkan ke user. */
export const UKURAN_HALAMAN = [10, 20, 50, 100] as const;

export const UKURAN_HALAMAN_DEFAULT = 10;

export interface HasilPaginasi {
  /** 1-based, sudah dijepit ke rentang yang sah. */
  halaman: number;
  perHalaman: number;
  totalHalaman: number;
  /** Indeks untuk Array.slice(mulai, selesai). */
  mulai: number;
  selesai: number;
}

/**
 * Menerjemahkan `?hal=` & `?per=` jadi angka yang aman dipakai memotong array.
 *
 * Nilai di luar akal (huruf, nol, negatif, ukuran yang tidak ditawarkan,
 * halaman melebihi total) dijepit ke nilai sah TANPA melempar error - query
 * string datang dari luar dan bisa diketik siapa saja.
 */
export function hitungPaginasi(
  totalBaris: number,
  hal: string | undefined,
  per: string | undefined
): HasilPaginasi {
  const diminta = Number(per);
  const perHalaman = (UKURAN_HALAMAN as readonly number[]).includes(diminta)
    ? diminta
    : UKURAN_HALAMAN_DEFAULT;

  const totalHalaman = Math.max(1, Math.ceil(totalBaris / perHalaman));
  const halamanDiminta = Number(hal);
  const halaman = Number.isInteger(halamanDiminta)
    ? Math.min(Math.max(halamanDiminta, 1), totalHalaman)
    : 1;

  const mulai = (halaman - 1) * perHalaman;
  return { halaman, perHalaman, totalHalaman, mulai, selesai: Math.min(mulai + perHalaman, totalBaris) };
}

/**
 * Deret nomor halaman yang ditampilkan, dengan "..." kalau halamannya banyak.
 * Selalu memuat halaman pertama, terakhir, dan tetangga halaman aktif -
 * supaya barisnya tidak melebar tak terkendali di unit besar.
 */
function nomorHalaman(halaman: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const sekitar = new Set([1, total, halaman, halaman - 1, halaman + 1]);
  if (halaman <= 3) [2, 3, 4].forEach((n) => sekitar.add(n));
  if (halaman >= total - 2) [total - 3, total - 2, total - 1].forEach((n) => sekitar.add(n));

  const urut = [...sekitar].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const hasil: (number | "...")[] = [];
  let sebelumnya = 0;
  for (const n of urut) {
    if (sebelumnya && n - sebelumnya > 1) hasil.push("...");
    hasil.push(n);
    sebelumnya = n;
  }
  return hasil;
}

export function Paginasi({
  basePath,
  params,
  info,
  totalBaris,
  labelBaris = "baris",
}: {
  /** Path halaman tanpa query, mis. "/kasubag/kalkulasi". */
  basePath: string;
  /** Query string yang HARUS ikut terbawa (periode, satker, mode rinci, dst). */
  params: URLSearchParams;
  info: HasilPaginasi;
  totalBaris: number;
  labelBaris?: string;
}) {
  const url = (halaman: number, perHalaman: number) => {
    const q = new URLSearchParams(params);
    q.set("hal", String(halaman));
    q.set("per", String(perHalaman));
    return `${basePath}?${q.toString()}`;
  };

  const { halaman, perHalaman, totalHalaman, mulai, selesai } = info;
  const tombol =
    "rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-semibold text-ink-2 hover:bg-surface-3";
  const mati = "rounded-lg border border-line-2 px-2.5 py-1.5 text-xs font-semibold text-muted/50";

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted">
        Menampilkan <strong className="text-ink-2">{totalBaris === 0 ? 0 : mulai + 1}</strong>
        {"-"}
        <strong className="text-ink-2">{selesai}</strong> dari{" "}
        <strong className="text-ink-2">{totalBaris}</strong> {labelBaris}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted">Tampilkan</span>
          {UKURAN_HALAMAN.map((n) => (
            <Link
              key={n}
              // Pindah ukuran halaman SELALU kembali ke halaman 1 - kalau
              // nomornya dipertahankan, dari 100/halaman ke 10/halaman bisa
              // mendarat di halaman yang sudah tidak ada isinya.
              href={url(1, n)}
              aria-current={n === perHalaman ? "true" : undefined}
              className={
                n === perHalaman
                  ? "rounded-lg border border-teal-deep bg-teal-deep/10 px-2.5 py-1.5 text-xs font-bold text-teal-deep"
                  : tombol
              }
            >
              {n}
            </Link>
          ))}
        </div>

        {totalHalaman > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {halaman > 1 ? (
              <Link href={url(halaman - 1, perHalaman)} className={tombol} rel="prev">
                Sebelumnya
              </Link>
            ) : (
              <span className={mati}>Sebelumnya</span>
            )}

            {nomorHalaman(halaman, totalHalaman).map((n, i) =>
              n === "..." ? (
                <span key={`sela-${i}`} className="px-1 text-xs text-muted">
                  ...
                </span>
              ) : (
                <Link
                  key={n}
                  href={url(n, perHalaman)}
                  aria-current={n === halaman ? "page" : undefined}
                  className={
                    n === halaman
                      ? "rounded-lg border border-teal-deep bg-teal-deep/10 px-2.5 py-1.5 text-xs font-bold text-teal-deep"
                      : tombol
                  }
                >
                  {n}
                </Link>
              )
            )}

            {halaman < totalHalaman ? (
              <Link href={url(halaman + 1, perHalaman)} className={tombol} rel="next">
                Berikutnya
              </Link>
            ) : (
              <span className={mati}>Berikutnya</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
