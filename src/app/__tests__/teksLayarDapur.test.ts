import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "..", "..");
const baca = (rel: string) => readFileSync(path.join(SRC, rel), "utf-8");

function semuaTsx(dir: string): string[] {
  const hasil: string[] = [];
  for (const nama of readdirSync(dir)) {
    const p = path.join(dir, nama);
    if (statSync(p).isDirectory()) {
      if (nama === "__tests__") continue;
      hasil.push(...semuaTsx(p));
    } else if (/\.(tsx|ts)$/.test(nama)) hasil.push(p);
  }
  return hasil;
}

describe("teks layar: tidak ada jargon dapur", () => {
  it("rekening PPABP", () => {
    const page = baca("app/ppabp/rekening/page.tsx");
    expect(page).not.toContain("password = NIP");
    expect(page).not.toContain("WAJIB diamankan");
    for (const f of semuaTsx(path.join(SRC, "app/ppabp/rekening"))) {
      expect(readFileSync(f, "utf-8"), f).not.toContain("terinterkoneksi");
    }
  });

  it("OSDMA tidak menyebut sinkronisasi ke sistem sumber", () => {
    const terlarang = [
      "disinkronkan ke sistem sumber",
      "tersinkronisasi ke sistem sumber",
      "pemutakhiran data pada sistem sumber",
    ];
    for (const f of semuaTsx(path.join(SRC, "app/osdma"))) {
      const isi = readFileSync(f, "utf-8").toLowerCase();
      for (const t of terlarang) expect(isi, `${f}: ${t}`).not.toContain(t);
    }
  });

  it("halaman /saya tidak merender nilai enum mentah", () => {
    const saya = baca("app/saya/page.tsx");
    expect(saya).not.toContain("{pegawai.sourceSystem}");
    expect(saya).not.toContain("{sk.status}");
    expect(saya).not.toContain("{pk.predikat}");
    expect(saya).not.toContain("template Excel");
    expect(baca("app/saya/presensi/[bulan]/[tahun]/page.tsx")).not.toContain("template Excel");
  });
});

/**
 * Hanya yang tampil: komentar (blok, JSX, awal baris) dan baris console.*
 * dibuang, lalu diambil literal string/template dan teks JSX.
 */
function literalLayar(src: string): string {
  const tanpaKomentar = src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((b) => !b.trim().startsWith("//") && !b.includes("console."))
    .join("\n");
  const hasil: string[] = [];
  for (const m of tanpaKomentar.matchAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g)) hasil.push(m[0]);
  for (const m of tanpaKomentar.matchAll(/>([^<>{}\n]+)</g)) hasil.push(m[1]);
  return hasil.join("\n");
}

function tanpa(rel: string, larangan: Array<string | RegExp>) {
  const lit = literalLayar(baca(rel));
  for (const l of larangan) {
    if (typeof l === "string") expect(lit, `${rel}: ${l}`).not.toContain(l);
    else expect(lit, `${rel}: ${l}`).not.toMatch(l);
  }
}

describe("teks layar login: bahasa pengguna, bukan konfigurasi", () => {
  it("komponen login", () => {
    const larangan = [".env", "DEV_AUTH", "payload", "Naco", "Single Sign-On", /\bdev\b/i, "QA"];
    for (const f of ["app/login/LoginForm.tsx", "app/login/page.tsx", "app/login/PesanSso.tsx"]) tanpa(f, larangan);
  });

  it("login tidak menyebut NIP (jalur NIP dihapus)", () => {
    for (const f of ["app/login/LoginForm.tsx", "app/login/page.tsx", "app/login/actions.ts", "app/api/auth/login/route.ts"]) {
      const lit = literalLayar(baca(f)).replace(/DEV_AUTH_NIP/g, "");
      expect(lit, f).not.toMatch(/Username\/NIP|atau NIP|NIP 18|memakai NIP|pakai NIP/);
      expect(baca(f), f).not.toContain("ALLOW_NIP_LOGIN");
      expect(baca(f), f).not.toContain("modeInternal");
    }
  });

  it("PesanSso tidak menyuruh masuk memakai NIP", () => {
    const isi = baca("app/login/PesanSso.tsx");
    expect(isi).not.toContain("NIP di bawah");
    expect(isi).not.toContain("NIP dan kata sandi");
  });

  it("halaman login punya pesan status bila tak ada SSO maupun form lokal", () => {
    const isi = baca("app/login/page.tsx");
    expect(isi).toContain("!adaSso && !tampilkanFormLokal");
    expect(isi).toContain("Masuk belum diaktifkan di server ini. Hubungi Admin Gajihub.");
  });

  it("pesan galat login", () => {
    const larangan = [".env", "DEV_AUTH", "payload", "database", "Mode Akses Publik"];
    for (const f of ["app/login/actions.ts", "app/api/auth/login/route.ts"]) tanpa(f, larangan);
  });

  it("callback SSO", () => {
    tanpa("app/login/sso/callback/route.ts", ["authorization code", "(state)"]);
    const pesan = [...baca("app/login/sso/callback/route.ts").matchAll(/keLogin\(req,[^\n]*\)/g)].map((m) => m[0]);
    for (const p of pesan) expect(p).not.toContain("Naco tidak");
  });
});

describe("teks galat awam", () => {
  it("semua sumber x jenis: tanpa istilah dapur, selalu ada kode rujukan", async () => {
    const { pesanGalatAwam } = await import("../../lib/koneksi/galatSumber");
    const sumber = ["EPRESENSI", "SIAP", "GAJIHUB_DB", "LAINNYA"] as const;
    const jenis = ["TIDAK_TERJANGKAU", "BATAS_WAKTU", "SIBUK", "KONFIGURASI", "GALAT_SERVER", "TAK_DIKENAL"] as const;
    for (const s of sumber) {
      for (const j of jenis) {
        const p = pesanGalatAwam({ sumber: s, jenis: j, kode: null }, "ABC123", "Gagal");
        expect(p, `${s}/${j}`).toContain("kode rujukan");
        for (const l of ["server database", "sambungan", "database", "galat pada"]) {
          expect(p, `${s}/${j}: ${l}`).not.toContain(l);
        }
      }
    }
  });
});

describe("istilah peran dan kabar", () => {
  it("src/app dan src/components tanpa 'Role kamu' / 'Ganti role' di teks layar", () => {
    const berkas = [...semuaTsx(path.join(SRC, "app")), ...semuaTsx(path.join(SRC, "components"))];
    for (const f of berkas) {
      const lit = literalLayar(readFileSync(f, "utf-8"));
      expect(lit, f).not.toContain("Role kamu");
      expect(lit, f).not.toContain("Ganti role");
    }
  });

  it("kabarData tanpa 'jenjang 1' dan tanpa enum mentah sebagai cadangan", () => {
    const lit = literalLayar(baca("app/kabarData.ts"));
    expect(lit).not.toContain("jenjang 1");
    expect(baca("app/kabarData.ts")).not.toContain("?? a.referensiTipe");
  });

  it("layout tanpa 'Dashboard internal'", () => {
    tanpa("app/layout.tsx", ["Dashboard internal"]);
  });
});
