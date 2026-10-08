import { describe, it, expect, vi, beforeEach } from "vitest";
import { koreksiJamLemburHarianAction, hapusKoreksiJamLemburHarianAction } from "../actions";
import * as authSession from "../../../../auth/getSessionAccount";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("koreksiJamLemburHarianAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("menolak jika belum login / sesi habis", async () => {
    vi.spyOn(authSession, "getSessionAccount").mockResolvedValue(null);

    const formData = new FormData();
    formData.append("pegawaiId", "p-1");
    formData.append("tanggalIso", "2026-06-05");
    formData.append("periodeBulan", "6");
    formData.append("periodeTahun", "2026");
    formData.append("jamLembur", "2");
    formData.append("alasan", "SPL No. 123/TU/VI/2026");

    const res = await koreksiJamLemburHarianAction({}, formData);
    expect(res.error).toMatch(/sesi login/i);
  });

  it("menolak jika data tidak lengkap", async () => {
    vi.spyOn(authSession, "getSessionAccount").mockResolvedValue({
      nip: "19850101",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTersedia: ["KASUBAG_TU"],
    } as any);
    vi.spyOn(authSession, "ambilUserSesi").mockResolvedValue({
      id: "u-1",
      nip: "19850101",
      nama: "Kasubag TU",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTambahan: [],
      aktif: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const formData = new FormData();
    // pegawaiId tidak diisi
    formData.append("tanggalIso", "2026-06-05");
    formData.append("periodeBulan", "6");
    formData.append("periodeTahun", "2026");

    const res = await koreksiJamLemburHarianAction({}, formData);
    expect(res.error).toMatch(/tidak lengkap/i);
  });

  it("menolak jika jam lembur bukan bilangan bulat 0-24", async () => {
    vi.spyOn(authSession, "getSessionAccount").mockResolvedValue({
      nip: "19850101",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTersedia: ["KASUBAG_TU"],
    } as any);
    vi.spyOn(authSession, "ambilUserSesi").mockResolvedValue({
      id: "u-1",
      nip: "19850101",
      nama: "Kasubag TU",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTambahan: [],
      aktif: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const formData = new FormData();
    formData.append("pegawaiId", "p-1");
    formData.append("tanggalIso", "2026-06-05");
    formData.append("periodeBulan", "6");
    formData.append("periodeTahun", "2026");
    formData.append("jamLembur", "2.5"); // Pecahan tidak diizinkan
    formData.append("alasan", "SPL No. 123/TU/VI/2026");

    const res = await koreksiJamLemburHarianAction({}, formData);
    expect(res.error).toMatch(/bilangan bulat antara 0 sampai 24/i);
  });

  it("menolak jika alasan / dasar SPL kurang dari 10 karakter", async () => {
    vi.spyOn(authSession, "getSessionAccount").mockResolvedValue({
      nip: "19850101",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTersedia: ["KASUBAG_TU"],
    } as any);
    vi.spyOn(authSession, "ambilUserSesi").mockResolvedValue({
      id: "u-1",
      nip: "19850101",
      nama: "Kasubag TU",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTambahan: [],
      aktif: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const formData = new FormData();
    formData.append("pegawaiId", "p-1");
    formData.append("tanggalIso", "2026-06-05");
    formData.append("periodeBulan", "6");
    formData.append("periodeTahun", "2026");
    formData.append("jamLembur", "2");
    formData.append("alasan", "Lembur"); // cuma 6 karakter

    const res = await koreksiJamLemburHarianAction({}, formData);
    expect(res.error).toMatch(/minimal 10 karakter/i);
  });
});

describe("hapusKoreksiJamLemburHarianAction", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("menolak jika parameter tidak lengkap", async () => {
    vi.spyOn(authSession, "getSessionAccount").mockResolvedValue({
      nip: "19850101",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTersedia: ["KASUBAG_TU"],
    } as any);
    vi.spyOn(authSession, "ambilUserSesi").mockResolvedValue({
      id: "u-1",
      nip: "19850101",
      nama: "Kasubag TU",
      role: "KASUBAG_TU",
      satuanKerja: "Biro Keuangan",
      rolesTambahan: [],
      aktif: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);

    const formData = new FormData();
    formData.append("koreksiId", "k-1");
    // pegawaiId tidak diisi

    const res = await hapusKoreksiJamLemburHarianAction({}, formData);
    expect(res.error).toMatch(/tidak lengkap/i);
  });
});

