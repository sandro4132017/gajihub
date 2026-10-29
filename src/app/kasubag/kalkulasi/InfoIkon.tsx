/**
 * Ikon "i" berisi keterangan bebas - muncul saat di-hover atau di-fokus.
 *
 * BEDANYA DARI `SumberAcuan`: komponen itu bentuknya khusus untuk DASAR HUKUM
 * (daftar pasal + sumber data + waktu pengambilannya), dan memakainya untuk
 * keterangan biasa berarti mengisi prop bernama `acuan`/`aturan` dengan
 * kalimat yang bukan aturan - nama yang akan menyesatkan pembaca berikutnya.
 * Yang di sini generik: judul + beberapa poin.
 *
 * MEKANIKANYA SAMA PERSIS: tanpa JavaScript, murni CSS (`group-hover` +
 * `group-focus-within`), bukan client component, tidak ada state.
 *
 * SELURUHNYA `<span>` (*phrasing content*), jadi AMAN di dalam `<h1>`, `<p>`,
 * `<td>`, maupun `<summary>`. JANGAN diganti `<details>` - elemen itu *flow
 * content*, dan menaruhnya di dalam heading membuat parser HTML menutup paksa
 * induknya lalu Next melempar hydration error yang menunjuk ke dalam komponen
 * ini, bukan ke tempat pemakaiannya. Pelajaran itu sudah dua kali menggigit
 * (BadgePejabatEselon, lalu BantuanRincianTukin).
 */
export interface PoinInfo {
  /** Baris tebal - inti poinnya, satu frasa. */
  judul: string;
  /** Penjelasannya, satu-dua kalimat. */
  isi: string;
}

export function InfoIkon({
  judul,
  poin,
  catatan,
}: {
  /** Kepala panel, mis. "Kapan ini dipakai". */
  judul: string;
  poin: PoinInfo[];
  /** Baris tambahan di kaki panel. */
  catatan?: string;
}) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={judul}
        // TANPA `title`. Panel di bawah ini sudah muncul saat hover, jadi
        // tooltip bawaan browser menyala BERSAMAAN dengan isi yang sama - dan
        // kotak hitamnya justru menutupi panel yang lebih terbaca.
        // `aria-label` tetap ada, jadi pembaca layar tidak kehilangan apa pun.
        className="grid size-[18px] cursor-help place-items-center rounded-full border border-line bg-surface text-[11px] font-extrabold text-biru transition group-hover:border-biru group-hover:bg-biru group-hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-biru"
      >
        i
      </span>

      {/* pointer-events-none supaya panel yang muncul tidak menghalangi klik
          elemen di bawahnya; isinya memang cuma dibaca. */}
      <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-30 w-[min(24rem,80vw)] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-left font-normal opacity-0 shadow-[0_8px_24px_rgba(19,65,107,0.14)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="block text-[11px] font-extrabold uppercase tracking-wide text-muted">{judul}</span>
        <span className="mt-1.5 block space-y-1.5">
          {poin.map((p) => (
            <span key={p.judul} className="block">
              <span className="block text-[12.5px] font-bold leading-snug text-ink">{p.judul}</span>
              <span className="block text-[11.5px] leading-snug text-muted">{p.isi}</span>
            </span>
          ))}
        </span>
        {catatan && (
          <span className="mt-2 block border-t border-line pt-2 text-[11.5px] leading-snug text-muted">{catatan}</span>
        )}
      </span>
    </span>
  );
}
