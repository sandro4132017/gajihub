import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  getSessionAccount: vi.fn(),
  ambilUserSesi: vi.fn(),
  pegawaiFind: vi.fn(),
  pengirimanFind: vi.fn(),
  koreksiFindUnique: vi.fn(),
  presensiFindUnique: vi.fn(),
  transaksi: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  upsert: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock("../../../../lib/hariLibur", () => ({ muatHariLiburPeriode: vi.fn().mockResolvedValue(new Map()) }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  writeFile: m.writeFile,
  mkdir: m.mkdir,
  default: { writeFile: m.writeFile, mkdir: m.mkdir },
}));
vi.mock("@/auth/getSessionAccount", () => ({
  getSessionAccount: m.getSessionAccount,
  ambilUserSesi: m.ambilUserSesi,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.pegawaiFind },
    pengirimanUnit: { findUnique: m.pengirimanFind },
    koreksiPresensiHarian: { findUnique: m.koreksiFindUnique },
    presensiHarian: { findUnique: m.presensiFindUnique },
    $transaction: m.transaksi,
  },
}));

import { koreksiJamLemburHarianAction, hapusKoreksiJamLemburHarianAction } from "../actions";

const UNIT = "Biro Keuangan";
const ALASAN_SAH = "SPL No. 123/TU/VI/2026"; // >= 15 karakter

function masuk(role = "KASUBAG_TU", satuanKerja: string | null = UNIT) {
  m.getSessionAccount.mockResolvedValue({ nip: "19850101", role, satuanKerja, rolesTersedia: [role] });
  m.ambilUserSesi.mockResolvedValue({
    id: "u-1",
    nip: "19850101",
    nama: "Kasubag TU",
    role,
    satuanKerja,
    rolesTambahan: [],
    aktif: true,
  });
}

function form(ubah: Record<string, string | null> = {}) {
  const dasar: Record<string, string | null> = {
    pegawaiId: "p-1",
    tanggalIso: "2026-06-05",
    jamLembur: "2",
    alasan: ALASAN_SAH,
    pernyataan: "1",
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...dasar, ...ubah })) if (v !== null) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.pegawaiFind.mockResolvedValue({ id: "p-1", nip: "19850102", nama: "Pegawai Uji", satuanKerja: UNIT, golongan: "III/a" });
  m.pengirimanFind.mockResolvedValue(null);
  masuk();
});

describe("koreksiJamLemburHarianAction", () => {
  it("menolak jika belum login / sesi habis", async () => {
    m.getSessionAccount.mockResolvedValue(null);
    const res = await koreksiJamLemburHarianAction({}, form());
    expect(res.error).toMatch(/sesi login/i);
  });

  it("menolak jika data tidak lengkap", async () => {
    const res = await koreksiJamLemburHarianAction({}, form({ pegawaiId: null }));
    expect(res.error).toMatch(/tidak lengkap/i);
  });

  it("menolak jika jam lembur bukan bilangan bulat 0-24", async () => {
    const res = await koreksiJamLemburHarianAction({}, form({ jamLembur: "2.5" }));
    expect(res.error).toMatch(/bilangan bulat antara 0 sampai 24/i);
  });

  it("menolak jika alasan / dasar SPL kurang dari 15 karakter", async () => {
    const res = await koreksiJamLemburHarianAction({}, form({ alasan: "a".repeat(14) }));
    expect(res.error).toMatch(/minimal 15 karakter/i);
  });

  it("10 karakter (batas lama) kini ditolak", async () => {
    const res = await koreksiJamLemburHarianAction({}, form({ alasan: "SPL 123/VI" }));
    expect(res.error).toMatch(/minimal 15 karakter/i);
  });

  it("menolak tanpa centang pernyataan tanggung jawab", async () => {
    const res = await koreksiJamLemburHarianAction({}, form({ pernyataan: null }));
    expect(res.error).toMatch(/pernyataan/i);
    expect(m.pegawaiFind).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "PPABP", "OSDMA"])("%s ditolak - hanya Kasubag TU unit pegawai", async (role) => {
    masuk(role, UNIT);
    const res = await koreksiJamLemburHarianAction({}, form());
    expect(res.error).toMatch(/Kasubag TU unit pegawai ini/);
    expect(m.transaksi).not.toHaveBeenCalled();
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("Kasubag TU unit lain ditolak", async () => {
    masuk("KASUBAG_TU", "Biro Lain");
    const res = await koreksiJamLemburHarianAction({}, form());
    expect(res.error).toMatch(/Kasubag TU unit pegawai ini/);
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("periode kunci DITURUNKAN DARI TANGGAL, bukan dari form", async () => {
    m.pengirimanFind.mockResolvedValue({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null });
    // Form berpura-pura periode Januari 2020; tanggalnya Juni 2026.
    const res = await koreksiJamLemburHarianAction({}, form({ periodeBulan: "1", periodeTahun: "2020" }));
    expect(res.error).toMatch(/terkunci/i);
    expect(m.pengirimanFind.mock.calls[0][0].where.satuanKerja_periodeBulan_periodeTahun).toEqual({
      satuanKerja: UNIT,
      periodeBulan: 6,
      periodeTahun: 2026,
    });
    expect(m.transaksi).not.toHaveBeenCalled();
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("bukti opsional bertipe salah tetap ditolak, tanpa menulis disk", async () => {
    const fd = form();
    fd.append("bukti", new File(["halo"], "catatan.txt"));
    const res = await koreksiJamLemburHarianAction({}, fd);
    expect(res.error).toMatch(/JPG, PNG, atau PDF/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
  });
});

describe("koreksiJamLemburHarianAction - bukti opsional", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

  // Transaksi dijalankan dengan tx palsu; selaras-uang-lembur (sesudah audit)
  // sengaja digagalkan - yang diperiksa hanya penulisan koreksi & audit.
  function jalankanTransaksi() {
    m.transaksi.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        koreksiPresensiHarian: { upsert: m.upsert },
        presensiHarian: {
          update: vi.fn(),
          findMany: vi.fn().mockRejectedValue(new Error("hentikan di sini")),
        },
        auditTrail: { create: m.auditCreate },
      })
    );
  }

  it("bukti lembur ditulis ke buktiRefLembur dengan penanda _lembur; buktiRef & buktiRefKeluar tidak disentuh", async () => {
    jalankanTransaksi();
    m.presensiFindUnique.mockResolvedValue(null);
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      jamLembur: null,
      alasan: "alasan lama yang panjang",
      buktiRef: "bukti-koreksi/Biro Keuangan/2026-06/2026-06-05_masuk_1_aaaaaaaa.jpg",
      buktiRefKeluar: "bukti-koreksi/Biro Keuangan/2026-06/2026-06-05_keluar_1_bbbbbbbb.jpg",
      buktiRefLembur: null,
    });
    const fd = form();
    fd.append("bukti", new File([JPEG], "spl.jpg", { type: "image/jpeg" }));
    await koreksiJamLemburHarianAction({}, fd);

    expect(m.writeFile).toHaveBeenCalledTimes(1);
    expect(String(m.writeFile.mock.calls[0][0]).replace(/\\/g, "/")).toMatch(/2026-06-05_lembur_\d+_[0-9a-f]{8}\.jpg$/);
    const { create, update } = m.upsert.mock.calls[0][0];
    expect(create.buktiRefLembur).toMatch(/_lembur_/);
    expect(update.buktiRefLembur).toBe(create.buktiRefLembur);
    expect("buktiRef" in create).toBe(false);
    expect("buktiRef" in update).toBe(false);
    expect("buktiRefKeluar" in update).toBe(false);
  });

  it("tanpa berkas: buktiRefLembur lama dipertahankan", async () => {
    jalankanTransaksi();
    m.presensiFindUnique.mockResolvedValue(null);
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      jamLembur: 1,
      alasan: "alasan lama yang panjang",
      buktiRef: null,
      buktiRefKeluar: null,
      buktiRefLembur: "bukti-koreksi/Biro Keuangan/2026-06/2026-06-05_lembur_1_cccccccc.jpg",
    });
    await koreksiJamLemburHarianAction({}, form());
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.upsert.mock.calls[0][0].update.buktiRefLembur).toBe(
      "bukti-koreksi/Biro Keuangan/2026-06/2026-06-05_lembur_1_cccccccc.jpg"
    );
  });
});

describe("hapusKoreksiJamLemburHarianAction", () => {
  it("menolak jika parameter tidak lengkap", async () => {
    const fd = new FormData();
    fd.append("koreksiId", "k-1");
    const res = await hapusKoreksiJamLemburHarianAction({}, fd);
    expect(res.error).toMatch(/tidak lengkap/i);
  });

  const fdHapus = (ubah: Record<string, string> = {}) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({ koreksiId: "k-1", pegawaiId: "p-1", tanggalIso: "2026-06-05", ...ubah })) {
      fd.append(k, v);
    }
    return fd;
  };

  it.each(["ADMIN", "PPABP"])("%s ditolak", async (role) => {
    masuk(role, UNIT);
    const res = await hapusKoreksiJamLemburHarianAction({}, fdHapus());
    expect(res.error).toMatch(/Kasubag TU unit pegawai ini/);
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("rekap terkirim ditolak; periode dari tanggal koreksi (bukan form)", async () => {
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      pegawaiId: "p-1",
      tanggal: new Date(Date.UTC(2026, 5, 5)),
      jamMasuk: null,
      jamKeluar: null,
      jamLembur: 2,
      alasan: ALASAN_SAH,
      buktiRef: null,
      buktiRefKeluar: null,
      buktiRefLembur: null,
    });
    m.pengirimanFind.mockResolvedValue({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null });
    const res = await hapusKoreksiJamLemburHarianAction({}, fdHapus({ periodeBulan: "1", periodeTahun: "2020" }));
    expect(res.error).toMatch(/terkunci/i);
    expect(m.pengirimanFind.mock.calls[0][0].where.satuanKerja_periodeBulan_periodeTahun).toEqual({
      satuanKerja: UNIT,
      periodeBulan: 6,
      periodeTahun: 2026,
    });
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("koreksi milik pegawai/tanggal lain ditolak", async () => {
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      pegawaiId: "p-LAIN",
      tanggal: new Date(Date.UTC(2026, 5, 5)),
      jamMasuk: null,
      jamKeluar: null,
      jamLembur: 2,
      alasan: ALASAN_SAH,
      buktiRef: null,
      buktiRefKeluar: null,
      buktiRefLembur: null,
    });
    const res = await hapusKoreksiJamLemburHarianAction({}, fdHapus());
    expect(res.error).toMatch(/bukan milik/i);
    expect(m.transaksi).not.toHaveBeenCalled();
  });
});
