import { describe, it, expect, vi, beforeEach } from "vitest";

const m = vi.hoisted(() => ({
  ambilUserSesi: vi.fn(),
  pegawaiFind: vi.fn(),
  kendalaFind: vi.fn(),
  koreksiFindUnique: vi.fn(),
  koreksiUpsert: vi.fn(),
  koreksiDelete: vi.fn(),
  presensiFind: vi.fn(),
  auditCreate: vi.fn(),
  pengirimanFind: vi.fn(),
  transaksi: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("node:fs/promises", () => ({
  writeFile: m.writeFile,
  mkdir: m.mkdir,
  default: { writeFile: m.writeFile, mkdir: m.mkdir },
}));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi: m.ambilUserSesi }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    pegawai: { findUnique: m.pegawaiFind },
    kendalaEpresensi: { findFirst: m.kendalaFind },
    koreksiPresensiHarian: { findUnique: m.koreksiFindUnique, upsert: m.koreksiUpsert, delete: m.koreksiDelete },
    presensiHarian: { findFirst: m.presensiFind },
    auditTrail: { create: m.auditCreate },
    pengirimanUnit: { findUnique: m.pengirimanFind },
    $transaction: m.transaksi,
  },
}));

import { koreksiJamPresensiAction, hapusKoreksiJamAction } from "../actionsKoreksi";

const UNIT = "Biro Uji A";
const NIP_PEGAWAI = "000000000000000042"; // sensitive-ok
const ALASAN = "Foto bergeotag jam 07.15 dari pegawai"; // >= 15

function sesi(role: string, satuanKerja: string | null = UNIT, aktif = true) {
  m.ambilUserSesi.mockResolvedValue({ id: "u-1", nip: "000000000000000001", role, satuanKerja, aktif }); // sensitive-ok
}

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function form(ubah: Record<string, string | File | null> = {}) {
  const dasar: Record<string, string | File | null> = {
    nip: NIP_PEGAWAI,
    tanggal: "2026-08-05",
    jamMasuk: "07:15",
    jamKeluar: "",
    jamLembur: "",
    alasan: ALASAN,
    pernyataan: "1",
    buktiMasuk: new File([JPEG], "masuk.jpg", { type: "image/jpeg" }),
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries({ ...dasar, ...ubah })) {
    if (v !== null) fd.append(k, v);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.pegawaiFind.mockResolvedValue({ id: "p-1", nip: NIP_PEGAWAI, satuanKerja: UNIT });
  m.kendalaFind.mockResolvedValue(null);
  m.koreksiFindUnique.mockResolvedValue(null);
  m.presensiFind.mockResolvedValue({ jamMasuk: new Date(Date.UTC(2026, 7, 5, 8, 40)), jamKeluar: null, statusKehadiran: "HADIR" });
  m.pengirimanFind.mockResolvedValue(null);
  m.transaksi.mockResolvedValue([]);
  m.koreksiUpsert.mockReturnValue("upsert");
  m.auditCreate.mockReturnValue("audit");
  m.koreksiDelete.mockReturnValue("delete");
  sesi("KASUBAG_TU");
});

describe("koreksiJamPresensiAction - otorisasi", () => {
  it("tanpa sesi -> ditolak", async () => {
    m.ambilUserSesi.mockResolvedValue(null);
    expect((await koreksiJamPresensiAction({}, form())).error).toMatch(/sesi/i);
  });

  it.each(["PPABP", "ADMIN", "OSDMA", "PIMPINAN", "PEGAWAI"])("%s ditolak, tidak ada tulis apa pun", async (role) => {
    sesi(role, UNIT);
    const res = await koreksiJamPresensiAction({}, form());
    expect(res.error).toMatch(/Kasubag TU unit pegawai ini/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("Kasubag TU unit lain ditolak", async () => {
    sesi("KASUBAG_TU", "Biro Uji B");
    const res = await koreksiJamPresensiAction({}, form());
    expect(res.error).toMatch(/Kasubag TU unit pegawai ini/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
  });
});

describe("koreksiJamPresensiAction - pengaman", () => {
  it("rekap unit periode tanggal itu TERKIRIM -> ditolak, tanpa writeFile/transaksi", async () => {
    m.pengirimanFind.mockResolvedValue({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null });
    const res = await koreksiJamPresensiAction({}, form());
    expect(res.error).toMatch(/terkunci/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
    // periode diturunkan dari TANGGAL (Agustus 2026), bukan dari form
    expect(m.pengirimanFind.mock.calls[0][0].where.satuanKerja_periodeBulan_periodeTahun).toEqual({
      satuanKerja: UNIT,
      periodeBulan: 8,
      periodeTahun: 2026,
    });
  });

  it("rekap DIKEMBALIKAN (tidak terkunci) -> boleh", async () => {
    m.pengirimanFind.mockResolvedValue({ status: "DIKEMBALIKAN", dikirimPada: new Date(), alasanKembali: "x" });
    expect((await koreksiJamPresensiAction({}, form())).sukses).toBeDefined();
  });

  it("jam masuk diubah tanpa bukti -> ditolak", async () => {
    const res = await koreksiJamPresensiAction({}, form({ buktiMasuk: null }));
    expect(res.error).toMatch(/Unggah bukti absen masuk/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("tanpa centang pernyataan -> ditolak", async () => {
    const res = await koreksiJamPresensiAction({}, form({ pernyataan: null }));
    expect(res.error).toMatch(/pernyataan/i);
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("alasan 14 karakter -> ditolak", async () => {
    const res = await koreksiJamPresensiAction({}, form({ alasan: "a".repeat(14) }));
    expect(res.error).toMatch(/minimal 15 karakter/);
  });

  it("tipe berkas salah (txt) -> ditolak", async () => {
    const res = await koreksiJamPresensiAction({}, form({ buktiMasuk: new File(["halo"], "catatan.txt") }));
    expect(res.error).toMatch(/JPG, PNG, atau PDF/);
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("isi tidak cocok ekstensi (magic byte) -> ditolak", async () => {
    const res = await koreksiJamPresensiAction({}, form({ buktiMasuk: new File(["bukan gambar"], "palsu.png") }));
    expect(res.error).toMatch(/tidak sesuai formatnya/);
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("berkas lebih dari 2 MB -> ditolak", async () => {
    const besar = new Uint8Array(2 * 1024 * 1024 + 1);
    besar.set(JPEG);
    const res = await koreksiJamPresensiAction({}, form({ buktiMasuk: new File([besar], "besar.jpg") }));
    expect(res.error).toMatch(/2 MB/);
    expect(m.writeFile).not.toHaveBeenCalled();
  });

  it("jam pulang <= jam masuk -> ditolak", async () => {
    const res = await koreksiJamPresensiAction({}, form({ jamKeluar: "07:00" }));
    expect(res.error).toMatch(/lebih lambat/);
  });
});

describe("koreksiJamPresensiAction - sukses", () => {
  it("TANPA penanda kendala: sukses, buktiRef bukti-koreksi/..., audit lengkap", async () => {
    m.kendalaFind.mockResolvedValue(null);
    const res = await koreksiJamPresensiAction({}, form());
    expect(res.sukses).toMatch(/dikoreksi/);

    expect(m.mkdir).toHaveBeenCalledTimes(1);
    expect(m.writeFile).toHaveBeenCalledTimes(1);
    const tujuan = String(m.writeFile.mock.calls[0][0]);
    expect(tujuan.replace(/\\/g, "/")).toContain("bukti-koreksi/Biro Uji A/2026-08/2026-08-05_");
    expect(tujuan).not.toContain(NIP_PEGAWAI);

    const upsert = m.koreksiUpsert.mock.calls[0][0];
    expect(upsert.create.buktiRef).toMatch(/^bukti-koreksi\/Biro Uji A\/2026-08\/2026-08-05_masuk_\d+_[0-9a-f]{8}\.jpg$/);
    expect(upsert.update.buktiRef).toBe(upsert.create.buktiRef);
    expect(upsert.create.alasan).toBe(ALASAN);

    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.aksi).toBe("CREATE");
    expect(audit.dataSebelum.jamMasukEpresensi).toBe("08:40");
    expect(audit.dataSesudah.buktiRef).toBe(upsert.create.buktiRef);
    expect(audit.dataSesudah.pernyataanTanggungJawab).toBe(true);
    expect(audit.dataSesudah.jamMasuk).toBe("07:15");
    expect(audit.dataSesudah.dasarKendala).toBeNull();
    expect(m.transaksi).toHaveBeenCalledTimes(1);
  });

  it("PDF juga diterima", async () => {
    const res = await koreksiJamPresensiAction({}, form({ buktiMasuk: new File([PDF], "bukti.pdf") }));
    expect(res.sukses).toBeDefined();
    expect(m.koreksiUpsert.mock.calls[0][0].create.buktiRef).toMatch(/\.pdf$/);
  });

  it("hanya jam lembur: bukti opsional, tanpa berkas tidak menulis disk", async () => {
    const res = await koreksiJamPresensiAction({}, form({ jamMasuk: "", jamLembur: "2", buktiMasuk: null }));
    expect(res.sukses).toBeDefined();
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.koreksiUpsert.mock.calls[0][0].create.buktiRef).toBeNull();
  });

  it("koreksi lama punya bukti & jam tidak berubah: bukti lama dipakai tanpa unggah", async () => {
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      jamMasuk: new Date(Date.UTC(2026, 7, 5, 7, 15)),
      jamKeluar: null,
      jamLembur: null,
      alasan: "alasan lama yang cukup panjang",
      buktiRef: "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_1_aaaaaaaa.jpg",
      buktiRefKeluar: null,
      buktiRefLembur: null,
    });
    const res = await koreksiJamPresensiAction({}, form({ buktiMasuk: null }));
    expect(res.sukses).toBeDefined();
    expect(m.writeFile).not.toHaveBeenCalled();
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.aksi).toBe("UPDATE");
    expect(audit.dataSesudah.buktiRef).toBe("bukti-koreksi/Biro Uji A/2026-08/2026-08-05_1_aaaaaaaa.jpg");
  });

  it("form tanpa kolom jam lembur: koreksi lembur yang tersimpan DIPERTAHANKAN", async () => {
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      jamMasuk: null,
      jamKeluar: null,
      jamLembur: 3,
      alasan: "SPL lembur tiga jam tanggal ini",
      buktiRef: null,
      buktiRefKeluar: null,
      buktiRefLembur: null,
    });
    const res = await koreksiJamPresensiAction({}, form({ jamLembur: null }));
    expect(res.sukses).toBeDefined();
    const upsert = m.koreksiUpsert.mock.calls[0][0];
    expect(upsert.update.jamLembur).toBe(3);
    expect(m.auditCreate.mock.calls[0][0].data.dataSesudah.jamLembur).toBe(3);
  });

  it("bukti baru menggantikan lama: ref lama masuk dataSebelum, berkas lama tidak dihapus", async () => {
    const lama = "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_1_aaaaaaaa.jpg";
    m.koreksiFindUnique.mockResolvedValue({
      id: "k-1",
      jamMasuk: new Date(Date.UTC(2026, 7, 5, 7, 0)),
      jamKeluar: null,
      jamLembur: null,
      alasan: "alasan lama yang cukup panjang",
      buktiRef: lama,
      buktiRefKeluar: null,
      buktiRefLembur: null,
    });
    const res = await koreksiJamPresensiAction({}, form());
    expect(res.sukses).toBeDefined();
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.dataSebelum.koreksiSebelumnya.buktiRef).toBe(lama);
    expect(audit.dataSesudah.buktiRef).not.toBe(lama);
  });

  it("penanda kendala yang kebetulan ada hanya dicatat sebagai keterangan", async () => {
    m.kendalaFind.mockResolvedValue({ alasan: "Server e-Presensi down" });
    const res = await koreksiJamPresensiAction({}, form());
    expect(res.sukses).toBeDefined();
    expect(m.auditCreate.mock.calls[0][0].data.dataSesudah.dasarKendala).toEqual({
      tanggal: "2026-08-05",
      alasan: "Server e-Presensi down",
    });
  });
});

describe("koreksiJamPresensiAction - bukti terpisah masuk/pulang", () => {
  const REF_M = "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_masuk_1_aaaaaaaa.jpg";
  const REF_K = "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_keluar_1_bbbbbbbb.jpg";
  const REF_L = "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_lembur_1_cccccccc.jpg";
  const berkas = (nama: string) => new File([JPEG], nama, { type: "image/jpeg" });
  const lamaLengkap = (o: Record<string, unknown> = {}) => ({
    id: "k-1",
    jamMasuk: new Date(Date.UTC(2026, 7, 5, 7, 15)),
    jamKeluar: new Date(Date.UTC(2026, 7, 5, 16, 0)),
    jamLembur: 2,
    alasan: "alasan lama yang cukup panjang",
    buktiRef: REF_M,
    buktiRefKeluar: REF_K,
    buktiRefLembur: REF_L,
    ...o,
  });

  it("jam masuk saja: hanya buktiMasuk wajib; tanpa buktiKeluar sukses", async () => {
    const res = await koreksiJamPresensiAction({}, form({ jamMasuk: "07:15", jamKeluar: "" }));
    expect(res.sukses).toBeDefined();
    expect(m.writeFile).toHaveBeenCalledTimes(1);
    const create = m.koreksiUpsert.mock.calls[0][0].create;
    expect(create.buktiRef).toMatch(/_masuk_/);
    expect(create.buktiRefKeluar).toBeNull();
  });

  it("jam pulang saja: hanya buktiKeluar wajib; buktiMasuk tidak diminta", async () => {
    const res = await koreksiJamPresensiAction(
      {},
      form({ jamMasuk: "", jamKeluar: "16:00", buktiMasuk: null, buktiKeluar: berkas("pulang.jpg") })
    );
    expect(res.sukses).toBeDefined();
    const create = m.koreksiUpsert.mock.calls[0][0].create;
    expect(create.buktiRef).toBeNull();
    expect(create.buktiRefKeluar).toMatch(/_keluar_/);
  });

  it("jam pulang diubah tanpa buktiKeluar -> ditolak, tanpa menulis apa pun", async () => {
    const res = await koreksiJamPresensiAction({}, form({ jamMasuk: "", jamKeluar: "16:00", buktiMasuk: null }));
    expect(res.error).toMatch(/Unggah bukti absen pulang/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("keduanya diubah: butuh dua berkas; hanya satu -> ditolak", async () => {
    const hanyaMasuk = await koreksiJamPresensiAction({}, form({ jamKeluar: "16:00" }));
    expect(hanyaMasuk.error).toMatch(/Unggah bukti absen pulang/);
    expect(m.writeFile).not.toHaveBeenCalled();

    const dua = await koreksiJamPresensiAction({}, form({ jamKeluar: "16:00", buktiKeluar: berkas("pulang.jpg") }));
    expect(dua.sukses).toBeDefined();
    expect(m.writeFile).toHaveBeenCalledTimes(2);
    const create = m.koreksiUpsert.mock.calls[0][0].create;
    expect(create.buktiRef).toMatch(/_masuk_/);
    expect(create.buktiRefKeluar).toMatch(/_keluar_/);
    expect(create.buktiRef).not.toBe(create.buktiRefKeluar);
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.dataSesudah.buktiRef).toBe(create.buktiRef);
    expect(audit.dataSesudah.buktiRefKeluar).toBe(create.buktiRefKeluar);
    for (const [tujuan] of m.writeFile.mock.calls) expect(String(tujuan)).not.toContain(NIP_PEGAWAI);
  });

  it("sisi yang tidak berubah memakai bukti lama; sisi yang berubah wajib bukti baru", async () => {
    m.koreksiFindUnique.mockResolvedValue(lamaLengkap());
    const res = await koreksiJamPresensiAction(
      {},
      form({ jamMasuk: "07:15", jamKeluar: "16:30", buktiMasuk: null, buktiKeluar: berkas("pulang-baru.jpg") })
    );
    expect(res.sukses).toBeDefined();
    expect(m.writeFile).toHaveBeenCalledTimes(1);
    const upd = m.koreksiUpsert.mock.calls[0][0].update;
    expect(upd.buktiRef).toBe(REF_M);
    expect(upd.buktiRefKeluar).toMatch(/_keluar_/);
    expect(upd.buktiRefKeluar).not.toBe(REF_K);
  });

  it("jam pulang berubah tanpa buktiKeluar baru walau bukti lama ada -> ditolak", async () => {
    m.koreksiFindUnique.mockResolvedValue(lamaLengkap());
    const res = await koreksiJamPresensiAction({}, form({ jamMasuk: "07:15", jamKeluar: "16:30", buktiMasuk: null }));
    expect(res.error).toMatch(/Unggah bukti absen pulang/);
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("berkas salah di salah satu sisi -> TIDAK ada yang ditulis", async () => {
    const res = await koreksiJamPresensiAction(
      {},
      form({ jamKeluar: "16:00", buktiKeluar: new File(["bukan gambar"], "palsu.png") })
    );
    expect(res.error).toMatch(/pulang.*tidak sesuai formatnya/);
    expect(m.writeFile).not.toHaveBeenCalled();
    expect(m.mkdir).not.toHaveBeenCalled();
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("buktiRefLembur & jam lembur lama dipertahankan; audit memuat ketiga ref", async () => {
    m.koreksiFindUnique.mockResolvedValue(lamaLengkap());
    const res = await koreksiJamPresensiAction(
      {},
      form({ jamMasuk: "07:20", jamKeluar: "16:00", jamLembur: null, buktiKeluar: null })
    );
    expect(res.sukses).toBeDefined();
    const upd = m.koreksiUpsert.mock.calls[0][0].update;
    expect(upd.buktiRefLembur).toBe(REF_L);
    expect(upd.jamLembur).toBe(2);
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.dataSesudah.buktiRefLembur).toBe(REF_L);
    expect(audit.dataSesudah.buktiRefKeluar).toBe(REF_K);
    expect(audit.dataSebelum.koreksiSebelumnya.buktiRef).toBe(REF_M);
    expect(audit.dataSebelum.koreksiSebelumnya.buktiRefKeluar).toBe(REF_K);
    expect(audit.dataSebelum.koreksiSebelumnya.buktiRefLembur).toBe(REF_L);
  });
});

describe("hapusKoreksiJamAction", () => {
  const baris = {
    id: "k-1",
    pegawaiId: "p-1",
    tanggal: new Date(Date.UTC(2026, 7, 5)),
    jamMasuk: new Date(Date.UTC(2026, 7, 5, 7, 15)),
    jamKeluar: null,
    jamLembur: null,
    alasan: ALASAN,
    buktiRef: "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_1_aaaaaaaa.jpg",
    buktiRefKeluar: "bukti-koreksi/Biro Uji A/2026-08/2026-08-05_keluar_1_bbbbbbbb.jpg",
    buktiRefLembur: null,
    pegawai: { nip: NIP_PEGAWAI, satuanKerja: UNIT },
  };
  const fd = () => {
    const f = new FormData();
    f.append("id", "k-1");
    return f;
  };

  beforeEach(() => {
    m.koreksiFindUnique.mockResolvedValue(baris);
  });

  it("sukses oleh Kasubag TU unit; audit memuat buktiRef & jam e-Presensi", async () => {
    const res = await hapusKoreksiJamAction({}, fd());
    expect(res.sukses).toMatch(/dihapus/);
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit.aksi).toBe("DELETE");
    expect(audit.dataSebelum.buktiRef).toBe(baris.buktiRef);
    expect(audit.dataSebelum.buktiRefKeluar).toBe(baris.buktiRefKeluar);
    expect(audit.dataSebelum.jamMasukEpresensi).toBe("08:40");
  });

  it.each(["PPABP", "ADMIN"])("%s ditolak", async (role) => {
    sesi(role, UNIT);
    const res = await hapusKoreksiJamAction({}, fd());
    expect(res.error).toMatch(/Kasubag TU unit pegawai ini/);
    expect(m.transaksi).not.toHaveBeenCalled();
  });

  it("rekap terkirim -> ditolak (periode dari tanggal koreksi)", async () => {
    m.pengirimanFind.mockResolvedValue({ status: "TERKIRIM", dikirimPada: new Date(), alasanKembali: null });
    const res = await hapusKoreksiJamAction({}, fd());
    expect(res.error).toMatch(/terkunci/);
    expect(m.transaksi).not.toHaveBeenCalled();
    expect(m.pengirimanFind.mock.calls[0][0].where.satuanKerja_periodeBulan_periodeTahun.periodeBulan).toBe(8);
  });
});
