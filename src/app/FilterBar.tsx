import { NAMA_BULAN } from "./bulan";
import { SearchableSelect } from "./SearchableSelect";

/**
 * Form filter periode + satuan kerja - dipakai sama persis di ketiga
 * dashboard (Tukin, Uang Makan, Uang Lembur). Tetap <form method="get">
 * biasa supaya filter jalan lewat URL query string - konsisten dengan
 * pendekatan Server Component di halaman-halaman dashboard.
 *
 * Dropdown-nya pakai SearchableSelect (bisa dicari realtime; daftar satuan
 * kerja ada 82 baris, scroll manual tidak praktis). Komponen itu sendiri
 * yang client-side, plus fallback <select> native di dalam <noscript> -
 * jadi janji "filter jalan tanpa JavaScript" tetap dipegang.
 */
export function FilterBar({
  satuanKerjaList,
  bulan,
  tahun,
  satker,
}: {
  satuanKerjaList: string[];
  bulan?: string;
  tahun?: string;
  satker?: string;
}) {
  const adaFilterAktif = Boolean(bulan || tahun || satker);

  return (
    <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="field-label">Bulan</label>
        <SearchableSelect
          name="bulan"
          className="w-40"
          options={NAMA_BULAN.map((nama, index) => ({ value: String(index + 1), label: nama }))}
          defaultValue={bulan ?? ""}
          emptyLabel="Semua bulan"
        />
      </div>

      <div>
        <label className="field-label">Tahun</label>
        <input
          type="number"
          name="tahun"
          defaultValue={tahun ?? ""}
          placeholder="cth. 2026"
          className="field-input w-24 py-1.5"
        />
      </div>

      <div>
        <label className="field-label">Satuan kerja</label>
        <SearchableSelect
          name="satker"
          className="min-w-[260px]"
          options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
          defaultValue={satker ?? ""}
          emptyLabel="Semua satuan kerja"
        />
      </div>

      <button type="submit" className="btn btn-primary">
        Terapkan filter
      </button>

      {adaFilterAktif && (
        <a href="?" className="text-sm font-medium text-muted underline">
          Reset filter
        </a>
      )}
    </form>
  );
}
