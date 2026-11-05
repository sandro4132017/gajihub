import { beforeEach, describe, expect, it, vi } from "vitest";

const { sesi, data } = vi.hoisted(() => ({
  sesi: vi.fn(),
  data: {
    ambilIsiPanelKabar: vi.fn(),
    ambilHalamanAktivitas: vi.fn(),
    hitungNotifikasiKabar: vi.fn(),
  },
}));

vi.mock("../../../../auth/getSessionAccount", () => ({ getSessionAccount: sesi }));
vi.mock("../../../kabarData", async (importAsli) => {
  const asli = await importAsli<typeof import("../../../kabarData")>();
  return { ...asli, ...data };
});

import { GET } from "../route";

const akunKasubag = { nip: "198100000000000003", role: "KASUBAG_TU", satuanKerja: "Biro Contoh" }; // sensitive-ok
const KURSOR = "2026-11-05T05:00:00.000Z_abc-123";

const minta = (query = "") => GET(new Request(`http://localhost/api/kabar${query}`));

describe("GET /api/kabar", () => {
  beforeEach(() => {
    sesi.mockReset();
    for (const fn of Object.values(data)) fn.mockReset();
    sesi.mockResolvedValue(akunKasubag);
  });

  it("401 tanpa sesi, tidak menyentuh data", async () => {
    sesi.mockResolvedValue(null);
    for (const q of ["", "?ringkas=1", `?sebelum=${KURSOR}`]) {
      expect((await minta(q)).status).toBe(401);
    }
    expect(data.ambilIsiPanelKabar).not.toHaveBeenCalled();
    expect(data.hitungNotifikasiKabar).not.toHaveBeenCalled();
    expect(data.ambilHalamanAktivitas).not.toHaveBeenCalled();
  });

  it("isi lengkap: meneruskan penyaring satker, no-store, dan 403 bila tidak boleh", async () => {
    data.ambilIsiPanelKabar.mockResolvedValue({ boleh: true, aktivitas: [], notifikasi: [] });
    const res = await minta("?satker=Biro%20Lain");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(data.ambilIsiPanelKabar.mock.calls[0][0]).toMatchObject({ role: "KASUBAG_TU", satuanKerja: "Biro Contoh", aktif: true });
    expect(data.ambilIsiPanelKabar.mock.calls[0][1]).toBe("Biro Lain");

    data.ambilIsiPanelKabar.mockResolvedValue({ boleh: false });
    expect((await minta()).status).toBe(403);
  });

  it("?ringkas=1: hanya jumlah; 403 bila pemakai tak berhak", async () => {
    data.hitungNotifikasiKabar.mockResolvedValue(4);
    const res = await minta("?ringkas=1");
    expect(await res.json()).toEqual({ jumlah: 4 });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(data.ambilIsiPanelKabar).not.toHaveBeenCalled();

    data.hitungNotifikasiKabar.mockResolvedValue(null);
    expect((await minta("?ringkas=1")).status).toBe(403);
  });

  it("?sebelum=: halaman berikutnya dengan kursor terurai dan satker diteruskan", async () => {
    data.ambilHalamanAktivitas.mockResolvedValue({ aktivitas: [], kursorBerikut: null });
    const res = await minta(`?sebelum=${KURSOR}&satker=Biro%20Lain`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ aktivitas: [], kursorBerikut: null });
    const [, satker, kursor] = data.ambilHalamanAktivitas.mock.calls[0];
    expect(satker).toBe("Biro Lain");
    expect(kursor.id).toBe("abc-123");
    expect(kursor.waktu.toISOString()).toBe("2026-11-05T05:00:00.000Z");
  });

  it("?sebelum= rusak: 400 tanpa menyentuh data", async () => {
    for (const q of ["?sebelum=", "?sebelum=ngawur", "?sebelum=bukan-tanggal_abc", "?sebelum=2026-11-05T05:00:00Z_"]) {
      expect((await minta(q)).status, q).toBe(400);
    }
    expect(data.ambilHalamanAktivitas).not.toHaveBeenCalled();
  });

  it("?sebelum= untuk pemakai tak berhak: 403", async () => {
    data.ambilHalamanAktivitas.mockResolvedValue(null);
    expect((await minta(`?sebelum=${KURSOR}`)).status).toBe(403);
  });
});
