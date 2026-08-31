import { describe, it, expect, afterEach } from "vitest";
import {
  asalPublik,
  berbentukNip,
  cariNipDariInfo,
  nipRusakKarenaAngka,
  normalkanNip,
  ringkasFieldInfo,
  urlOtorisasi,
  type KonfigurasiSso,
} from "../sso";

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
  it("menerima NIP 18 digit sebagai teks", () => {
    expect(berbentukNip("197303072005011001")).toBe(true);
  });

  // Test ini DIBALIK (dulu mengunci `berbentukNip(197303072005011001) === true`),
  // bukan dihapus - supaya kalau ada yang "melonggarkan" lagi supaya angka
  // ikut diterima, test inilah yang jatuh duluan dan menjelaskan sebabnya.
  //
  // Literal di baris di bawah membuktikan sendiri kenapa: 18 digit melebihi
  // presisi float64, jadi angka yang ditulis `...001` sudah menjadi `...000`
  // sebelum satu baris kode pun berjalan.
  it("MENOLAK NIP bertipe angka - nilainya sudah rusak sebelum sampai ke sini", () => {
    expect(String(197303072005011001)).toBe("197303072005011000");
    expect(berbentukNip(197303072005011001)).toBe(false);
    expect(nipRusakKarenaAngka(197303072005011001)).toBe(true);
    // Dan lewat jalur yang sebenarnya - JSON.parse dari balasan Naco.
    const dariNaco = JSON.parse('{"nip": 197303072005011001}');
    expect(cariNipDariInfo(dariNaco, null)).toBeNull();
  });

  it("menerima NIP berpemisah spasi/titik/strip - bentuk tulisan manusia", () => {
    expect(berbentukNip("19730307 200501 1 001")).toBe(true);
    expect(normalkanNip("19730307 200501 1 001")).toBe("197303072005011001");
    expect(normalkanNip("19730307.200501.1.001")).toBe("197303072005011001");
    expect(normalkanNip("19730307-200501-1-001")).toBe("197303072005011001");
    expect(normalkanNip("  197303072005011001  ")).toBe("197303072005011001");
  });

  // Yang menahan pembersihan pemisah supaya tidak berubah jadi tebakan:
  // membuang SEMUA non-digit bisa menyambung dua angka tak berhubungan.
  it("TIDAK membuang sembarang non-digit - hanya spasi, titik, strip", () => {
    expect(normalkanNip("08123456789 / 2024001")).toBeNull();
    expect(normalkanNip("197303072005011001@kemnaker.go.id")).toBeNull();
    expect(normalkanNip("197303072005011001, 3175012345678901")).toBeNull();
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

describe("asalPublik", () => {
  const simpan = process.env.NACO_REDIRECT_URI;
  afterEach(() => {
    if (simpan === undefined) delete process.env.NACO_REDIRECT_URI;
    else process.env.NACO_REDIRECT_URI = simpan;
  });

  it("memakai asal NACO_REDIRECT_URI - alamat publik yang paling sahih", () => {
    process.env.NACO_REDIRECT_URI = "https://gajihub.kemnaker.go.id/login/sso/callback";
    expect(asalPublik(new Headers(), "http://localhost:3002/login/sso")).toBe("https://gajihub.kemnaker.go.id");
  });

  it("TIDAK PERNAH memakai alamat internal kalau proxy mengirim X-Forwarded-*", () => {
    // Inti bugnya: di belakang proxy, req.url berisi http://localhost:3002 -
    // Location ke situ tidak bisa dijangkau browser siapa pun.
    delete process.env.NACO_REDIRECT_URI;
    const h = new Headers({ "x-forwarded-proto": "https", "x-forwarded-host": "gajihub.kemnaker.go.id" });
    expect(asalPublik(h, "http://localhost:3002/login/sso/callback")).toBe("https://gajihub.kemnaker.go.id");
  });

  it("mengambil proto pertama kalau X-Forwarded-Proto berantai", () => {
    delete process.env.NACO_REDIRECT_URI;
    const h = new Headers({ "x-forwarded-proto": "https, http", host: "contoh.go.id" });
    expect(asalPublik(h, "http://localhost:3002/x")).toBe("https://contoh.go.id");
  });

  it("jatuh ke asal permintaan kalau tidak ada petunjuk apa pun", () => {
    delete process.env.NACO_REDIRECT_URI;
    expect(asalPublik(new Headers(), "http://localhost:3000/login/sso")).toBe("http://localhost:3000");
  });

  it("NACO_REDIRECT_URI kosong TIDAK melempar - itu yang dulu membalas 500", () => {
    // `??` tidak menangkap string kosong, dan new URL(path, "") melempar.
    process.env.NACO_REDIRECT_URI = "";
    const h = new Headers({ host: "gajihub.kemnaker.go.id", "x-forwarded-proto": "https" });
    expect(asalPublik(h, "http://localhost:3002/login/sso")).toBe("https://gajihub.kemnaker.go.id");
  });

  it("NACO_REDIRECT_URI yang bukan URL sah juga tidak melempar", () => {
    process.env.NACO_REDIRECT_URI = "bukan-url";
    expect(asalPublik(new Headers(), "http://localhost:3000/x")).toBe("http://localhost:3000");
  });
});

describe("ringkasFieldInfo - bentuk field", () => {
  it("melaporkan panjang dan jumlah digit, tanpa nilainya", () => {
    // Inti gunanya: membedakan "NIP tidak dikirim" dari "NIP dikirim tapi
    // berformat lain". 21 karakter dengan 18 digit = NIP berspasi.
    //
    // Assertion `berbentukNip` DIBALIK dari false jadi true: dulu bentuk
    // berspasi memang tidak dikenali - dan komentar di atas ini justru sedang
    // MENCATAT keterbatasan itu, bukan menetapkannya sebagai aturan. Sejak
    // normalkanNip() membersihkan spasi/titik/strip, NIP seperti ini dipakai
    // dan login-nya berhasil, bukan lagi jatuh ke jalur diagnosis.
    const r = ringkasFieldInfo({ data: { username: "19900101 201503 1 001", email: "a@b.go.id" } });
    const u = r.find((x) => x.jalur === "data.username")!;
    expect(u.panjang).toBe(21);
    expect(u.jumlahDigit).toBe(18);
    expect(u.berbentukNip).toBe(true);
    expect(JSON.stringify(r)).not.toContain("19900101");
  });

  it("field 18 digit yang TETAP ditolak tetap terbaca di ringkasan - itu gunanya", () => {
    // Yang sekarang jadi kasus diagnosis utama: NIP dikirim sebagai ANGKA.
    // Ringkasannya harus tetap menunjukkan "digit 18" supaya sebabnya bisa
    // dibedakan dari "NIP memang tidak dikirim sama sekali".
    const r = ringkasFieldInfo(JSON.parse('{"data":{"nip": 197303072005011001}}'));
    const n = r.find((x) => x.jalur === "data.nip")!;
    expect(n.tipe).toBe("number");
    expect(n.jumlahDigit).toBe(18);
    expect(n.berbentukNip).toBe(false);
  });

  it("angka ikut terhitung, bukan cuma teks", () => {
    const r = ringkasFieldInfo({ id: 12345 });
    expect(r[0].panjang).toBe(5);
    expect(r[0].jumlahDigit).toBe(5);
  });
});
