import { describe, expect, it } from "vitest";
import { TAB_SAYA, TAB_SAYA_DEFAULT, resolveTabSaya } from "../saya/tabs";

describe("resolveTabSaya", () => {
  it("mengembalikan tab yang dikenal apa adanya", () => {
    for (const t of TAB_SAYA) {
      expect(resolveTabSaya(t.key)).toBe(t.key);
    }
  });

  it("tanpa ?tab= jatuh ke tab pertama", () => {
    expect(resolveTabSaya(undefined)).toBe(TAB_SAYA_DEFAULT);
    expect(resolveTabSaya("")).toBe(TAB_SAYA_DEFAULT);
  });

  it("nilai tak dikenal TIDAK merender halaman kosong", () => {
    // Ini yang dijaga: tautan lama, salah ketik, atau isengan di URL harus
    // tetap menghasilkan halaman yang berisi - bukan tab yang tidak ada.
    for (const asal of ["xyz", "PROFIL", "profil ", "../admin", "0", "true"]) {
      expect(resolveTabSaya(asal), asal).toBe(TAB_SAYA_DEFAULT);
    }
  });

  it("tab pertama memang yang dipakai sebagai default", () => {
    expect(TAB_SAYA[0].key).toBe(TAB_SAYA_DEFAULT);
  });

  it("key-nya unik - dua tab berkey sama membuat salah satunya tidak pernah terbuka", () => {
    const keys = TAB_SAYA.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
