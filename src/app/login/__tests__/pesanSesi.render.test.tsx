import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PesanSesi } from "../PesanSesi";

const html = (kode?: string) => renderToStaticMarkup(<PesanSesi kode={kode} />);

describe("PesanSesi", () => {
  it.each([
    ["menganggur", "Sesi berakhir karena tidak ada aktivitas selama 30 menit. Silakan masuk lagi."],
    ["kedaluwarsa", "Sesi sudah 8 jam. Silakan masuk lagi."],
    ["dicabut", "Kamu sudah keluar, atau sesi diputus Admin. Silakan masuk lagi."],
    ["nonaktif", "Akun ini dinonaktifkan. Hubungi Admin."],
    ["format-lama", "Aplikasi diperbarui, silakan masuk lagi."],
  ])("%s menampilkan kalimatnya", (kode, kalimat) => {
    expect(html(kode)).toContain(kalimat);
  });

  it("nada info netral, bukan merah", () => {
    const h = html("menganggur");
    expect(h).not.toMatch(/red|text-danger/);
    expect(h).toContain('role="status"');
  });

  it("alasan tak dikenal atau kosong tidak menampilkan apa pun", () => {
    expect(html("sembarang")).toBe("");
    expect(html("<script>")).toBe("");
    expect(html("constructor")).toBe("");
    expect(html(undefined)).toBe("");
  });
});
