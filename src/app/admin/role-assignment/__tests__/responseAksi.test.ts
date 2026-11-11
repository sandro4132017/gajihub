import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Temuan pentest F-02 (OWASP API3:2023): response aksi di Kelola Assignment
 * Role hanya boleh memuat akun yang diubah, bukan daftar seluruh akun.
 * Penyebab kebocorannya revalidatePath - halaman ikut dirender ulang di
 * response POST - jadi test ini mengunci keduanya.
 */
const m = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getSession: vi.fn(),
  ambilUser: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  userCreate: vi.fn(),
  pegawaiFindUnique: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("../../../../auth/getSessionAccount", () => ({
  getSessionAccount: m.getSession,
  ambilUserSesi: m.ambilUser,
}));
vi.mock("../../../../lib/prisma", () => ({
  prisma: {
    user: { findUnique: m.userFindUnique, update: m.userUpdate, create: m.userCreate },
    pegawai: { findUnique: m.pegawaiFindUnique },
    auditTrail: { create: m.auditCreate },
    $transaction: m.transaction,
  },
}));

import { buatAkunBaruAction, putusSemuaSesiAction, ubahAssignmentRoleAction } from "../actions";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const PEGAWAI_ID = "33333333-3333-4333-8333-333333333333";

const barisBaru = {
  id: TARGET_ID,
  nip: "199000000000000002", // sensitive-ok
  nama: "Pegawai Uji",
  role: "PPABP",
  rolesTambahan: [],
  satuanKerja: null,
  aktif: true,
};

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.getSession.mockResolvedValue({ id: "a" });
  m.ambilUser.mockResolvedValue({
    id: ADMIN_ID,
    nip: "199000000000000001", // sensitive-ok
    nama: "Admin Uji",
    role: "ADMIN",
    satuanKerja: null,
    aktif: true,
  });
});

describe("ubahAssignmentRoleAction - response hanya satu akun (F-02)", () => {
  it("mengembalikan baris akun yang diubah saja dan tidak merender ulang halaman", async () => {
    m.userFindUnique.mockResolvedValue({ ...barisBaru, role: "PEGAWAI" });
    m.userUpdate.mockReturnValue("update");
    m.auditCreate.mockReturnValue("audit");
    m.transaction.mockResolvedValue([barisBaru, { id: "log" }]);

    const f = new FormData();
    f.set("targetUserId", TARGET_ID);
    f.set("role", "PPABP");
    f.set("aktif", "on");
    const hasil = await ubahAssignmentRoleAction({}, f);

    expect(hasil.error).toBeUndefined();
    expect(hasil.baris).toEqual(barisBaru);
    expect(Object.keys(hasil).sort()).toEqual(["baris", "success"]);
    expect(m.revalidatePath).not.toHaveBeenCalled();
    // Kolom yang dibaca dari database dibatasi ke 7 kolom tampilan.
    expect(Object.keys(m.userUpdate.mock.calls[0][0].select).sort()).toEqual(
      ["aktif", "id", "nama", "nip", "role", "rolesTambahan", "satuanKerja"]
    );
  });
});

describe("buatAkunBaruAction - response tanpa daftar akun (F-02)", () => {
  it("hanya pesan sukses, tanpa merender ulang halaman", async () => {
    m.pegawaiFindUnique.mockResolvedValue({
      id: PEGAWAI_ID,
      nip: "199000000000000003", // sensitive-ok
      nama: "Pegawai Baru",
      satuanKerja: null,
    });
    m.userFindUnique.mockResolvedValue(null);
    m.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
      fn({
        user: { create: async () => ({ id: "u", nip: "199000000000000003", nama: "Pegawai Baru" }) }, // sensitive-ok
        auditTrail: { create: async () => ({}) },
      })
    );

    const f = new FormData();
    f.set("pegawaiId", PEGAWAI_ID);
    f.set("role", "PPABP");
    const hasil = await buatAkunBaruAction({}, f);

    expect(hasil.error).toBeUndefined();
    expect(Object.keys(hasil)).toEqual(["success"]);
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("putusSemuaSesiAction", () => {
  it("non-admin ditolak: tidak ada tulisan ke database", async () => {
    m.ambilUser.mockResolvedValue({ id: ADMIN_ID, nip: "199000000000000001", nama: "X", role: "PEGAWAI", satuanKerja: null, aktif: true }); // sensitive-ok
    const hasil = await putusSemuaSesiAction(TARGET_ID);
    expect(hasil.error).toBeTruthy();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("id tidak valid ditolak", async () => {
    const hasil = await putusSemuaSesiAction("bukan-uuid");
    expect(hasil.error).toBeTruthy();
    expect(m.transaction).not.toHaveBeenCalled();
  });

  it("admin: sesiVersi naik 1 + audit dalam satu transaksi; respons hanya pesan target; tanpa revalidatePath", async () => {
    m.userFindUnique.mockResolvedValue({ ...barisBaru, sesiVersi: 3 });
    m.userUpdate.mockReturnValue("update");
    m.auditCreate.mockReturnValue("audit");
    m.transaction.mockResolvedValue([{ id: TARGET_ID }, { id: "log" }]);

    const hasil = await putusSemuaSesiAction(TARGET_ID);

    expect(hasil.error).toBeUndefined();
    expect(Object.keys(hasil)).toEqual(["success"]);
    expect(hasil.success).toContain("Pegawai Uji");
    expect(m.userUpdate.mock.calls[0][0]).toMatchObject({
      where: { id: TARGET_ID },
      data: { sesiVersi: { increment: 1 } },
    });
    const audit = m.auditCreate.mock.calls[0][0].data;
    expect(audit).toMatchObject({ entitas: "app_user", entitasId: TARGET_ID, aksi: "UPDATE" });
    expect(audit.dataSesudah.sesiVersi).toBe(4);
    expect(m.transaction).toHaveBeenCalledTimes(1);
    expect(m.revalidatePath).not.toHaveBeenCalled();
  });

  it("target diri sendiri: pesan menyebut ikut keluar", async () => {
    m.userFindUnique.mockResolvedValue({ ...barisBaru, id: ADMIN_ID, sesiVersi: 0 });
    m.userUpdate.mockReturnValue("update");
    m.auditCreate.mockReturnValue("audit");
    m.transaction.mockResolvedValue([]);
    const hasil = await putusSemuaSesiAction(ADMIN_ID);
    expect(hasil.success).toContain("termasuk yang ini");
  });
});

describe("ubahAssignmentRoleAction - menonaktifkan akun memutus sesinya", () => {
  const kirim = async (aktifSebelum: boolean, aktifBaru: boolean) => {
    m.userFindUnique.mockResolvedValue({ ...barisBaru, role: "PEGAWAI", aktif: aktifSebelum });
    m.userUpdate.mockReturnValue("update");
    m.auditCreate.mockReturnValue("audit");
    m.transaction.mockResolvedValue([barisBaru, { id: "log" }]);
    const f = new FormData();
    f.set("targetUserId", TARGET_ID);
    f.set("role", "PEGAWAI");
    if (aktifBaru) f.set("aktif", "on");
    await ubahAssignmentRoleAction({}, f);
    return m.userUpdate.mock.calls[0][0].data;
  };

  it("aktif -> nonaktif: sesiVersi dinaikkan", async () => {
    expect((await kirim(true, false)).sesiVersi).toEqual({ increment: 1 });
  });
  it("tetap aktif atau diaktifkan lagi: sesiVersi tidak disentuh", async () => {
    expect((await kirim(true, true)).sesiVersi).toBeUndefined();
    m.userUpdate.mockReset();
    expect((await kirim(false, true)).sesiVersi).toBeUndefined();
  });
});
