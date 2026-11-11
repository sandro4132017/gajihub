import { describe, expect, it, vi } from "vitest";
import {
  UKURAN_BATCH,
  hitungPerRole,
  jalankanLengkapiRolePegawai,
  pilihAkunPerluDilengkapi,
  type AkunRole,
  type DbJob,
} from "../lengkapiRolePegawaiLogic";

const nip = (n: number) => `99000000000000${String(n).padStart(4, "0")}`; // sensitive-ok
const akun = (n: number, role: AkunRole["role"], rolesTambahan: AkunRole["rolesTambahan"] = []): AkunRole => ({
  id: `id-${n}`,
  nip: nip(n),
  role,
  rolesTambahan,
});

describe("pilihAkunPerluDilengkapi", () => {
  const semua = [
    akun(1, "PPABP"),
    akun(2, "KASUBAG_TU", ["OSDMA"]),
    akun(3, "PPABP", ["PEGAWAI"]), // sudah lengkap
    akun(4, "PEGAWAI"), // utama PEGAWAI
    akun(5, "ADMIN"), // tanpa data Pegawai
  ];
  const nipPegawai = new Set([nip(1), nip(2), nip(3), nip(4)]);

  it("hanya akun dengan data Pegawai dan tanpa role PEGAWAI", () => {
    const hasil = pilihAkunPerluDilengkapi(semua, nipPegawai);
    expect(hasil.map((h) => h.id)).toEqual(["id-1", "id-2"]);
    expect(hasil[1].rolesTambahanBaru).toEqual(["OSDMA", "PEGAWAI"]);
  });
  it("jumlah per role utama", () => {
    expect(hitungPerRole(pilihAkunPerluDilengkapi(semua, nipPegawai))).toEqual({ PPABP: 1, KASUBAG_TU: 1 });
  });
});

function dbPalsu(akunList: AkunRole[], nipPegawai: string[]) {
  const update = vi.fn((a: unknown) => ({ op: "update", a }));
  const create = vi.fn((a: unknown) => ({ op: "audit", a }));
  const transaction = vi.fn(async () => []);
  const db: DbJob = {
    user: { findMany: vi.fn(async () => akunList), update },
    pegawai: { findMany: vi.fn(async () => nipPegawai.map((n) => ({ nip: n }))) },
    auditTrail: { create },
    $transaction: transaction,
  };
  return { db, update, create, transaction };
}

describe("jalankanLengkapiRolePegawai", () => {
  it("uji kering (bawaan): tidak menulis apa pun", async () => {
    const { db, update, create, transaction } = dbPalsu([akun(1, "PPABP"), akun(2, "OSDMA")], [nip(1), nip(2)]);
    const log = vi.fn();
    const hasil = await jalankanLengkapiRolePegawai(db, false, log);
    expect(hasil).toMatchObject({ perluDilengkapi: 2, ditulis: 0 });
    expect(update).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    // Log tidak memuat NIP.
    expect(log.mock.calls.flat().join("\n")).not.toContain(nip(1));
  });

  it("--terapkan: update + satu audit per akun dalam transaksi", async () => {
    const { db, update, create, transaction } = dbPalsu([akun(1, "PPABP"), akun(3, "ADMIN")], [nip(1)]);
    const hasil = await jalankanLengkapiRolePegawai(db, true, vi.fn());
    expect(hasil.ditulis).toBe(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({ where: { id: "id-1" }, data: { rolesTambahan: ["PEGAWAI"] } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    const audit = (create.mock.calls[0][0] as { data: Record<string, unknown> }).data;
    expect(audit).toMatchObject({ entitas: "app_user", entitasId: "id-1", aksi: "UPDATE", aktor: "SYSTEM" });
  });

  it("batch: transaksi dipecah per UKURAN_BATCH akun", async () => {
    const banyak = Array.from({ length: UKURAN_BATCH + 1 }, (_, i) => akun(i, "PPABP"));
    const { db, transaction } = dbPalsu(banyak, banyak.map((a) => a.nip));
    await jalankanLengkapiRolePegawai(db, true, vi.fn());
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it("idempoten: tidak ada yang perlu dilengkapi -> tidak menulis", async () => {
    const { db, transaction } = dbPalsu([akun(1, "PPABP", ["PEGAWAI"])], [nip(1)]);
    const hasil = await jalankanLengkapiRolePegawai(db, true, vi.fn());
    expect(hasil.perluDilengkapi).toBe(0);
    expect(transaction).not.toHaveBeenCalled();
  });
});
