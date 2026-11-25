import { TEKS_STATUS_LANGKAH, type LangkahStepper } from "../../../business-logic/tahapKalkulasiUnit";

/**
 * Empat langkah halaman Kalkulasi Unit, sejajar. Tiap kartu menaut ke
 * `#tahap-n` di halaman yang sama - tanpa JavaScript, tanpa state.
 *
 * Isi (sub-judul & status) datang dari susunStepper() di business-logic, jadi
 * angkanya persis angka di kartu tahap masing-masing.
 *
 * Status TIDAK hanya warna: teks sub-judulnya sendiri menyebut keadaannya,
 * ditambah teks sr-only ("Selesai", "Perlu perhatian", "Belum selesai").
 * Oranye dipakai khusus untuk yang perlu ditinjau/dikembalikan. Kartu dibuat
 * ringkas tanpa bingkai warna (desain user 2026-11-16).
 */
export function StepperKalkulasi({ langkah }: { langkah: readonly LangkahStepper[] }) {
  return (
    <nav aria-label="Tahap kalkulasi unit" className="mt-4">
      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {langkah.map((l) => {
          const perhatian = l.status === "PERLU_PERHATIAN";
          return (
            <li key={l.nomor}>
              <a
                href={l.href}
                className="flex h-full items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 no-underline transition hover:border-biru/50"
              >
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-sm font-bold text-ink-2"
                >
                  {l.nomor}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold leading-snug text-ink">{l.judul}</span>
                  <span
                    className={`mt-0.5 block text-xs ${
                      perhatian ? "font-medium text-gold-deep" : l.status === "SELESAI" ? "text-green" : "text-muted"
                    }`}
                  >
                    {l.sub}
                  </span>
                  <span className="sr-only">Status: {TEKS_STATUS_LANGKAH[l.status]}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
