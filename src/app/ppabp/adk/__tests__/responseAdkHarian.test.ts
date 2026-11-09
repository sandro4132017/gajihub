import { describe, expect, it } from "vitest";
import { read, utils } from "xlsx";
import { responseAdkHarian } from "../responseAdk";

describe("responseAdkHarian - sheet depan Uang Makan", () => {
  it("tanggal tanpa kehadiran benar-benar kosong, jadi Count sel = jumlah hari berangka 1", async () => {
    const res = responseAdkHarian({
      format: null,
      pegawai: [
        {
          nip: "199001012020121001", // sensitive-ok
          nama: "Pegawai Uji",
          hari: [{ tanggalIso: "2026-07-01" }, { tanggalIso: "2026-07-02" }, { tanggalIso: "2026-07-06" }],
        },
      ],
      periodeBulan: 7,
      periodeTahun: 2026,
      denganJam: false,
      namaFile: "uji",
    });
    const wb = read(new Uint8Array(await res.arrayBuffer()), { type: "array" });
    const ws = wb.Sheets["depan"];
    // Baris data pertama = baris ke-6 Excel; tanggal di kolom D..AH.
    const nilai: unknown[] = [];
    for (let c = 3; c < 3 + 31; c++) {
      const sel = ws[utils.encode_cell({ r: 5, c })];
      if (sel !== undefined) nilai.push(sel.v);
    }
    expect(nilai).toEqual([1, 1, 1]);
    // Kolom ringkasan (AJ) tetap 3.
    expect(ws[utils.encode_cell({ r: 5, c: 35 })]?.v).toBe(3);
  });
});
