import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  sign: vi.fn(),
  pdf: vi.fn(),
  pegawaiFindUnique: vi.fn(),
  perintahFindMany: vi.fn(),
  dokumenFindFirst: vi.fn(),
  auditCreate: vi.fn(),
  queryRaw: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/tte/tandatanganiDokumen", () => ({ tandatanganiDokumen: m.sign }));
vi.mock("@/lib/tte/spklBulananPdf", () => ({ generateSpklBulananPdf: m.pdf }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.pegawaiFindUnique },
    perintahLembur: { findMany: m.perintahFindMany },
    auditTrail: { create: m.auditCreate },
    $transaction: m.transaction,
  },
}));

import { POST } from "../route";

const SATKER = "Biro Keuangan dan Barang Milik Negara";
const NIP_KASUBAG = "199001010000000011"; // sensitive-ok
const NIP_A = "199001010000000021"; // sensitive-ok
const NIK_SAH = "3201010101010001"; // sensitive-ok
const NIK_DEMO = "0803202100007062"; // sensitive-ok
const PASSPHRASE = "rahasia-uji-passphrase-123";

const user = (o: Record<string, unknown> = {}) => ({
  id: "u-kasubag",
  nip: NIP_KASUBAG,
  role: "KASUBAG_TU",
  satuanKerja: SATKER,
  aktif: true,
  ...o,
});

const RIWAYAT = [
  {
    tanggal: new Date(Date.UTC(2026, 11, 10)),
    uraianTugas: "Menyusun laporan uji",
    dikirimPada: new Date("2026-12-10T03:00:00Z"),
    anggota: [{ pegawaiId: "p-a", jamDiperintahkan: 3, pegawai: { nip: NIP_A, nama: "ANGGOTA SATU", golongan: "III/c" } }],
  },
];

const badan = (o: Record<string, unknown> = {}) => ({
  action: "spkl-bulanan-kirim",
  bulan: 12,
  tahun: 2026,
  nik: NIK_SAH,
  passphrase: PASSPHRASE,
  ...o,
});

const panggil = (b: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/lembur/spkl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );

let kunciDipegang: boolean;

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  kunciDipegang = false;
  m.ambilUserSesi.mockResolvedValue(user());
  m.pegawaiFindUnique.mockResolvedValue({ nama: "KASUBAG UJI", nip: NIP_KASUBAG, jabatan: "Kasubag TU Uji" });
  m.perintahFindMany.mockResolvedValue(RIWAYAT);
  m.dokumenFindFirst.mockResolvedValue(null);
  m.pdf.mockResolvedValue(Buffer.from("pdf-uji"));
  m.auditCreate.mockResolvedValue({});
  m.queryRaw.mockImplementation(async () => {
    if (kunciDipegang) return [{ ok: false }];
    kunciDipegang = true;
    return [{ ok: true }];
  });
  // Meniru kunci xact: dipegang sampai callback transaksi selesai.
  m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    try {
      return await fn({
        $queryRaw: m.queryRaw,
        dokumenTte: { findFirst: m.dokumenFindFirst },
        perintahLembur: { findMany: m.perintahFindMany },
      });
    } finally {
      kunciDipegang = false;
    }
  });
  m.sign.mockImplementation(async (p: { buatPdf: (x: unknown) => Promise<Buffer> }) => {
    await p.buatPdf({ nama: "Kasubag Uji", nip: NIP_KASUBAG, jabatan: "Kasubag TU Uji" });
    return {
      success: true,
      dokumenId: "dok-spkl-1",
      downloadUrl: "/berkas/tte/dok-spkl-1",
      penandatanganNama: "Kasubag Uji",
      idDokumenBsre: "id-bsre-uji",
    };
  });
});

describe("POST /api/lembur/spkl - kirim", () => {
  it("sukses: tanda tangan jenis SPKL_BULANAN, tanpa NIK demo, satker dari sesi, tanpa revalidasi", async () => {
    const res = await panggil(badan());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ success: true, dokumenId: "dok-spkl-1", downloadUrl: "/berkas/tte/dok-spkl-1", jumlahPegawai: 1 });
    expect(m.sign).toHaveBeenCalledTimes(1);
    const arg = m.sign.mock.calls[0][0];
    expect(arg).toMatchObject({
      jenisDokumen: "SPKL_BULANAN",
      satuanKerja: SATKER,
      periodeBulan: 12,
      periodeTahun: 2026,
      izinkanNikDemoBsre: false,
      nik: NIK_SAH,
      pathRevalidasi: [],
    });
    expect(m.pdf.mock.calls[0][0]).toMatchObject({ previewTte: false, satuanKerja: SATKER });
    expect(m.pdf.mock.calls[0][0].anggota).toHaveLength(1);
  });

  it("AuditTrail: entitas spkl_bulanan, satker terisi, tanpa NIP/NIK/passphrase", async () => {
    await panggil(badan());
    expect(m.auditCreate).toHaveBeenCalledTimes(1);
    const { data } = m.auditCreate.mock.calls[0][0];
    expect(data).toMatchObject({ entitas: "spkl_bulanan", entitasId: "dok-spkl-1", aksi: "CREATE", satuanKerja: SATKER });
    const teks = JSON.stringify(data.dataSesudah);
    expect(data.dataSesudah).toMatchObject({ periode: "12/2026", jumlahPerintah: 1, jumlahPegawai: 1, totalJam: 3 });
    for (const rahasia of [NIP_A, NIK_SAH, PASSPHRASE]) expect(teks).not.toContain(rahasia);
  });

  it.each([
    ["PEGAWAI", { role: "PEGAWAI" }],
    ["KEPALA_TIM", { role: "KEPALA_TIM" }],
    ["ADMIN", { role: "ADMIN", satuanKerja: null }],
    ["PPABP", { role: "PPABP", satuanKerja: null }],
    ["Kasubag TU nonaktif", { aktif: false }],
  ])("%s ditolak 403 untuk pratinjau maupun kirim, tanpa menyentuh data/BSrE", async (_n, o) => {
    m.ambilUserSesi.mockResolvedValue(user(o));
    for (const action of ["spkl-bulanan-pratinjau", "spkl-bulanan-kirim"]) {
      const res = await panggil(badan({ action }));
      expect(res.status).toBe(403);
    }
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.perintahFindMany).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("tanpa sesi -> 401", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    expect((await panggil(badan())).status).toBe(401);
  });

  it("satker dari sesi, bukan dari badan permintaan", async () => {
    await panggil(badan({ satker: "Biro Lain", satuanKerja: "Biro Lain", anggota: [{ pegawaiId: "x", jam: 9 }], nomorSurat: "bebas" }));
    expect(m.perintahFindMany.mock.calls[0][0].where.satuanKerja).toBe(SATKER);
    expect(m.sign.mock.calls[0][0].satuanKerja).toBe(SATKER);
    expect(m.sign.mock.calls[0][0].nomorDokumen).not.toBe("bebas");
  });

  it("satker di luar gerbang pilot -> 422, tanpa query perintah", async () => {
    m.ambilUserSesi.mockResolvedValue(user({ satuanKerja: "Biro Lain" }));
    const res = await panggil(badan());
    expect(res.status).toBe(422);
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.perintahFindMany).not.toHaveBeenCalled();
  });

  it("periode sebelum gerbang berlaku -> 422", async () => {
    expect((await panggil(badan({ bulan: 11 }))).status).toBe(422);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it.each([
    [{ bulan: 13 }],
    [{ bulan: 0 }],
    [{ tahun: 1999 }],
    [{ bulan: "abc" }],
    [{ bulan: 12.5 }],
  ])("periode tidak valid %j -> 400", async (o) => {
    expect((await panggil(badan(o))).status).toBe(400);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("aksi tak dikenal -> 400", async () => {
    expect((await panggil(badan({ action: "kirim" }))).status).toBe(400);
  });

  it("rekap kosong ditolak: tidak ada tanda tangan", async () => {
    m.perintahFindMany.mockResolvedValue([]);
    const res = await panggil(badan());
    expect(res.status).toBe(422);
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("NIK sertifikat demo ditolak sebelum transaksi", async () => {
    const res = await panggil(badan({ nik: NIK_DEMO }));
    expect(res.status).toBe(400);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("NIK bukan 16 digit (NIP 18 digit) ditolak", async () => {
    expect((await panggil(badan({ nik: NIP_A }))).status).toBe(400);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("passphrase kosong ditolak", async () => {
    expect((await panggil(badan({ passphrase: "" }))).status).toBe(400);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("sudah ada SPKL TERTANDATANGANI untuk satker+periode -> 409, tanpa tanda tangan kedua", async () => {
    m.dokumenFindFirst.mockResolvedValue({ id: "dok-lama" });
    const res = await panggil(badan());
    expect(res.status).toBe(409);
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
    const cari = m.dokumenFindFirst.mock.calls[0][0].where;
    expect(cari).toMatchObject({ jenisDokumen: "SPKL_BULANAN", satuanKerja: SATKER, periodeBulan: 12, periodeTahun: 2026, status: "TERTANDATANGANI" });
  });

  it("kirim memasang batas waktu BSrE (di bawah batas transaksi)", async () => {
    await panggil(badan());
    const batas = m.sign.mock.calls[0][0].batasWaktuSignMs;
    expect(batas).toBe(60_000);
    expect(batas).toBeLessThan(180_000);
  });

  it("MENUNGGU_TTE segar (< 5 menit) -> 409 'sedang diproses', tanpa tanda tangan kedua", async () => {
    m.dokumenFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "dok-menunggu" });
    const res = await panggil(badan());
    expect(res.status).toBe(409);
    expect(m.sign).not.toHaveBeenCalled();
    const cari = m.dokumenFindFirst.mock.calls[1][0].where;
    expect(cari).toMatchObject({ jenisDokumen: "SPKL_BULANAN", satuanKerja: SATKER, periodeBulan: 12, periodeTahun: 2026, status: "MENUNGGU_TTE" });
    const selisih = Date.now() - cari.createdAt.gte.getTime();
    expect(selisih).toBeGreaterThan(5 * 60_000 - 5_000);
    expect(selisih).toBeLessThan(5 * 60_000 + 5_000);
  });

  it("MENUNGGU_TTE lebih tua dari 5 menit tidak memblokir (filter createdAt tidak menemukan apa pun)", async () => {
    m.dokumenFindFirst.mockResolvedValue(null);
    const res = await panggil(badan());
    expect(res.status).toBe(200);
    expect(m.sign).toHaveBeenCalledTimes(1);
  });

  it("timeout BSrE: dilaporkan gagal 422, tanpa AuditTrail", async () => {
    m.sign.mockResolvedValue({ success: false, error: "Penandatanganan GAGAL: layanan tanda tangan BSrE tidak dapat dihubungi (batas waktu/koneksi)." });
    const res = await panggil(badan());
    expect(res.status).toBe(422);
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    ["P2028", Object.assign(new Error("Transaction API error: Transaction already closed"), { code: "P2028" })],
    ["pesan tanpa kode", new Error("Transaction already closed: A commit cannot be executed on an expired transaction")],
  ])("transaksi tertutup/kedaluwarsa (%s) -> 409 dengan pesan 'mungkin sudah berhasil', bukan 500", async (_n, err) => {
    m.transaction.mockRejectedValue(err);
    const res = await panggil(badan());
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toMatch(/mungkin sudah berhasil/i);
    expect(json.error).toMatch(/muat ulang/i);
  });

  it("dua permintaan bersamaan: hanya satu yang menandatangani, yang lain 409", async () => {
    let lepas: () => void = () => {};
    const tahan = new Promise<void>((r) => {
      lepas = r;
    });
    m.sign.mockImplementation(async () => {
      await tahan; // BSrE masih menjawab selagi permintaan kedua masuk
      return { success: true, dokumenId: "dok-spkl-1", downloadUrl: "/berkas/tte/dok-spkl-1", penandatanganNama: "Kasubag Uji" };
    });
    const a = panggil(badan());
    const b = panggil(badan());
    await vi.waitFor(() => expect(m.sign).toHaveBeenCalled());
    // beri kesempatan permintaan lain mencoba kunci selagi BSrE masih menjawab
    await new Promise((r) => setTimeout(r, 20));
    lepas();
    const status = (await Promise.all([a, b])).map((r) => r.status).sort();
    expect(status).toEqual([200, 409]);
    expect(m.sign).toHaveBeenCalledTimes(1);
  });

  it("penandatanganan gagal: pesan diteruskan, tanpa AuditTrail", async () => {
    m.sign.mockResolvedValue({ success: false, error: "Passphrase BSrE salah." });
    const res = await panggil(badan());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Passphrase BSrE salah.");
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("galat tak terduga: passphrase tidak bocor ke respons", async () => {
    m.sign.mockRejectedValue(new Error(`koneksi putus saat memakai ${PASSPHRASE}`));
    const res = await panggil(badan());
    const teks = await res.text();
    expect(res.status).toBe(500);
    expect(teks).not.toContain(PASSPHRASE);
  });

  it("respons sukses tidak memuat passphrase atau NIK", async () => {
    const teks = await (await panggil(badan())).text();
    expect(teks).not.toContain(PASSPHRASE);
    expect(teks).not.toContain(NIK_SAH);
  });

  it("gagal menulis AuditTrail tidak mengubah jawaban sukses", async () => {
    m.auditCreate.mockRejectedValue(new Error("db putus"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await panggil(badan());
    expect(res.status).toBe(200);
    spy.mockRestore();
  });
});

describe("POST /api/lembur/spkl - pratinjau", () => {
  it("mengembalikan PDF pratinjau (base64) dan tidak menandatangani", async () => {
    const res = await panggil(badan({ action: "spkl-bulanan-pratinjau", nik: "", passphrase: "" }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.pdfBase64).toBe(Buffer.from("pdf-uji").toString("base64"));
    expect(json.namaBerkas).toMatch(/^Pratinjau SPKL - Desember 2026/);
    expect(m.pdf.mock.calls[0][0].previewTte).toBe(true);
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("rekap kosong -> 422", async () => {
    m.perintahFindMany.mockResolvedValue([]);
    expect((await panggil(badan({ action: "spkl-bulanan-pratinjau" }))).status).toBe(422);
  });

  it("jabatan penanda tangan kosong -> 422", async () => {
    m.pegawaiFindUnique.mockResolvedValue({ nama: "KASUBAG UJI", nip: NIP_KASUBAG, jabatan: " " });
    expect((await panggil(badan({ action: "spkl-bulanan-pratinjau" }))).status).toBe(422);
  });
});
