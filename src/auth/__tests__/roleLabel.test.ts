import { describe, expect, it } from "vitest";
import { LABEL_ROLE, labelRole } from "../roleLabel";

describe("labelRole", () => {
  it("Kasubag TU selalu menyebut unitnya", () => {
    // Inti fiturnya: tiap unit/biro punya Kasubag TU sendiri, jadi
    // "Kasubag TU" saja tidak menunjuk siapa pun.
    expect(labelRole("KASUBAG_TU", "Biro Keuangan dan Barang Milik Negara")).toBe(
      "Kasubag TU Biro Keuangan dan Barang Milik Negara"
    );
    expect(labelRole("KASUBAG_TU", "Biro Umum")).toBe("Kasubag TU Biro Umum");
  });

  it("Kasubag TU dua unit berbeda menghasilkan label berbeda", () => {
    // Penjagaan terhadap godaan menyingkat nama unit: dua unit yang beberapa
    // kata pertamanya sama TIDAK boleh berakhir dengan label identik.
    const a = labelRole("KASUBAG_TU", "Direktorat Bina Kelembagaan Pelatihan Vokasi");
    const b = labelRole("KASUBAG_TU", "Direktorat Bina Kelembagaan Keselamatan dan Kesehatan Kerja");
    expect(a).not.toBe(b);
  });

  it("unit kosong disebut eksplisit, bukan disembunyikan", () => {
    // Akun KASUBAG_TU tanpa unit lolos guard role tapi tidak cocok dengan
    // satuan kerja manapun - semua halamannya tampil kosong tanpa penjelasan.
    // Lihat "Bug akun ber-role Kasubag TU tapi tidak bisa lihat apa-apa" di
    // CLAUDE.md.
    for (const kosong of [null, undefined, "", "   "]) {
      expect(labelRole("KASUBAG_TU", kosong)).toBe("Kasubag TU (unit belum diisi)");
    }
  });

  it("role lain TIDAK diberi unit walau kolomnya terisi", () => {
    // `User.satuanKerja` milik KASUBAG_TU. Menempelkannya ke PPABP/OSDMA
    // menyiratkan pembatasan wilayah yang tidak berlaku - dan itu pernah jadi
    // bug sungguhan (lihat "Bug akun multi-role kehilangan jangkauan PPABP").
    const unit = "Pusat Data dan Teknologi Informasi Ketenagakerjaan";
    expect(labelRole("PPABP", unit)).toBe("PPABP");
    expect(labelRole("ADMIN", unit)).toBe("Admin");
    expect(labelRole("OSDMA", unit)).toBe("OSDMA");
    expect(labelRole("PIMPINAN", unit)).toBe("Pimpinan");
    expect(labelRole("PEGAWAI", unit)).toBe("Pegawai");
  });

  it("tanpa unit, hasilnya sama dengan label dasar untuk role non-Kasubag", () => {
    for (const r of ["PEGAWAI", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"] as const) {
      expect(labelRole(r)).toBe(LABEL_ROLE[r]);
    }
  });

  it("spasi berlebih di nama unit dirapikan", () => {
    expect(labelRole("KASUBAG_TU", "  Biro Umum  ")).toBe("Kasubag TU Biro Umum");
  });
});
