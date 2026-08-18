import { NAMA_BULAN, daftarTahunPeriode } from "./bulan";
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

  // Tahun yang sedang dipakai TAPI di luar daftar (mis. link lama ?tahun=2025)
  // tetap dimunculkan sebagai opsi. Kalau tidak, field-nya tampil kosong
  // padahal filternya aktif - orang akan mengira filternya tidak jalan.
  const tahunOpsi = daftarTahunPeriode();
  if (tahun && /^\d{4}$/.test(tahun) && !tahunOpsi.includes(Number(tahun))) {
    tahunOpsi.push(Number(tahun));
    tahunOpsi.sort((a, b) => a - b);
  }

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
        <SearchableSelect
          name="tahun"
          className="w-32"
          options={tahunOpsi.map((t) => ({ value: String(t), label: String(t) }))}
          defaultValue={tahun ?? ""}
          emptyLabel="Semua tahun"
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
