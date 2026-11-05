import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthUser } from "../../auth/permissions";

// ============================================================================
// Isi panel Kabar: cakupan unit, kalimat tanpa data pegawai, penggabungan,
// kursor, dan notifikasi per role. Prisma ditiru; semua data di bawah palsu.
// ============================================================================

const { palsu } = vi.hoisted(() => ({
  palsu: {
    auditTrail: { findMany: vi.fn() },
    approvalLog: { findMany: vi.fn() },
    pegawai: { findMany: vi.fn(), groupBy: vi.fn() },
    user: { findMany: vi.fn() },
    tukinCalculation: { findMany: vi.fn() },
    uangMakan: { findMany: vi.fn() },
    uangLembur: { findMany: vi.fn() },
    banding: { findMany: vi.fn(), count: vi.fn() },
    pengirimanUnit: { findMany: vi.fn() },
    reconciliationStatus: { count: vi.fn() },
  },
}));

vi.mock("../../lib/prisma", () => ({ prisma: palsu }));

import {
  ambilHalamanAktivitas,
  ambilIsiPanelKabar,
  ambilNotifikasi,
  bacaKursor,
  hitungNotifikasiKabar,
  tulisKursor,
} from "../kabarData";

const NIP_PALSU = "198100000000000001"; // sensitive-ok
const NIP_PALSU_2 = "198100000000000002"; // sensitive-ok

function user(role: AuthUser["role"], satuanKerja: string | null = null): AuthUser {
  return { nip: NIP_PALSU, role, satuanKerja, aktif: true };
}

interface RowAudit {
  id: string;
  entitas: string;
  entitasId: string;
  aksi: string;
  aktor: string;
  satuanKerja: string | null;
  timestamp: Date;
  dataSesudah?: unknown;
  dataSebelum?: unknown;
}

const T0 = new Date("2026-11-05T05:00:00Z").getTime();
const menit = (m: number) => new Date(T0 - m * 60_000);

function pasangAudit(rows: RowAudit[], ekspor: RowAudit[] = []) {
  palsu.auditTrail.findMany.mockImplementation(async (args: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
    if (args.where.entitas === "export_adk") return ekspor;
    const idIn = (args.where.id as { in?: string[] } | undefined)?.in;
    if (idIn) {
      return rows.filter((r) => idIn.includes(r.id)).map((r) => ({ id: r.id, dataSesudah: r.dataSesudah ?? null, dataSebelum: r.dataSebelum ?? null }));
    }
    return rows.map(({ dataSesudah: _a, dataSebelum: _b, ...ringan }) => ringan);
  });
}

beforeEach(() => {
  for (const model of Object.values(palsu)) for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  pasangAudit([]);
  palsu.approvalLog.findMany.mockResolvedValue([]);
  palsu.pegawai.findMany.mockResolvedValue([]);
  palsu.pegawai.groupBy.mockResolvedValue([{ satuanKerja: "Biro Contoh" }]);
  palsu.user.findMany.mockResolvedValue([]);
  palsu.tukinCalculation.findMany.mockResolvedValue([]);
  palsu.uangMakan.findMany.mockResolvedValue([]);
  palsu.uangLembur.findMany.mockResolvedValue([]);
  palsu.banding.findMany.mockResolvedValue([]);
  palsu.banding.count.mockResolvedValue(0);
  palsu.pengirimanUnit.findMany.mockResolvedValue([]);
  palsu.reconciliationStatus.count.mockResolvedValue(0);
});

describe("kursor", () => {
  it("bolak-balik dan menolak yang rusak", () => {
    const k = { waktu: new Date("2026-11-05T05:00:00.123Z"), id: "abc-123" };
    expect(bacaKursor(tulisKursor(k))).toEqual(k);
    for (const rusak of ["", "tanpa-garis-bawah", "bukan-tanggal_abc", "2026-11-05T05:00:00Z_", "2026-11-05T05:00:00Z_a b", "_abc"]) {
      expect(bacaKursor(rusak), rusak).toBeNull();
    }
  });
});

describe("cakupan", () => {
  it("PEGAWAI dan akun nonaktif tidak dapat panel", async () => {
    expect((await ambilIsiPanelKabar(user("PEGAWAI"))).boleh).toBe(false);
    expect((await ambilIsiPanelKabar({ ...user("PPABP"), aktif: false })).boleh).toBe(false);
    expect(await hitungNotifikasiKabar(user("PEGAWAI"))).toBeNull();
    expect(palsu.auditTrail.findMany).not.toHaveBeenCalled();
  });

  it("Kasubag TU tanpa unit tidak dapat panel", async () => {
    expect((await ambilIsiPanelKabar(user("KASUBAG_TU", null))).boleh).toBe(false);
  });

  it("Kasubag TU dipaksa ke unitnya sendiri, penyaring klien diabaikan", async () => {
    const isi = await ambilIsiPanelKabar(user("KASUBAG_TU", "Biro Contoh"), "Biro Lain");
    expect(isi.satkerScope).toBe("Biro Contoh");
    expect(isi.satkerPilih).toBeNull();
    expect(isi.daftarSatker).toEqual([]);
    const where = palsu.auditTrail.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("Biro Contoh");
    expect(JSON.stringify(where)).not.toContain("Biro Lain");
    expect(palsu.pegawai.groupBy).not.toHaveBeenCalled();
  });

  it("PPABP boleh menyaring ke satu unit tanpa kehilangan jangkauan", async () => {
    const isi = await ambilIsiPanelKabar(user("PPABP"), " Biro Contoh ");
    expect(isi.satkerScope).toBeNull();
    expect(isi.satkerPilih).toBe("Biro Contoh");
    expect(isi.daftarSatker).toEqual(["Biro Contoh"]);
    expect(JSON.stringify(palsu.auditTrail.findMany.mock.calls[0][0].where)).toContain("Biro Contoh");
  });
});

describe("aktivitas", () => {
  it("teks tanpa data pegawai: respons tidak memuat deret 18 digit atau kunci nip/nama/honorarium", async () => {
    pasangAudit([
      {
        id: "a1",
        entitas: "pengecualian_pegawai",
        entitasId: `${NIP_PALSU}|9|2026`,
        aksi: "CREATE",
        aktor: NIP_PALSU_2,
        satuanKerja: "Biro Contoh",
        timestamp: menit(1),
        dataSesudah: { nip: NIP_PALSU, nama: "Nama Palsu", alasanLabel: "Cuti besar", penjelasan: `lihat ${NIP_PALSU}`, honorarium: 99 },
      },
      {
        id: "a2",
        entitas: "koreksi_presensi_harian",
        entitasId: `${NIP_PALSU}-2026-09-14`,
        aksi: "UPDATE",
        aktor: "SYSTEM",
        satuanKerja: "Biro Contoh",
        timestamp: menit(60),
        dataSesudah: { nip: NIP_PALSU },
        dataSebelum: { jamMasukEpresensi: "07:01" },
      },
      {
        id: "a3",
        entitas: "PengirimanUnit",
        entitasId: "Biro Contoh|9|2026",
        aksi: "KEMBALIKAN",
        aktor: NIP_PALSU,
        satuanKerja: "Biro Contoh",
        timestamp: menit(120),
        dataSesudah: { alasanKembali: `Cek NIP ${NIP_PALSU} lagi` },
      },
    ]);
    palsu.approvalLog.findMany.mockResolvedValue([
      { id: "p1", referensiTipe: "TUKIN", referensiId: "t1", approverNip: NIP_PALSU, approverNama: "Pejabat Palsu", approverJabatan: "x", jenjang: 1, keputusan: "SETUJU", catatan: null, timestampAksi: menit(30) },
    ]);
    palsu.tukinCalculation.findMany.mockResolvedValue([{ id: "t1", pegawai: { satuanKerja: "Biro Contoh" } }]);

    const isi = await ambilIsiPanelKabar(user("PPABP"));
    const json = JSON.stringify(isi);
    expect(json).not.toMatch(/\d{9,}/);
    expect(json).not.toMatch(/"(nip|nama|honorarium|penjelasan)"/);
    expect(json).not.toContain("Nama Palsu");
    const teks = isi.aktivitas.map((a) => a.teks);
    expect(teks).toContain("Mengecualikan seorang pegawai dari perhitungan September 2026 - Cuti besar");
    expect(teks).toContain("Mengembalikan rekap September 2026 - alasan: Cek NIP … lagi");
    expect(teks).toContain("Menyetujui Tukin - tahap ke-1");
    // Urutan: terbaru dulu, dua sumber berbaur.
    expect(isi.aktivitas.map((a) => a.id)).toEqual(["a1", "p1", "a2", "a3"]);
    // Aktor tak dikenal -> "Pengguna lain", bukan NIP; SYSTEM -> "Sistem".
    expect(isi.aktivitas.find((a) => a.id === "a1")?.aktor).toBe("Pengguna lain");
    expect(isi.aktivitas.find((a) => a.id === "a2")?.aktor).toBe("Sistem");
  });

  it("nama aktor: pegawai lebih dulu, lalu akun", async () => {
    pasangAudit([
      { id: "a1", entitas: "kendala_epresensi", entitasId: "2026-09-14", aksi: "CREATE", aktor: NIP_PALSU, satuanKerja: null, timestamp: menit(1) },
      { id: "a2", entitas: "kendala_epresensi", entitasId: "2026-09-15", aksi: "DELETE", aktor: NIP_PALSU_2, satuanKerja: null, timestamp: menit(500) },
    ]);
    palsu.pegawai.findMany.mockResolvedValue([{ nip: NIP_PALSU, nama: "Aktor Pegawai" }]);
    palsu.user.findMany.mockResolvedValue([{ nip: NIP_PALSU_2, nama: "Aktor Akun" }]);
    const h = await ambilHalamanAktivitas(user("PPABP"), null, null);
    expect(h?.aktivitas.map((a) => a.aktor)).toEqual(["Aktor Pegawai", "Aktor Akun"]);
  });

  it("menggabungkan centang berurutan menjadi satu baris", async () => {
    pasangAudit(
      ["TUKIN", "UANG_LEMBUR", "PERUBAHAN_PEGAWAI"].map((t, i) => ({
        id: `v${i}`,
        entitas: "verifikasi_tabel_unit",
        entitasId: `Biro Contoh-9-2026-${t}`,
        aksi: "CREATE",
        aktor: NIP_PALSU,
        satuanKerja: "Biro Contoh",
        timestamp: menit(i),
      }))
    );
    const h = await ambilHalamanAktivitas(user("KASUBAG_TU", "Biro Contoh"), null, null);
    expect(h?.aktivitas).toHaveLength(1);
    expect(h?.aktivitas[0].teks).toBe("Memeriksa 3 tabel rekap September 2026 · 3 kali ubah centang");
    expect(h?.aktivitas[0].jumlah).toBe(3);
    expect(h?.aktivitas[0].href).toBe("/kasubag/kalkulasi?bulan=9&tahun=2026&satker=Biro%20Contoh");
  });

  it("JSON besar tidak diambil: SYNC kalkulasi dan hapus-periode predikat", async () => {
    pasangAudit([
      { id: "s1", entitas: "tukin_calculation", entitasId: "x", aksi: "SYNC", aktor: "SYSTEM", satuanKerja: null, timestamp: menit(1) },
      { id: "s2", entitas: "predikat_kinerja", entitasId: "hapus-periode-Biro Contoh-9-2026", aksi: "DELETE", aktor: NIP_PALSU, satuanKerja: "Biro Contoh", timestamp: menit(100) },
      { id: "s3", entitas: "pegawai", entitasId: "uuid", aksi: "DELETE", aktor: NIP_PALSU, satuanKerja: "Biro Contoh", timestamp: menit(200) },
      { id: "s4", entitas: "mode_jaringan", entitasId: "NETWORK_MODE", aksi: "UPDATE", aktor: NIP_PALSU, satuanKerja: null, timestamp: menit(300), dataSesudah: { mode: "PUBLIK" } },
    ]);
    await ambilHalamanAktivitas(user("ADMIN"), null, null);
    const panggilanJson = palsu.auditTrail.findMany.mock.calls.find((c) => c[0].where.id)?.[0];
    expect(panggilanJson.where.id.in).toEqual(["s4"]);
  });

  it("batch penuh memberi kursor berikutnya, dan kursor dipakai di query berikutnya", async () => {
    const rows: RowAudit[] = Array.from({ length: 60 }, (_, i) => ({
      id: `r${String(i).padStart(2, "0")}`,
      entitas: "hari_libur_nasional",
      entitasId: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`,
      aksi: i % 2 === 0 ? "CREATE" : "DELETE",
      aktor: NIP_PALSU,
      satuanKerja: null,
      timestamp: menit(i * 20),
    }));
    pasangAudit(rows);
    const h = await ambilHalamanAktivitas(user("PPABP"), null, null);
    expect(h?.kursorBerikut).not.toBeNull();
    const kursor = bacaKursor(h?.kursorBerikut ?? "");
    expect(kursor).not.toBeNull();

    palsu.auditTrail.findMany.mockClear();
    await ambilHalamanAktivitas(user("PPABP"), null, kursor);
    const where = palsu.auditTrail.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain("OR");
    expect(JSON.stringify(where)).toContain(kursor?.id ?? "?");
  });

  it("batch tidak penuh: tanpa kursor", async () => {
    pasangAudit([{ id: "a1", entitas: "gaji_induk", entitasId: "9/2026", aksi: "CREATE", aktor: NIP_PALSU, satuanKerja: null, timestamp: menit(1) }]);
    const h = await ambilHalamanAktivitas(user("PPABP"), null, null);
    expect(h?.kursorBerikut).toBeNull();
  });

  it("approval unit lain dibuang untuk Kasubag TU, unit tak terpastikan juga", async () => {
    palsu.approvalLog.findMany.mockResolvedValue([
      { id: "p1", referensiTipe: "TUKIN", referensiId: "t1", approverNama: "A", jenjang: 1, keputusan: "SETUJU", timestampAksi: menit(1) },
      { id: "p2", referensiTipe: "TUKIN", referensiId: "t2", approverNama: "A", jenjang: 1, keputusan: "TOLAK", timestampAksi: menit(2) },
      { id: "p3", referensiTipe: "BANDING", referensiId: "b-tak-ada", approverNama: "A", jenjang: 1, keputusan: "REVISI", timestampAksi: menit(3) },
      { id: "p4", referensiTipe: "BANDING", referensiId: "b1", approverNama: "A", jenjang: 2, keputusan: "SETUJU", timestampAksi: menit(4) },
    ]);
    palsu.tukinCalculation.findMany.mockResolvedValue([
      { id: "t1", pegawai: { satuanKerja: "Biro Contoh" } },
      { id: "t2", pegawai: { satuanKerja: "Biro Lain" } },
    ]);
    palsu.banding.findMany.mockResolvedValue([{ id: "b1", pegawai: { satuanKerja: "Biro Contoh" } }]);
    const h = await ambilHalamanAktivitas(user("KASUBAG_TU", "Biro Contoh"), null, null);
    expect(h?.aktivitas.map((a) => a.id)).toEqual(["p1", "p4"]);
  });

  it("teks approval Banding memakai nama tahap, referensiTipe tak dikenal tanpa nama enum", async () => {
    palsu.approvalLog.findMany.mockResolvedValue([
      { id: "p1", referensiTipe: "BANDING", referensiId: "b1", approverNama: "A", jenjang: 1, keputusan: "SETUJU", timestampAksi: menit(1) },
      { id: "p2", referensiTipe: "BANDING", referensiId: "b1", approverNama: "A", jenjang: 2, keputusan: "SETUJU", timestampAksi: menit(2) },
      { id: "p3", referensiTipe: "JENIS_BARU", referensiId: "x1", approverNama: "A", jenjang: 3, keputusan: "TOLAK", timestampAksi: menit(3) },
    ]);
    palsu.banding.findMany.mockResolvedValue([{ id: "b1", pegawai: { satuanKerja: "Biro Contoh" } }]);
    const h = await ambilHalamanAktivitas(user("PPABP"), null, null);
    const teks = (h?.aktivitas ?? []).map((a) => a.teks);
    expect(teks).toContain("Menyetujui Banding - tahap Kasubag TU");
    expect(teks).toContain("Menyetujui Banding - tahap OSDMA");
    expect(teks).toContain("Menolak data - tahap ke-3");
    expect(teks.join(" ")).not.toContain("JENIS_BARU");
  });
});

describe("paginasi dengan approval unit lain", () => {
  /** Tiruan ApprovalLog yang menghormati kursor dan take. */
  function pasangApprovalLain(jumlah: number) {
    const semua = Array.from({ length: jumlah }, (_, i) => ({
      id: `ap${String(i).padStart(3, "0")}`,
      referensiTipe: "TUKIN",
      referensiId: `t${i}`,
      approverNama: "Pejabat Palsu",
      jenjang: 1,
      keputusan: "SETUJU",
      timestampAksi: menit(i + 1),
    }));
    palsu.approvalLog.findMany.mockImplementation(async (args: { where: { OR?: { timestampAksi?: { lt?: Date } }[] }; take: number }) => {
      const batas = args.where.OR?.[0]?.timestampAksi?.lt;
      return semua.filter((r) => !batas || r.timestampAksi < batas).slice(0, args.take);
    });
    palsu.tukinCalculation.findMany.mockImplementation(async (args: { where: { id: { in: string[] } } }) =>
      args.where.id.in.map((id) => ({ id, pegawai: { satuanKerja: "Biro Lain" } }))
    );
  }
  const auditSendiri = (id: string, m: number): RowAudit => ({
    id,
    entitas: "kendala_epresensi",
    entitasId: "2026-09-14",
    aksi: "CREATE",
    aktor: "SYSTEM",
    satuanKerja: "Biro Contoh",
    timestamp: menit(m),
  });

  it("60 approval unit lain tidak menelan audit unit sendiri yang lebih tua", async () => {
    pasangApprovalLain(60);
    pasangAudit([auditSendiri("own1", 100), { ...auditSendiri("own2", 200), aksi: "DELETE" }]);
    const h = await ambilHalamanAktivitas(user("KASUBAG_TU", "Biro Contoh"), null, null);
    expect(h?.aktivitas.map((a) => a.id)).toEqual(["own1", "own2"]);
  });

  it("bila semua putaran habis oleh approval unit lain, kursor tetap maju", async () => {
    pasangApprovalLain(200);
    pasangAudit([auditSendiri("own1", 1000)]);
    const h = await ambilHalamanAktivitas(user("KASUBAG_TU", "Biro Contoh"), null, null);
    expect(h?.aktivitas).toEqual([]);
    expect(h?.kursorBerikut).not.toBeNull();
    expect(bacaKursor(h?.kursorBerikut ?? "")).not.toBeNull();
  });
});

describe("notifikasi", () => {
  it("Kasubag TU: rekap dikembalikan (alasan disamarkan) dan banding baru", async () => {
    palsu.pengirimanUnit.findMany.mockResolvedValue([
      { periodeBulan: 9, periodeTahun: 2026, alasanKembali: `Cek ${NIP_PALSU} dulu` },
    ]);
    palsu.banding.count.mockResolvedValue(2);
    const n = await ambilNotifikasi(user("KASUBAG_TU", "Biro Contoh"), "Biro Contoh");
    expect(n).toEqual([
      {
        id: "kembali-2026-9",
        teks: "Rekap September 2026 dikembalikan PPABP",
        keterangan: "Cek … dulu",
        href: "/kasubag/kalkulasi?bulan=9&tahun=2026",
        nada: "danger",
      },
      expect.objectContaining({ id: "banding", href: "/kasubag/banding", nada: "wait" }),
    ]);
    expect(palsu.pengirimanUnit.findMany.mock.calls[0][0].where).toEqual({ satuanKerja: "Biro Contoh", status: "DIKEMBALIKAN" });
    expect(palsu.pengirimanUnit.findMany.mock.calls[0][0].take).toBe(3);
  });

  const terkirim = [
    { satuanKerja: "Biro A", periodeBulan: 9, periodeTahun: 2026, dikirimPada: menit(60 * 24) },
    { satuanKerja: "Biro B", periodeBulan: 9, periodeTahun: 2026, dikirimPada: menit(60 * 24) },
  ];

  it("PPABP dan ADMIN: rekap terkirim tanpa ekspor sesudahnya, plus rekonsiliasi", async () => {
    palsu.pengirimanUnit.findMany.mockResolvedValue(terkirim);
    palsu.reconciliationStatus.count.mockResolvedValue(3);
    for (const role of ["PPABP", "ADMIN"] as const) {
      const n = await ambilNotifikasi(user(role), null);
      expect(n.map((x) => x.id), role).toEqual(["menunggu-2026-9", "rekonsiliasi"]);
      expect(n[0].teks).toBe("2 unit menunggu diproses - September 2026");
      expect(n[0].href).toBe("/ppabp/adk?bulan=9&tahun=2026");
      expect(n[1].href).toBe("/ppabp/banding");
    }
  });

  it("ekspor semua unit sesudah dikirim menuntaskan penantian", async () => {
    palsu.pengirimanUnit.findMany.mockResolvedValue(terkirim);
    pasangAudit([], [
      { id: "e1", entitas: "export_adk", entitasId: "tukin-9-2026", aksi: "EXPORT", aktor: NIP_PALSU, satuanKerja: null, timestamp: menit(10), dataSesudah: { satuanKerja: "semua unit terkirim", jumlahBaris: 5 } },
    ]);
    const n = await ambilNotifikasi(user("PPABP"), null);
    expect(n).toEqual([]);
  });

  it("disaring ke satu unit: rekonsiliasi dilewati, kiriman difilter unit", async () => {
    palsu.pengirimanUnit.findMany.mockResolvedValue([terkirim[0]]);
    palsu.reconciliationStatus.count.mockResolvedValue(9);
    const n = await ambilNotifikasi(user("PPABP"), "Biro A");
    expect(n.map((x) => x.id)).toEqual(["menunggu-2026-9"]);
    expect(palsu.reconciliationStatus.count).not.toHaveBeenCalled();
    expect(palsu.pengirimanUnit.findMany.mock.calls[0][0].where).toEqual({ status: "TERKIRIM", satuanKerja: "Biro A" });
  });

  it("OSDMA: banding menunggu keputusan final; PIMPINAN tanpa notifikasi", async () => {
    palsu.banding.count.mockResolvedValue(4);
    const osdma = await ambilNotifikasi(user("OSDMA"), null);
    expect(osdma).toEqual([expect.objectContaining({ href: "/osdma/banding", teks: "4 banding menunggu keputusan final" })]);
    expect(palsu.banding.count.mock.calls[0][0].where.status).toBe("MENUNGGU_APPROVAL_FINAL");
    palsu.banding.count.mockClear();
    expect(await ambilNotifikasi(user("PIMPINAN"), null)).toEqual([]);
    expect(palsu.banding.count).not.toHaveBeenCalled();
  });

  it("hitungNotifikasiKabar memakai cakupan paksa Kasubag TU", async () => {
    palsu.banding.count.mockResolvedValue(1);
    expect(await hitungNotifikasiKabar(user("KASUBAG_TU", "Biro Contoh"))).toBe(1);
    expect(palsu.banding.count.mock.calls[0][0].where.pegawai).toEqual({ satuanKerja: "Biro Contoh" });
  });
});
