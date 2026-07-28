import { SearchableSelect } from "../SearchableSelect";

/**
 * Picker satuan kerja SAJA (tanpa bulan/tahun) - dipakai di halaman
 * src/app/kasubag/* yang tidak perlu filter periode (roster pegawai,
 * banding, SK KGB, SK Hukuman Disiplin). Untuk KASUBAG_TU ini biasanya
 * tidak pernah tampil (satuan kerjanya sudah otomatis ke-resolve - lihat
 * src/app/kasubag/access.ts), cuma relevan buat ADMIN yang perlu pilih unit
 * dulu (privilege lintas unit, role matrix simulasi).
 */
export function SatkerPicker({ satuanKerjaList, satkerTerpilih }: { satuanKerjaList: string[]; satkerTerpilih?: string }) {
  return (
    <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="field-label">Satuan kerja</label>
        <SearchableSelect
          name="satker"
          className="min-w-[280px]"
          options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
          defaultValue={satkerTerpilih ?? ""}
          placeholder="Pilih satuan kerja..."
        />
      </div>
      <button type="submit" className="btn btn-primary">
        Tampilkan
      </button>
    </form>
  );
}
