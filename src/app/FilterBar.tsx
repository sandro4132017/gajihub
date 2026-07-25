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
    <form
      method="get"
      className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4"
    >
      <div>
        <label className="block text-xs font-medium text-gray-500">Bulan</label>
        <select
          name="bulan"
          defaultValue={bulan ?? ""}
          className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Semua bulan</option>
          {NAMA_BULAN.map((nama, index) => (
            <option key={nama} value={index + 1}>
              {nama}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500">Tahun</label>
        <input
          type="number"
          name="tahun"
          defaultValue={tahun ?? ""}
          placeholder="cth. 2026"
          className="mt-1 w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-500">Satuan kerja</label>
        <select
          name="satker"
          defaultValue={satker ?? ""}
          className="mt-1 min-w-[200px] rounded border border-gray-300 px-2 py-1.5 text-sm"
        >
          <option value="">Semua satuan kerja</option>
          {satuanKerjaList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
      >
        Terapkan filter
      </button>

      {adaFilterAktif && (
        <a href="?" className="text-sm text-gray-500 underline">
          Reset filter
        </a>
      )}
    </form>
  );
}
