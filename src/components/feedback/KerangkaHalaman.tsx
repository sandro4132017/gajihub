import { HALAMAN } from "../layout/layoutHalaman";

/**
 * Kerangka (skeleton) yang langsung tampil di area isi saat pindah halaman,
 * selagi server menyiapkan datanya. Dipakai `loading.tsx` tiap bagian.
 *
 * Bentuknya meniru pola halaman Gajihub: judul, kartu filter, deret kartu
 * ringkas, lalu tabel. Sidebar tidak ikut - ia bagian layout dan tetap diam.
 * Denyutnya mati untuk pengguna yang memilih "kurangi gerakan".
 */
export function KerangkaHalaman() {
  const blok = "rounded-md bg-line-2 motion-safe:animate-pulse";
  return (
    <main className={HALAMAN} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Memuat halaman...</span>

      <div className={`${blok} h-7 w-64`} />
      <div className={`${blok} mt-2 h-4 w-96 max-w-full`} />

      <div className="card mt-6 flex flex-wrap gap-3 p-4">
        <div className={`${blok} h-10 min-w-[12rem] flex-1`} />
        <div className={`${blok} h-10 w-28`} />
        <div className={`${blok} h-10 w-24`} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card p-4">
            <div className={`${blok} h-3 w-24`} />
            <div className={`${blok} mt-3 h-6 w-32`} />
          </div>
        ))}
      </div>

      <div className="card mt-4 overflow-hidden">
        <div className="border-b border-line bg-surface-2 px-4 py-3">
          <div className={`${blok} h-3 w-full`} />
        </div>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex gap-4 border-b border-line-2 px-4 py-3.5 last:border-0">
            <div className={`${blok} h-4 w-8`} />
            <div className={`${blok} h-4 flex-1`} />
            <div className={`${blok} h-4 w-24`} />
            <div className={`${blok} h-4 w-20`} />
          </div>
        ))}
      </div>
    </main>
  );
}
