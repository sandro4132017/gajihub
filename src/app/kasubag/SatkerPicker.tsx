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
        <select name="satker" defaultValue={satkerTerpilih ?? ""} className="field-input min-w-[240px] py-1.5">
          <option value="" disabled>
            Pilih satuan kerja&hellip;
          </option>
          {satuanKerjaList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="btn btn-primary">
        Tampilkan
      </button>
    </form>
  );
}
