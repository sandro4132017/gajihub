import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { kalkulasiMassalTukinUangMakanAction } = vi.hoisted(() => ({
  kalkulasiMassalTukinUangMakanAction: vi.fn(),
}));

vi.mock("../../../../kasubag/kalkulasi/actions", () => ({
  kalkulasiMassalTukinUangMakanAction,
}));

import { POST } from "../route";

describe("POST /api/kasubag/kalkulasi", () => {
  beforeEach(() => {
    kalkulasiMassalTukinUangMakanAction.mockReset();
  });

  it("meneruskan isian kalkulasi ke aksi yang memeriksa sesi dan kewenangan", async () => {
    kalkulasiMassalTukinUangMakanAction.mockResolvedValue({
      success: "Tukin terhitung untuk 2 pegawai.",
      ringkasan: {
        dihitung: 2,
        dilewati: 0,
        detailDilewati: [],
        dilewatiPredikat: 0,
        detailSebagian: [],
      },
    });

    const req = new NextRequest("http://localhost/api/kasubag/kalkulasi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        satuanKerja: "Biro Keuangan",
        periodeBulan: 9,
        periodeTahun: 2026,
        lanjutkanTanpaLengkap: "1",
        fieldTakDiizinkan: "abaikan",
      }),
    });

    const res = await POST(req);
    const body = await res.json();
    const formData = kalkulasiMassalTukinUangMakanAction.mock.calls[0][1] as FormData;

    expect(res.status).toBe(200);
    expect(body.success).toContain("2 pegawai");
    expect(formData.get("satuanKerja")).toBe("Biro Keuangan");
    expect(formData.get("periodeBulan")).toBe("9");
    expect(formData.get("periodeTahun")).toBe("2026");
    expect(formData.get("lanjutkanTanpaLengkap")).toBe("1");
    expect(formData.has("fieldTakDiizinkan")).toBe(false);
  });

  it("mengembalikan 400 untuk JSON yang bukan objek", async () => {
    const req = new NextRequest("http://localhost/api/kasubag/kalkulasi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(["satuanKerja"]),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Format permintaan kalkulasi tidak valid." });
    expect(kalkulasiMassalTukinUangMakanAction).not.toHaveBeenCalled();
  });

  it("mempertahankan pesan validasi bisnis dari aksi kalkulasi", async () => {
    kalkulasiMassalTukinUangMakanAction.mockResolvedValue({
      error: "Sesi login sudah habis - silakan login ulang.",
    });

    const req = new NextRequest("http://localhost/api/kasubag/kalkulasi", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Sesi login sudah habis - silakan login ulang.",
    });
  });
});
