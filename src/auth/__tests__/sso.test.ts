import { describe, it, expect } from "vitest";
import { berbentukNip, cariNipDariInfo, ringkasFieldInfo, urlOtorisasi, type KonfigurasiSso } from "../sso";

const CFG: KonfigurasiSso = {
  baseUrl: "https://account.kemnaker.go.id",
  clientId: "client-uji",
  clientSecret: "rahasia-uji",
  redirectUri: "http://gajihub.rokeubmn.id/login/sso/callback",
  scope: "basic email",
  fieldNip: null,
};

describe("urlOtorisasi", () => {
  it("menyusun seluruh parameter yang diminta dokumentasi Naco", () => {
    const url = new URL(urlOtorisasi(CFG, "state-abc"));
    expect(url.origin + url.pathname).toBe("https://account.kemnaker.go.id/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("client-uji");
    expect(url.searchParams.get("redirect_uri")).toBe(CFG.redirectUri);
    expect(url.searchParams.get("scope")).toBe("basic email");
  });

  it("SELALU menyertakan state - itu yang menahan CSRF login", () => {
    // Dokumentasi Naco tidak menyebut `state`, jadi gampang dianggap opsional.
    // Tanpa itu, alamat callback bisa dipanggil siapa saja dengan kode milik
    // orang lain. Test ini yang menahan supaya tidak dihapus "karena tidak
    // ada di dokumentasi".
    expect(new URL(urlOtorisasi(CFG, "state-abc")).searchParams.get("state")).toBe("state-abc");
  });

  it("client secret TIDAK PERNAH ikut di URL - itu cuma untuk POST server-ke-server", () => {
    expect(urlOtorisasi(CFG, "s")).not.toContain("rahasia-uji");
  });
});

describe("berbentukNip", () => {
  it("menerima NIP 18 digit, sebagai teks maupun angka", () => {
    expect(berbentukNip("197303072005011001")).toBe(true);
    expect(berbentukNip(197303072005011001)).toBe(true);
  });

  it("menolak NIK 16 digit - panjangnya yang membedakan", () => {
    expect(berbentukNip("3175012345678901")).toBe(false);
  });

  it("menolak nomor telepon, NIP lama 9 digit, dan yang bukan angka", () => {
    expect(berbentukNip("081234567890")).toBe(false);
    expect(berbentukNip("197303072")).toBe(false);
    expect(berbentukNip("1973030720050110AB")).toBe(false);
    expect(berbentukNip(null)).toBe(false);
    expect(berbentukNip(undefined)).toBe(false);
  });
});

describe("cariNipDariInfo", () => {
  it("menemukan NIP walau bersarang dalam", () => {
    const info = { data: { user: { name: "Irwan", nip: "197303072005011001" } } };
    expect(cariNipDariInfo(info, null)).toBe("197303072005011001");
  });

  it("menemukan NIP apa pun nama fieldnya", () => {
    // Bentuk balasan /users/me BELUM terdokumentasi, jadi penelusurannya
    // sengaja tidak bergantung nama field.
    const info = { data: { employee_number: "197303072005011001" } };
    expect(cariNipDariInfo(info, null)).toBe("197303072005011001");
  });

  it("tidak tertukar dengan NIK 16 digit yang ada di balasan yang sama", () => {
    const info = { data: { nik: "3175012345678901", nomor_induk: "197303072005011001" } };
    expect(cariNipDariInfo(info, null)).toBe("197303072005011001");
  });

  it("mengembalikan null kalau tidak ada yang berbentuk NIP - JANGAN menebak", () => {
    // Skenario paling penting: scope "basic email" ternyata tidak memuat NIP.
    // Yang benar berhenti, bukan memakai email/id sebagai pengganti - salah
    // orang berarti salah data gaji.
    const info = { data: { id: 42, email: "irwan@kemnaker.go.id", name: "Irwan" } };
    expect(cariNipDariInfo(info, null)).toBeNull();
  });

  it("field eksplisit menang atas penelusuran", () => {
    const info = { data: { salah: "111111111111111111", benar: "197303072005011001" } };
    expect(cariNipDariInfo(info, "data.benar")).toBe("197303072005011001");
  });

  it("field eksplisit yang isinya bukan NIP menghasilkan null, bukan jatuh ke penelusuran", () => {
    // Kalau jatuh balik ke penelusuran, salah konfigurasi tidak akan pernah
    // ketahuan - dia "jalan" dengan nilai dari field lain.
    const info = { data: { email: "a@b.c", nip: "197303072005011001" } };
    expect(cariNipDariInfo(info, "data.email")).toBeNull();
  });

  it("tahan terhadap balasan kosong / bukan objek", () => {
    expect(cariNipDariInfo(null, null)).toBeNull();
    expect(cariNipDariInfo("teks", null)).toBeNull();
    expect(cariNipDariInfo({}, null)).toBeNull();
  });
});

describe("ringkasFieldInfo", () => {
  it("mendaftar jalur field, termasuk yang bersarang", () => {
    const r = ringkasFieldInfo({ data: { user: { name: "A", nip: "197303072005011001" } } });
    expect(r.map((x) => x.jalur)).toEqual(["data.user.name", "data.user.nip"]);
  });

  it("menandai field mana yang berbentuk NIP", () => {
    const r = ringkasFieldInfo({ email: "a@b.c", nip: "197303072005011001" });
    expect(r.find((x) => x.jalur === "nip")?.berbentukNip).toBe(true);
    expect(r.find((x) => x.jalur === "email")?.berbentukNip).toBe(false);
  });

  it("TIDAK memuat nilai fieldnya - balasan identitas bisa berisi data pribadi", () => {
    // Ringkasan ini tampil di halaman galat. Yang dibutuhkan untuk
    // membetulkan konfigurasi cuma NAMA field-nya, bukan isinya.
    const r = ringkasFieldInfo({ email: "irwan@kemnaker.go.id", phone: "081234567890" });
    expect(JSON.stringify(r)).not.toContain("irwan@kemnaker.go.id");
    expect(JSON.stringify(r)).not.toContain("081234567890");
  });
});
