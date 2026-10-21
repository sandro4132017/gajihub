import { describe, it, expect, afterEach } from "vitest";
import { getModeJaringan, isModeInternal } from "../modeJaringan";

// ============================================================================
// Mode jaringan menentukan hal-hal yang TERLIHAT pengguna dan tidak bisa
// dibatalkan sendiri: ke mana redirect SSO mendarat, host mana yang ditulis di
// QR TTE, dan apakah login NIP 18 digit dibuka.
//
// YANG PALING PERLU DIJAGA: nilai yang tidak dikenali harus jatuh ke INTERNAL,
// bukan PUBLIC. Salah arah di sini berarti aplikasi mengalihkan pengguna ke
// https://gajihub.kemnaker.go.id yang - sejak akses publik diputus Pusdatik -
// tidak menjawab apa pun, dan pengguna terlempar ke halaman mati tanpa
// penjelasan. INTERNAL adalah arah yang masih bisa dipulihkan sendiri.
// ============================================================================

const ENV_ASLI = {
  NODE_ENV: process.env.NODE_ENV,
  NETWORK_MODE: process.env.NETWORK_MODE,
  TEST_NETWORK_MODE: process.env.TEST_NETWORK_MODE,
};

/** Kembalikan env apa adanya - kalau tidak, test setelahnya ikut terbawa. */
afterEach(() => {
  for (const [k, v] of Object.entries(ENV_ASLI)) {
    if (v === undefined) delete process.env[k];
    else (process.env as Record<string, string | undefined>)[k] = v;
  }
});

/**
 * `process.env.NODE_ENV` bertipe read-only di TypeScript, jadi disetel lewat
 * satu pembantu bertipe longgar - bukan dicast ulang di tiap tempat.
 */
function setNodeEnv(nilai: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = nilai;
}

/** Jalankan dengan env produksi tiruan, karena NODE_ENV=test punya jalur sendiri. */
function sebagaiProduksi(networkMode: string | undefined) {
  setNodeEnv("production");
  delete process.env.TEST_NETWORK_MODE;
  if (networkMode === undefined) delete process.env.NETWORK_MODE;
  else process.env.NETWORK_MODE = networkMode;
  return getModeJaringan();
}

describe("getModeJaringan - jalur PRODUKSI (yang benar-benar jalan di VPS)", () => {
  it("NETWORK_MODE belum diisi -> INTERNAL, bukan PUBLIC", () => {
    // Default yang aman. Server baru yang .env-nya belum lengkap tidak boleh
    // mengalihkan siapa pun ke domain publik yang sedang mati.
    expect(sebagaiProduksi(undefined)).toBe("INTERNAL");
  });

  it("NETWORK_MODE kosong -> INTERNAL", () => {
    expect(sebagaiProduksi("")).toBe("INTERNAL");
  });

  it('NETWORK_MODE="PUBLIC" -> PUBLIC', () => {
    expect(sebagaiProduksi("PUBLIC")).toBe("PUBLIC");
  });

  it('NETWORK_MODE="INTERNAL" -> INTERNAL', () => {
    expect(sebagaiProduksi("INTERNAL")).toBe("INTERNAL");
  });

  it("huruf kecil & spasi tetap terbaca - env sering diketik tangan", () => {
    expect(sebagaiProduksi("  public  ")).toBe("PUBLIC");
    expect(sebagaiProduksi("internal")).toBe("INTERNAL");
  });

  it("tanda kutip ikut terbuang - .env lazim ditulis NETWORK_MODE=\"PUBLIC\"", () => {
    expect(sebagaiProduksi('"PUBLIC"')).toBe("PUBLIC");
    expect(sebagaiProduksi("'PUBLIC'")).toBe("PUBLIC");
  });

  it("NILAI NGAWUR JATUH KE INTERNAL, tidak pernah ke PUBLIC", () => {
    // Inti seluruh berkas test ini. Salah ketik tidak boleh membuka redirect
    // ke domain yang tidak menjawab.
    for (const ngawur of ["PUBLIK", "publick", "PUBLIC_MODE", "1", "true", "umum"]) {
      expect(sebagaiProduksi(ngawur)).toBe("INTERNAL");
    }
  });
});

describe("getModeJaringan - jalur TEST", () => {
  it("di NODE_ENV=test tanpa TEST_NETWORK_MODE -> PUBLIC", () => {
    // Disengaja: sebagian besar test lain mengandaikan perilaku PUBLIC.
    // Didokumentasikan di sini supaya tidak terbaca sebagai cacat.
    setNodeEnv("test");
    delete process.env.TEST_NETWORK_MODE;
    expect(getModeJaringan()).toBe("PUBLIC");
  });

  it("TEST_NETWORK_MODE MENGALAHKAN NETWORK_MODE", () => {
    setNodeEnv("test");
    process.env.NETWORK_MODE = "PUBLIC";
    process.env.TEST_NETWORK_MODE = "INTERNAL";
    expect(getModeJaringan()).toBe("INTERNAL");
  });
});

describe("isModeInternal", () => {
  it("selalu kebalikan dari PUBLIC - tidak ada keadaan ketiga", () => {
    expect(sebagaiProduksi("PUBLIC")).toBe("PUBLIC");
    expect(isModeInternal()).toBe(false);

    expect(sebagaiProduksi("INTERNAL")).toBe("INTERNAL");
    expect(isModeInternal()).toBe(true);
  });

  it("dibaca ULANG tiap pemanggilan, bukan dibekukan saat impor", () => {
    // Toggle Mode Jaringan di /admin mengubah process.env saat runtime. Kalau
    // nilainya dibekukan di tingkat modul, toggle itu tidak berefek sampai
    // server di-restart - dan itu persis yang dijanjikan tidak perlu.
    sebagaiProduksi("INTERNAL");
    expect(isModeInternal()).toBe(true);
    process.env.NETWORK_MODE = "PUBLIC";
    expect(isModeInternal()).toBe(false);
  });
});
