import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../actions", () => ({
  ubahAssignmentRoleAction: vi.fn(),
  putusSemuaSesiAction: vi.fn(),
}));

import { AssignmentRow, teksAturanBawaan } from "../AssignmentRow";
import type { BarisAkun } from "../aturanAssignment";

const baris = (o: Partial<BarisAkun> = {}): BarisAkun => ({
  id: "22222222-2222-4222-8222-222222222222",
  nip: "199000000000000002", // sensitive-ok
  nama: "Pegawai Uji",
  role: "ADMIN",
  rolesTambahan: ["PPABP"],
  satuanKerja: null,
  aktif: true,
  ...o,
});

const html = (u: BarisAkun) =>
  renderToStaticMarkup(<AssignmentRow user={u} satuanKerjaList={[]} satuanKerjaPegawai={null} idSaya={null} />);

describe("AssignmentRow - role bawaan login", () => {
  it("ADMIN + PPABP: Masuk sebagai PPABP", () => {
    expect(html(baris())).toContain("Masuk sebagai: PPABP");
  });

  it("ADMIN saja: Masuk sebagai Admin", () => {
    expect(html(baris({ rolesTambahan: [] }))).toContain("Masuk sebagai: Admin");
  });

  it("kalimat lama tidak muncul; aturan baru diturunkan dari urutan bawaan", () => {
    const h = html(baris());
    expect(h).not.toContain("Role utama tetap jadi bawaan saat login");
    expect(h).toContain(teksAturanBawaan());
    expect(teksAturanBawaan()).toContain("Pimpinan, Kasubag TU, PPABP, OSDMA, Pegawai");
  });

  it("label Role utama tetap ada, dan tombol Putus semua sesi tersedia", () => {
    const h = html(baris());
    expect(h).toContain("Role utama");
    expect(h).toContain("Putus semua sesi");
  });
});

describe("AssignmentRow - role PEGAWAI wajib", () => {
  const dengan = (punya: boolean) =>
    renderToStaticMarkup(
      <AssignmentRow user={baris()} satuanKerjaList={[]} satuanKerjaPegawai={null} punyaDataPegawai={punya} idSaya={null} />
    );

  it("akun dengan data pegawai: PEGAWAI terkunci dengan keterangan, tanpa input rolesTambahan PEGAWAI", () => {
    const h = dengan(true);
    expect(h).toContain("wajib untuk pegawai");
    expect(h).not.toContain('name="rolesTambahan" value="PEGAWAI"');
  });

  it("tanpa data pegawai: PEGAWAI pilihan biasa", () => {
    const h = dengan(false);
    expect(h).not.toContain("wajib untuk pegawai");
    expect(h).toContain('value="PEGAWAI"');
  });
});
