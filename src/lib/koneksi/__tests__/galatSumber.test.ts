import { afterEach, describe, expect, it, vi } from "vitest";
import {
  GalatKonfigurasi,
  GalatPengguna,
  GalatSumber,
  catatGalat,
  denganSumber,
  jenisGalat,
  pesanGalatAwam,
  samarkanUntukLog,
} from "../galatSumber";

const HOST_PALSU = "192.0.2.10"; // sensitive-ok
const USER_PALSU = "pengguna_palsu_x"; // sensitive-ok
const SANDI_PALSU = "sandi-palsu-123"; // sensitive-ok

const galatKode = (kode: string, pesan = "x") => Object.assign(new Error(pesan), { code: kode });

afterEach(() => vi.unstubAllEnvs());

describe("jenisGalat - e-Presensi (pg)", () => {
  it.each([
    ["28P01", "KONFIGURASI"],
    ["3D000", "KONFIGURASI"],
    ["ECONNREFUSED", "TIDAK_TERJANGKAU"],
    ["ENOTFOUND", "TIDAK_TERJANGKAU"],
    ["EHOSTUNREACH", "TIDAK_TERJANGKAU"],
    ["ETIMEDOUT", "TIDAK_TERJANGKAU"],
    ["53300", "SIBUK"],
    ["08006", "TIDAK_TERJANGKAU"],
    ["08001", "TIDAK_TERJANGKAU"],
    ["57P01", "TIDAK_TERJANGKAU"],
    ["57P03", "TIDAK_TERJANGKAU"],
    ["42P01", "GALAT_SERVER"],
  ])("kode %s -> %s", (kode, jenis) => {
    const info = jenisGalat(new GalatSumber("EPRESENSI", galatKode(kode)));
    expect(info).toEqual({ sumber: "EPRESENSI", jenis, kode });
  });

  it.each(["timeout expired", "Query read timeout", "Connection terminated due to connection timeout"])(
    "pesan '%s' tanpa kode -> BATAS_WAKTU",
    (pesan) => {
      expect(jenisGalat(new GalatSumber("EPRESENSI", new Error(pesan))).jenis).toBe("BATAS_WAKTU");
    }
  );

  it.each(["Connection terminated unexpectedly", "server closed the connection unexpectedly"])(
    "pesan '%s' tanpa kode -> TIDAK_TERJANGKAU",
    (pesan) => {
      expect(jenisGalat(new GalatSumber("EPRESENSI", new Error(pesan))).jenis).toBe("TIDAK_TERJANGKAU");
    }
  );

  it("galat tanpa kode & tanpa pola -> TAK_DIKENAL", () => {
    expect(jenisGalat(new GalatSumber("EPRESENSI", new Error("aneh"))).jenis).toBe("TAK_DIKENAL");
  });
});

describe("jenisGalat - SIAP (mssql)", () => {
  it.each([
    ["ESOCKET", "TIDAK_TERJANGKAU"],
    ["EINSTLOOKUP", "TIDAK_TERJANGKAU"],
    ["ECONNRESET", "TIDAK_TERJANGKAU"],
    ["ECONNCLOSED", "TIDAK_TERJANGKAU"],
    ["ENOCONN", "TIDAK_TERJANGKAU"],
    ["ENOTOPEN", "TIDAK_TERJANGKAU"],
    ["ETIMEOUT", "BATAS_WAKTU"],
    ["ELOGIN", "KONFIGURASI"],
    ["EENCRYPT", "KONFIGURASI"],
    ["EREQUEST", "GALAT_SERVER"],
    ["EAPAPUN", "GALAT_SERVER"],
  ])("kode %s -> %s", (kode, jenis) => {
    expect(jenisGalat(new GalatSumber("SIAP", galatKode(kode)))).toEqual({ sumber: "SIAP", jenis, kode });
  });
});

describe("jenisGalat - Prisma (database Gajihub)", () => {
  it.each([
    ["P1001", "TIDAK_TERJANGKAU"],
    ["P1002", "BATAS_WAKTU"],
    ["P1008", "BATAS_WAKTU"],
    ["P1000", "KONFIGURASI"],
    ["P1003", "KONFIGURASI"],
    ["P2024", "SIBUK"],
    ["P2034", "SIBUK"],
    ["P2002", "GALAT_SERVER"],
  ])("kode %s -> %s (dikenali tanpa pembungkus)", (kode, jenis) => {
    expect(jenisGalat(galatKode(kode))).toEqual({ sumber: "GAJIHUB_DB", jenis, kode });
  });

  it("PrismaClientInitializationError memakai errorCode", () => {
    const e = Object.assign(new Error("x"), { name: "PrismaClientInitializationError", errorCode: "P1001" });
    expect(jenisGalat(e)).toMatchObject({ sumber: "GAJIHUB_DB", jenis: "TIDAK_TERJANGKAU" });
  });
});

describe("jenisGalat - lain-lain", () => {
  it("GalatKonfigurasi -> KONFIGURASI dengan sumbernya", () => {
    expect(jenisGalat(new GalatKonfigurasi("x", "SIAP"))).toEqual({
      sumber: "SIAP",
      jenis: "KONFIGURASI",
      kode: null,
    });
  });

  it("Error biasa -> LAINNYA / TAK_DIKENAL", () => {
    expect(jenisGalat(new Error("bug"))).toEqual({ sumber: "LAINNYA", jenis: "TAK_DIKENAL", kode: null });
  });

  it("kode yang tidak berpola aman tidak diteruskan", () => {
    expect(jenisGalat(galatKode("host 192.0.2.1 gagal")).kode).toBeNull(); // sensitive-ok
  });
});

describe("denganSumber", () => {
  it("membungkus galat asing, mempertahankan message & code", async () => {
    const e = galatKode("ECONNREFUSED", "pesan asli");
    const err = await denganSumber("SIAP", async () => {
      throw e;
    }).catch((x) => x);
    expect(err).toBeInstanceOf(GalatSumber);
    expect(err.sumber).toBe("SIAP");
    expect(err.message).toBe("pesan asli");
    expect(err.code).toBe("ECONNREFUSED");
    expect(err.cause).toBe(e);
  });

  it("GalatPengguna, GalatKonfigurasi, GalatSumber lolos tanpa dibungkus ulang", async () => {
    for (const e of [new GalatPengguna("a"), new GalatKonfigurasi("b"), new GalatSumber("EPRESENSI", new Error("c"))]) {
      const err = await denganSumber("SIAP", async () => {
        throw e;
      }).catch((x) => x);
      expect(err).toBe(e);
    }
  });

  it("mengembalikan nilai bila sukses", async () => {
    expect(await denganSumber("SIAP", () => 7)).toBe(7);
  });
});

describe("pesanGalatAwam", () => {
  const ref = "ab12cd34";

  it("menyebut sumber, sebab awam, dan konteks", () => {
    const p = pesanGalatAwam(
      { sumber: "EPRESENSI", jenis: "TIDAK_TERJANGKAU", kode: "ECONNREFUSED" },
      ref,
      "Gagal menarik data presensi"
    );
    expect(p).toMatch(/^Gagal menarik data presensi: e-Presensi sedang tidak bisa dihubungi/);
    expect(p).toContain("kode rujukan");
    expect(p).toContain("VPN");
  });

  it("SIAP berlabel SIAP; BATAS_WAKTU dan GALAT_SERVER memuat kode rujukan", () => {
    const a = pesanGalatAwam({ sumber: "SIAP", jenis: "BATAS_WAKTU", kode: null }, ref, "K");
    const b = pesanGalatAwam({ sumber: "SIAP", jenis: "GALAT_SERVER", kode: null }, ref, "K");
    expect(a).toContain("SIAP terlalu lama menjawab");
    expect(b).toContain("terjadi gangguan di SIAP");
    expect(a).toContain(ref);
    expect(b).toContain(ref);
    expect(a).not.toContain("e-Presensi");
  });

  it.each(["TIDAK_TERJANGKAU", "BATAS_WAKTU", "SIBUK", "KONFIGURASI", "GALAT_SERVER", "TAK_DIKENAL"] as const)(
    "jenis %s: ada kode rujukan, tanpa kode galat mentah",
    (jenis) => {
      const p = pesanGalatAwam({ sumber: "GAJIHUB_DB", jenis, kode: "P1001" }, ref, "K");
      expect(p).toContain(ref);
      expect(p).not.toContain("P1001");
      expect(p).toContain("Gajihub");
      expect(p).toContain("kode rujukan");
    }
  );
});

describe("samarkanUntukLog", () => {
  it("mengganti nilai rahasia, abaikan yang kosong atau terlalu pendek", () => {
    const t = samarkanUntukLog(`user ${USER_PALSU} sandi ${SANDI_PALSU} ab`, [USER_PALSU, SANDI_PALSU, "", "ab"]);
    expect(t).toBe("user <rahasia> sandi <rahasia> ab");
  });

  it("menyamarkan deret 16-18 digit (NIK/NIP), membiarkan angka pendek", () => {
    const t = samarkanUntukLog("Unique constraint nip 199001012020011001 nik 3201010101010001 baris 42", []); // sensitive-ok
    expect(t).toBe("Unique constraint nip <id> nik <id> baris 42");
  });

  it("menyamarkan IPv4, connection string, dan user@host", () => {
    const t = samarkanUntukLog(
      `connect ${HOST_PALSU}:5432 postgresql://u:p@db.contoh.test:5432/x dan andi@contoh.test`, // sensitive-ok
      []
    );
    expect(t).not.toContain(HOST_PALSU);
    expect(t).not.toContain("u:p@");
    expect(t).not.toContain("andi@");
    expect(t).toContain("<host>");
    expect(t).toContain("<koneksi>");
    expect(t).toContain("<user>@<host>");
  });
});

describe("catatGalat", () => {
  it("menulis tepat satu baris tersamar tanpa nilai rahasia, ref konsisten", () => {
    vi.stubEnv("EPRESENSI_HOST", "epresensi.contoh.test");
    vi.stubEnv("EPRESENSI_USER", USER_PALSU);
    vi.stubEnv("EPRESENSI_PASSWORD", SANDI_PALSU);
    vi.stubEnv("DATABASE_URL", "postgresql://dbuser_palsu:dbsandi_palsu@198.51.100.7:5432/gajihub"); // sensitive-ok
    const baris: string[] = [];
    const e = new GalatSumber(
      "EPRESENSI",
      galatKode(
        "ECONNREFUSED",
        `connect ECONNREFUSED ${HOST_PALSU}:5432 untuk epresensi.contoh.test user ${USER_PALSU} sandi ${SANDI_PALSU}\nstack: dbuser_palsu dbsandi_palsu 198.51.100.7`
      )
    );
    const { ref, info } = catatGalat("presensi-sync", e, { buatRef: () => "ab12cd34", log: (b) => baris.push(b) });
    expect(ref).toBe("ab12cd34");
    expect(info.jenis).toBe("TIDAK_TERJANGKAU");
    expect(baris).toHaveLength(1);
    const b = baris[0];
    expect(b).not.toContain("\n");
    expect(b).toMatch(
      /^\[presensi-sync\] ref=ab12cd34 sumber=EPRESENSI jenis=TIDAK_TERJANGKAU kode=ECONNREFUSED pesan="/
    );
    for (const rahasia of [
      HOST_PALSU,
      "198.51.100.7", // sensitive-ok
      "epresensi.contoh.test",
      USER_PALSU,
      SANDI_PALSU,
      "dbuser_palsu",
      "dbsandi_palsu",
    ]) {
      expect(b).not.toContain(rahasia);
    }
  });

  it("opsi jumlah ikut tercatat di baris log", () => {
    const baris: string[] = [];
    catatGalat("uji", new Error("x"), { buatRef: () => "00000000", log: (b) => baris.push(b), jumlah: 7 });
    expect(baris[0]).toContain(" jumlah=7 pesan=");
  });

  it("tanpa deps: console.error dipanggil sekali, ref 8 hex", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ref } = catatGalat("uji", new Error("x"));
    expect(ref).toMatch(/^[0-9a-f]{8}$/);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe("pesanGalatUntukLayar", () => {
  it("GalatPengguna tampil apa adanya, tidak dicatat", async () => {
    const { pesanGalatUntukLayar } = await import("../galatSumber");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(pesanGalatUntukLayar("x", new GalatPengguna("Periode tidak sah."), "Gagal")).toBe("Periode tidak sah.");
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("galat lain: kalimat awam + rujukan, tanpa pesan mentah; rahasia tambahan disamarkan di log", async () => {
    const { pesanGalatUntukLayar } = await import("../galatSumber");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const teks = pesanGalatUntukLayar("x", new Error(`rusak ${HOST_PALSU} ${SANDI_PALSU}`), "Gagal", [SANDI_PALSU]);
    expect(teks).toMatch(/^Gagal: .*kode rujukan/);
    expect(teks).not.toContain(HOST_PALSU);
    expect(teks).not.toContain(SANDI_PALSU);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SANDI_PALSU);
    log.mockRestore();
  });

  it("env ESIGN_API_PASS ikut disamarkan di log", async () => {
    const { pesanGalatUntukLayar } = await import("../galatSumber");
    vi.stubEnv("ESIGN_API_PASS", SANDI_PALSU);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    pesanGalatUntukLayar("x", new Error(`gema ${SANDI_PALSU}`), "Gagal");
    expect(JSON.stringify(log.mock.calls)).not.toContain(SANDI_PALSU);
    log.mockRestore();
  });
});
