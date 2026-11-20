import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ModalPassphraseTte } from "../ModalPassphraseTte";

// Render statis (tanpa jsdom): yang teruji adalah keadaan awal tiap mode.
// Pengosongan saat tutup/buka ulang/sukses ada di handler dan efek komponen.

const NOP = () => {};
const kirim = async () => ({});

function render(lembur: boolean) {
  return renderToStaticMarkup(
    <ModalPassphraseTte
      terbuka
      onTutup={NOP}
      periodeBulan={11}
      periodeTahun={2026}
      satuanKerja="Biro Uji Coba"
      defaultNik=""
      namaPenandatanganDefault="Kepala Uji"
      {...(lembur
        ? { kirimTandaTangan: kirim, labelDokumen: "Surat Tugas Lembur", ringkasan: "1 anggota, 2 jam" }
        : {})}
    />,
  );
}

describe("ModalPassphraseTte - mode lembur", () => {
  const h = render(true);

  it("tidak menampilkan unsur SPTJM dan akun uji coba", () => {
    expect(h).not.toContain("Gunakan Akun Demo");
    expect(h).not.toContain("Akun uji coba");
    expect(h).not.toContain("Pakai NIK Demo");
    expect(h).not.toContain("Nomor Dokumen SPTJM");
    expect(h).not.toContain("Pratinjau Draft");
  });

  it("NIK dan passphrase awal kosong", () => {
    expect(h).toMatch(/id="tte-nik"[^>]*value=""/);
    expect(h).toMatch(/id="tte-passphrase"[^>]*value=""/);
    expect(h).toContain("Surat Tugas Lembur");
    expect(h).toContain("1 anggota, 2 jam");
  });
});

describe("ModalPassphraseTte - mode SPTJM (tanpa prop)", () => {
  const h = renderToStaticMarkup(
    <ModalPassphraseTte terbuka onTutup={NOP} periodeBulan={11} periodeTahun={2026} />,
  );

  it("tetap menampilkan akun demo, penyunting nomor, dan pratinjau draft", () => {
    expect(h).toContain("Gunakan Akun Demo");
    expect(h).toContain("Akun uji coba");
    expect(h).toContain("Nomor Dokumen SPTJM");
    expect(h).toContain("Pratinjau Draft");
  });

  it("NIK demo terisi seperti dulu", () => {
    expect(h).toMatch(/id="tte-nik"[^>]*value="[0-9]{16}"/);
  });
});
