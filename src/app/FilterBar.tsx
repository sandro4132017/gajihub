import { NAMA_BULAN } from "./bulan";

/**
 * Form filter periode + satuan kerja - dipakai sama persis di ketiga
 * dashboard (Tukin, Uang Makan, Uang Lembur). Pakai <form method="get">
 * biasa (bukan client component) supaya filter jalan lewat URL query string
 * tanpa perlu JavaScript - konsisten dengan pendekatan Server Component di
 * halaman-halaman dashboard.
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
        <select name="bulan" defaultValue={bulan ?? ""} className="field-input py-1.5">
          <option value="">Semua bulan</option>
          {NAMA_BULAN.map((nama, index) => (
            <option key={nama} value={index + 1}>
              {nama}
            </option>
          ))}
        </select>
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
        <select name="satker" defaultValue={satker ?? ""} className="field-input min-w-[200px] py-1.5">
          <option value="">Semua satuan kerja</option>
          {satuanKerjaList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
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
