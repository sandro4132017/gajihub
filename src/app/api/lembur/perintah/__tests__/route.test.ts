import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  sign: vi.fn(),
  pdf: vi.fn(),
  pegawaiFindUnique: vi.fn(),
  pegawaiFindMany: vi.fn(),
  anggotaFindMany: vi.fn(),
  dokumenFindUnique: vi.fn(),
  dokumenUpdate: vi.fn(),
  auditCreate: vi.fn(),
  txPerintahCreate: vi.fn(),
  txAuditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/tte/tandatanganiDokumen", () => ({ tandatanganiDokumen: m.sign }));
vi.mock("@/lib/tte/suratTugasLemburPdf", () => ({ generateSuratTugasLemburPdf: m.pdf }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.pegawaiFindUnique, findMany: m.pegawaiFindMany },
    perintahLemburAnggota: { findMany: m.anggotaFindMany },
    dokumenTte: { findUnique: m.dokumenFindUnique, update: m.dokumenUpdate },
    auditTrail: { create: m.auditCreate },
    $transaction: m.transaction,
  },
}));

import { POST } from "../route";

const SATKER = "Biro Keuangan dan Barang Milik Negara";
const NIP_KEPALA = "199001010000000011"; // sensitive-ok
const NIP_A = "199001010000000021"; // sensitive-ok
const NIP_B = "199001010000000022"; // sensitive-ok
const NIK_SAH = "3201010101010001"; // sensitive-ok
const NIK_DEMO = "0803202100007062"; // sensitive-ok
const PASSPHRASE = "rahasia-uji-passphrase-123";
const TANGGAL = "2026-12-10";
// 10:00 WIB pada TANGGAL
const PUKUL_10_WIB = new Date("2026-12-10T03:00:00Z");

const KEPALA = { id: "p-kepala", nip: NIP_KEPALA, nama: "KEPALA UJI", jabatan: "Kepala Tim Uji", satuanKerja: SATKER };
const baris = (id: string, nip: string, nama: string, o: Record<string, unknown> = {}) => ({
  id,
  nip,
  nama,
  jabatan: "Staf Uji",
  satuanKerja: SATKER,
  statusPegawai: "AKTIF",
  sourceSystem: "SIAP",
  ...o,
});
let ROWS: ReturnType<typeof baris>[];

const user = (o: Record<string, unknown> = {}) => ({
  id: "u-kepala",
  nip: NIP_KEPALA,
  role: "KEPALA_TIM",
  satuanKerja: SATKER,
  aktif: true,
  ...o,
});

const badanDasar = (o: Record<string, unknown> = {}) => ({
  action: "kirim",
  tanggal: TANGGAL,
  uraianTugas: "Menyusun laporan uji",
  anggota: [
    { pegawaiId: "p-a", jam: 3 },
    { pegawaiId: "p-b", jam: 2 },
  ],
  nik: NIK_SAH,
  passphrase: PASSPHRASE,
  ...o,
});

const kirim = (b: Record<string, unknown>) =>
  POST(
    new NextRequest("http://localhost/api/lembur/perintah", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    }),
  );

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(PUKUL_10_WIB);
  Object.values(m).forEach((f) => f.mockReset());
  ROWS = [baris("p-a", NIP_A, "ANGGOTA SATU"), baris("p-b", NIP_B, "ANGGOTA DUA")];
  m.ambilUserSesi.mockResolvedValue(user());
  m.pegawaiFindUnique.mockResolvedValue(KEPALA);
  m.pegawaiFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) =>
    ROWS.filter((r) => where.id.in.includes(r.id)),
  );
  m.anggotaFindMany.mockResolvedValue([]);
  m.pdf.mockResolvedValue(Buffer.from("pdf-uji"));
  m.sign.mockImplementation(async (p: { buatPdf: (x: unknown) => Promise<Buffer> }) => {
    await p.buatPdf({ nama: "Kepala Uji", nip: NIP_KEPALA, jabatan: "Kepala Tim Uji" });
    return {
      success: true,
      dokumenId: "dok-1",
      downloadUrl: "/berkas/tte/dok-1",
      penandatanganNama: "Kepala Uji",
      idDokumenBsre: "id-bsre-uji",
    };
  });
  m.dokumenFindUnique.mockResolvedValue({ signedAt: new Date("2026-12-10T03:00:05Z") });
  m.dokumenUpdate.mockResolvedValue({});
  m.auditCreate.mockResolvedValue({});
  m.txPerintahCreate.mockResolvedValue({ id: "perintah-1" });
  m.txAuditCreate.mockResolvedValue({});
  m.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ perintahLembur: { create: m.txPerintahCreate }, auditTrail: { create: m.txAuditCreate } }),
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/lembur/perintah - kirim", () => {
  it("sukses: satu transaksi membuat perintah TERKIRIM dengan anggota terkirim=true", async () => {
    const res = await kirim(badanDasar());
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    const { data } = m.txPerintahCreate.mock.calls[0][0];
    expect(data.status).toBe("TERKIRIM");
    expect(data.dokumenTteId).toBe("dok-1");
    expect(data.dikirimPada).toBeInstanceOf(Date);
    expect(data.nomorSurat).toEqual(expect.any(String));
    expect(data.anggota.create).toHaveLength(2);
    for (const a of data.anggota.create) {
      expect(a.terkirim).toBe(true);
      expect(a.tanggal).toEqual(new Date(Date.UTC(2026, 11, 10)));
    }
    expect(data.anggota.create.map((a: { jamDiperintahkan: number }) => a.jamDiperintahkan)).toEqual([3, 2]);
    // AuditTrail ikut transaksi yang sama, satuanKerja terisi, tanpa NIP.
    const audit = m.txAuditCreate.mock.calls[0][0].data;
    expect(audit.satuanKerja).toBe(SATKER);
    expect(audit.entitasId).toBe("perintah-1");
    expect(JSON.stringify(audit.dataSesudah)).not.toContain(NIP_A);
    expect(audit.entitasId).not.toContain(NIP_KEPALA);
    // Tanpa revalidatePath: tandatanganiDokumen dipanggil tanpa jalur revalidasi.
    expect(m.sign.mock.calls[0][0].pathRevalidasi).toEqual([]);
  });

  it("jalur lembur memakai izinkanNikDemoBsre:false dan satker dari DB", async () => {
    await kirim(badanDasar());
    const p = m.sign.mock.calls[0][0];
    expect(p.izinkanNikDemoBsre).toBe(false);
    expect(p.satuanKerja).toBe(SATKER);
    expect(p.jenisDokumen).toBe("SURAT_TUGAS_LEMBUR");
  });

  it("field di luar daftar putih diabaikan (satker, kepalaTimId, terkirim, status, nomorSurat)", async () => {
    await kirim(
      badanDasar({
        satuanKerja: "Satker Lain",
        kepalaTimId: "u-orang-lain",
        terkirim: false,
        status: "DRAFT",
        nomorSurat: "NOMOR-PALSU",
        dokumenTteId: "dok-palsu",
        anggota: [{ pegawaiId: "p-a", jam: 3, terkirim: false, satuanKerja: "Satker Lain", nama: "X" }],
      }),
    );
    const { data } = m.txPerintahCreate.mock.calls[0][0];
    expect(data.satuanKerja).toBe(SATKER);
    expect(data.kepalaTimId).toBe("u-kepala");
    expect(data.status).toBe("TERKIRIM");
    expect(data.nomorSurat).not.toBe("NOMOR-PALSU");
    expect(data.dokumenTteId).toBe("dok-1");
    expect(data.anggota.create[0].terkirim).toBe(true);
    expect(m.sign.mock.calls[0][0].satuanKerja).toBe(SATKER);
  });

  it("lewat 15.00 WIB ditolak SEBELUM BSrE (dan pdf/transaksi tidak disentuh)", async () => {
    vi.setSystemTime(new Date("2026-12-10T08:00:01Z")); // 15:00:01 WIB
    const res = await kirim(badanDasar());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/15\.00 WIB/);
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.pdf).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("tepat 15.00.000 WIB masih diterima (batas inklusif)", async () => {
    vi.setSystemTime(new Date("2026-12-10T08:00:00Z"));
    m.dokumenFindUnique.mockResolvedValue({ signedAt: new Date("2026-12-10T08:00:00Z") });
    expect((await kirim(badanDasar())).status).toBe(200);
  });

  it("tanggal mendatang boleh walau jam sekarang lewat 15.00", async () => {
    vi.setSystemTime(new Date("2026-12-10T10:00:00Z"));
    const res = await kirim(badanDasar({ tanggal: "2026-12-11" }));
    expect(res.status).toBe(200);
  });

  it("TTE selesai setelah 15.00: perintah TIDAK dibuat, dokumen ditandai GAGAL dan dicatat", async () => {
    m.dokumenFindUnique.mockResolvedValue({ signedAt: new Date("2026-12-10T08:00:01Z") });
    const res = await kirim(badanDasar());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/tidak berlaku/i);
    expect(m.sign).toHaveBeenCalledTimes(1);
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.dokumenUpdate).toHaveBeenCalledWith({ where: { id: "dok-1" }, data: { status: "GAGAL" } });
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.satuanKerja).toBe(SATKER);
    expect(audit.dataSesudah.sebab).toBe("LEWAT_BATAS_WAKTU");
    expect(audit.entitasId).toBe("dok-1");
  });

  it("anggota satker lain ditolak PER BARIS dan BSrE tidak dipanggil", async () => {
    ROWS.push(baris("p-luar", "199001010000000033", "ORANG LUAR", { satuanKerja: "Biro Lain" })); // sensitive-ok
    const res = await kirim(
      badanDasar({
        anggota: [
          { pegawaiId: "p-a", jam: 3 },
          { pegawaiId: "p-luar", jam: 2 },
        ],
      }),
    );
    expect(res.status).toBe(403);
    expect(m.sign).not.toHaveBeenCalled();
    // Pesan tidak membocorkan nama orang di satker lain.
    expect(JSON.stringify(await res.json())).not.toContain("ORANG LUAR");
  });

  it.each([
    ["id tidak ada di DB", { pegawaiId: "p-hantu", jam: 1 }],
    ["diri sendiri", { pegawaiId: "p-kepala", jam: 1 }],
  ])("anggota %s ditolak", async (_n, anggota) => {
    ROWS.push(baris("p-kepala", NIP_KEPALA, "KEPALA UJI"));
    const res = await kirim(badanDasar({ anggota: [{ pegawaiId: "p-a", jam: 1 }, anggota] }));
    expect(res.status).toBe(403);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it.each([
    ["nonaktif", { statusPegawai: "PENSIUN" }],
    ["pegawai uji", { sourceSystem: "DUMMY_UJI" }],
  ])("anggota %s ditolak", async (_n, o) => {
    ROWS = [baris("p-a", NIP_A, "ANGGOTA SATU", o)];
    const res = await kirim(badanDasar({ anggota: [{ pegawaiId: "p-a", jam: 1 }] }));
    expect(res.status).toBe(403);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it.each([
    ["PPABP", "PPABP"],
    ["ADMIN (tanpa bypass)", "ADMIN"],
    ["KASUBAG_TU", "KASUBAG_TU"],
    ["PEGAWAI", "PEGAWAI"],
  ])("role %s ditolak sebelum data anggota disentuh", async (_n, role) => {
    m.ambilUserSesi.mockResolvedValue(user({ role }));
    const res = await kirim(badanDasar());
    expect(res.status).toBe(403);
    expect(m.pegawaiFindMany).not.toHaveBeenCalled();
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("tanpa sesi: 401", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    expect((await kirim(badanDasar())).status).toBe(401);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("satker di luar gerbang SPKL ditolak", async () => {
    m.pegawaiFindUnique.mockResolvedValue({ ...KEPALA, satuanKerja: "Biro Lain" });
    const res = await kirim(badanDasar());
    expect(res.status).toBe(403);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("tanggal sebelum SPKL berlaku ditolak", async () => {
    const res = await kirim(badanDasar({ tanggal: "2026-11-30" }));
    expect(res.status).toBe(403);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("NIK demo BSrE ditolak sebelum BSrE", async () => {
    const res = await kirim(badanDasar({ nik: NIK_DEMO }));
    expect(res.status).toBe(400);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it.each([
    ["15 digit", "320101010101000"],
    ["18 digit (format NIP)", "199001010000000011"], // sensitive-ok
    ["berhuruf", "32010101010100ab"],
    ["kosong", ""],
  ])("NIK %s ditolak", async (_n, nik) => {
    const res = await kirim(badanDasar({ nik }));
    expect(res.status).toBe(400);
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("isian tidak sah ditolak: jam tidak bulat, jam 0, uraian kosong, tanpa anggota, duplikat", async () => {
    for (const o of [
      { anggota: [{ pegawaiId: "p-a", jam: 1.5 }] },
      { anggota: [{ pegawaiId: "p-a", jam: 0 }] },
      { anggota: [{ pegawaiId: "p-a", jam: 25 }] },
      { uraianTugas: "   " },
      { anggota: [] },
      {
        anggota: [
          { pegawaiId: "p-a", jam: 1 },
          { pegawaiId: "p-a", jam: 2 },
        ],
      },
    ]) {
      expect((await kirim(badanDasar(o))).status).toBe(400);
    }
    expect(m.sign).not.toHaveBeenCalled();
  });

  it("bentrok dengan perintah terkirim: 409 menyebut nama, BSrE tidak dipanggil", async () => {
    m.anggotaFindMany.mockResolvedValue([{ pegawaiId: "p-b" }]);
    const res = await kirim(badanDasar());
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("Anggota Dua");
    expect(json.error).not.toContain("Anggota Satu");
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.anggotaFindMany.mock.calls[0][0].where).toMatchObject({ terkirim: true });
  });

  it("kalah balapan (unique DB menolak): 409 dengan nama, perintah gagal, dokumen yatim ditandai GAGAL dan dicatat", async () => {
    m.anggotaFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ pegawaiId: "p-a" }]);
    m.transaction.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await kirim(badanDasar());
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toContain("Anggota Satu");
    expect(json.error).toMatch(/tidak berlaku/i);
    expect(m.dokumenUpdate).toHaveBeenCalledWith({ where: { id: "dok-1" }, data: { status: "GAGAL" } });
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.dataSesudah.sebab).toBe("BENTROK_BALAPAN");
    expect(audit.satuanKerja).toBe(SATKER);
  });

  it("gagal tanda tangan: pesan diteruskan, tidak ada perintah dibuat", async () => {
    m.sign.mockResolvedValue({ error: "Passphrase BSrE salah." });
    const res = await kirim(badanDasar());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Passphrase BSrE salah.");
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("passphrase tidak bocor ke respons, AuditTrail, maupun galat yang dilempar", async () => {
    // Sukses: tidak ada di respons maupun di panggilan database mana pun.
    const ok = await kirim(badanDasar());
    expect(JSON.stringify(await ok.json())).not.toContain(PASSPHRASE);
    for (const f of [m.txPerintahCreate, m.txAuditCreate, m.auditCreate, m.dokumenUpdate, m.anggotaFindMany]) {
      expect(JSON.stringify(f.mock.calls)).not.toContain(PASSPHRASE);
    }
    // Galat tak terduga yang membawa passphrase di pesannya.
    m.sign.mockRejectedValue(new Error(`BSrE menggemakan ${PASSPHRASE} di galat`));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await kirim(badanDasar());
    const teks = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(teks).not.toContain(PASSPHRASE);
    expect(JSON.stringify(log.mock.calls)).not.toContain(PASSPHRASE);
    log.mockRestore();
  });
});

describe("POST /api/lembur/perintah - pratinjau", () => {
  it("mengembalikan PDF berpenanda pratinjau, tanpa BSrE dan tanpa tulis database", async () => {
    const res = await kirim(badanDasar({ action: "pratinjau", nik: undefined, passphrase: undefined }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(Buffer.from(json.pdfBase64, "base64").toString()).toBe("pdf-uji");
    expect(m.pdf.mock.calls[0][0].previewTte).toBe(true);
    expect(m.sign).not.toHaveBeenCalled();
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.auditCreate).not.toHaveBeenCalled();
  });

  it("pratinjau juga menolak lewat 15.00 dan anggota satker lain", async () => {
    vi.setSystemTime(new Date("2026-12-10T08:00:01Z"));
    expect((await kirim(badanDasar({ action: "pratinjau" }))).status).toBe(422);
    vi.setSystemTime(PUKUL_10_WIB);
    ROWS = [baris("p-a", NIP_A, "ANGGOTA SATU", { satuanKerja: "Biro Lain" })];
    expect((await kirim(badanDasar({ action: "pratinjau" }))).status).toBe(403);
  });

  it("aksi tidak dikenal: 400", async () => {
    expect((await kirim(badanDasar({ action: "hapus" }))).status).toBe(400);
  });
});
