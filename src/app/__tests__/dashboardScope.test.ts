import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import {
  resolveSatkerEfektif,
  resolveSatuanKerjaListUntukFilter,
  satkerTerkunciUntukAkun,
} from "../dashboardScope";
import type { AuthUser } from "../../auth/permissions";

const SEMUA_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

function akun(role: Role, satuanKerja: string | null = "Sekretariat Jenderal"): AuthUser {
  return { nip: "197001011990031001", role, satuanKerja, aktif: true };
}

/**
 * Ketiga fungsi ini menjawab pertanyaan yang sama dari tiga sisi: BOLEH TIDAK
 * orang ini memilih satuan kerja. Kalau salah satunya bergeser sendiri waktu
 * role baru ditambahkan, yang muncul di layar adalah dropdown yang bisa diklik
 * tapi tidak pernah mengubah apa pun - dan itu terbaca sebagai filter rusak,
 * bukan sebagai pembatasan kewenangan. Test ini yang menahannya.
 */
describe("kesepakatan antar fungsi scoping satuan kerja", () => {
  it("satkerTerkunciUntukAkun sepakat dengan resolveSatkerEfektif untuk SEMUA role", () => {
    for (const role of SEMUA_ROLE) {
      const a = akun(role);
      // Query sengaja menunjuk unit LAIN dari milik akunnya. Kalau nilainya
      // lolos apa adanya, berarti orangnya memang bebas memilih.
      const lolos = resolveSatkerEfektif(a, "Ditjen Binalavotas") === "Ditjen Binalavotas";
      expect(satkerTerkunciUntukAkun(a), `role ${role}`).toBe(!lolos);
    }
  });

  it("satkerTerkunciUntukAkun sepakat dengan panjang daftar dropdown", () => {
    const semuaUnit = ["Sekretariat Jenderal", "Ditjen Binalavotas", "Itjen"];
    for (const role of SEMUA_ROLE) {
      const a = akun(role);
      const daftar = resolveSatuanKerjaListUntukFilter(a, semuaUnit);
      // Terkunci = dropdown-nya tidak pernah punya lebih dari satu isi.
      expect(daftar.length <= 1, `role ${role}`).toBe(satkerTerkunciUntukAkun(a));
    }
  });

  it("KASUBAG_TU tetap terkunci walau satuan kerjanya belum terisi", () => {
    const a = akun("KASUBAG_TU", null);
    expect(resolveSatkerEfektif(a, "Ditjen Binalavotas")).toBeUndefined();
    expect(satkerTerkunciUntukAkun(a)).toBe(true);
    expect(resolveSatuanKerjaListUntukFilter(a, ["Itjen"])).toEqual([]);
  });

  it("KASUBAG_TU tidak bisa mengintip unit lain lewat ?satker=", () => {
    const a = akun("KASUBAG_TU");
    expect(resolveSatkerEfektif(a, "Ditjen Binalavotas")).toBe("Sekretariat Jenderal");
  });

  it("role lintas unit memakai ?satker= apa adanya, termasuk waktu kosong", () => {
    for (const role of ["PPABP", "OSDMA", "PIMPINAN", "ADMIN"] as Role[]) {
      expect(resolveSatkerEfektif(akun(role), "Itjen"), `role ${role}`).toBe("Itjen");
      expect(resolveSatkerEfektif(akun(role), undefined), `role ${role}`).toBeUndefined();
    }
  });
});
