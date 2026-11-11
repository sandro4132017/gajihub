import { describe, expect, it, vi } from "vitest";
import {
  jalankanRapikanRoleUtama,
  pilihAkunPerluDirapikan,
  rapikanSatuAkun,
  type AkunRoleUtama,
  type DbJobRoleUtama,
} from "../rapikanRoleUtamaLogic";

const akun = (o: Partial<AkunRoleUtama>): AkunRoleUtama => ({
  id: "u1",
  nip: "199001012020121001", // sensitive-ok
  role: "PEGAWAI",
  rolesTambahan: [],
  satuanKerja: "Biro Uji",
  ...o,
});

describe("rapikanSatuAkun", () => {
  it("Pegawai + Kasubag TU -> utama Kasubag TU, Pegawai pindah ke tambahan", () => {
    const p = rapikanSatuAkun(akun({ rolesTambahan: ["KASUBAG_TU"] }), true);
    expect(p).toMatchObject({ roleBaru: "KASUBAG_TU", rolesTambahanBaru: ["PEGAWAI"] });
  });
  it("tabel user: Kasubag TU + PPABP -> Kasubag TU; Pimpinan + Kasubag TU + PPABP -> Pimpinan", () => {
    expect(rapikanSatuAkun(akun({ role: "PPABP", rolesTambahan: ["KASUBAG_TU", "PEGAWAI"] }), true)).toMatchObject({
      roleBaru: "KASUBAG_TU",
      rolesTambahanBaru: ["PPABP", "PEGAWAI"],
    });
    expect(
      rapikanSatuAkun(akun({ role: "PEGAWAI", rolesTambahan: ["KASUBAG_TU", "PPABP", "PIMPINAN"] }), true)
    ).toMatchObject({ roleBaru: "PIMPINAN", rolesTambahanBaru: ["PEGAWAI", "KASUBAG_TU", "PPABP"] });
  });
  it("sudah benar -> null (idempoten)", () => {
    expect(rapikanSatuAkun(akun({ role: "KASUBAG_TU", rolesTambahan: ["PPABP", "PEGAWAI"] }), true)).toBeNull();
    expect(rapikanSatuAkun(akun({}), true)).toBeNull();
  });
  it("Admin tidak jadi utama selama ada role lain; Admin tetap dimiliki", () => {
    const p = rapikanSatuAkun(akun({ role: "ADMIN", rolesTambahan: ["PPABP", "PEGAWAI"] }), true);
    expect(p).toMatchObject({ roleBaru: "PPABP", rolesTambahanBaru: ["ADMIN", "PEGAWAI"] });
    expect(rapikanSatuAkun(akun({ role: "ADMIN", rolesTambahan: [] }), false)).toBeNull();
  });
  it("tidak ada role yang hilang", () => {
    const awal = akun({ role: "OSDMA", rolesTambahan: ["PIMPINAN", "PPABP", "PEGAWAI"] });
    const p = rapikanSatuAkun(awal, true)!;
    expect(new Set([p.roleBaru, ...p.rolesTambahanBaru])).toEqual(new Set([awal.role, ...awal.rolesTambahan]));
  });
  it("akun tanpa data Pegawai: PEGAWAI tidak ditambahkan paksa", () => {
    const p = rapikanSatuAkun(akun({ role: "ADMIN", rolesTambahan: ["OSDMA"] }), false);
    expect(p).toMatchObject({ roleBaru: "OSDMA", rolesTambahanBaru: ["ADMIN"] });
  });
  it("idempoten: hasil jalan pertama tidak dipilih lagi", () => {
    const daftar = [
      akun({ id: "a", rolesTambahan: ["KASUBAG_TU", "PPABP"] }),
      akun({ id: "b", role: "ADMIN", rolesTambahan: ["PIMPINAN", "PEGAWAI"] }),
    ];
    const nip = new Set(daftar.map((d) => d.nip));
    const pertama = pilihAkunPerluDirapikan(daftar, nip);
    const sesudah = daftar.map((d) => {
      const p = pertama.find((x) => x.id === d.id);
      return p ? { ...d, role: p.roleBaru, rolesTambahan: p.rolesTambahanBaru } : d;
    });
    expect(pilihAkunPerluDirapikan(sesudah, nip)).toEqual([]);
  });
  it("Kasubag TU tanpa satuan kerja ditandai", () => {
    expect(rapikanSatuAkun(akun({ rolesTambahan: ["KASUBAG_TU"], satuanKerja: null }), true)?.kasubagTanpaUnit).toBe(true);
  });
});

function dbPalsu(daftar: AkunRoleUtama[]) {
  return {
    user: { findMany: vi.fn().mockResolvedValue(daftar), update: vi.fn((a) => ({ op: "update", a })) },
    pegawai: { findMany: vi.fn().mockResolvedValue(daftar.map((d) => ({ nip: d.nip }))) },
    auditTrail: { create: vi.fn((a) => ({ op: "audit", a })) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
}

describe("jalankanRapikanRoleUtama", () => {
  const daftar = [
    akun({ id: "a", rolesTambahan: ["KASUBAG_TU"] }),
    akun({ id: "b", role: "KASUBAG_TU", rolesTambahan: ["PEGAWAI"] }),
  ];

  it("uji kering tidak menulis apa pun dan log tanpa NIP", async () => {
    const db = dbPalsu(daftar);
    const baris: string[] = [];
    const hasil = await jalankanRapikanRoleUtama(db as unknown as DbJobRoleUtama, false, (s) => baris.push(s));
    expect(hasil).toMatchObject({ perluDirapikan: 1, ditulis: 0, perPerpindahan: { "PEGAWAI -> KASUBAG_TU": 1 } });
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(baris.join("\n")).not.toContain("199001012020121001"); // sensitive-ok
  });

  it("--terapkan menulis role + audit per akun", async () => {
    const db = dbPalsu(daftar);
    const hasil = await jalankanRapikanRoleUtama(db as unknown as DbJobRoleUtama, true, () => {});
    expect(hasil.ditulis).toBe(1);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "a" },
      data: { role: "KASUBAG_TU", rolesTambahan: ["PEGAWAI"] },
    });
    const audit = db.auditTrail.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ entitasId: "a", aktor: "SYSTEM", dataSebelum: { role: "PEGAWAI" } });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
