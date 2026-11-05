import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ctor: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  close: vi.fn(),
  on: vi.fn(),
}));

vi.mock("mssql", () => {
  class ConnectionPool {
    constructor(cfg: unknown) {
      m.ctor(cfg);
    }
    connect = m.connect;
    close = m.close;
    on = m.on;
    request() {
      return { query: m.query };
    }
  }
  return { default: { ConnectionPool } };
});

import { pingSiap } from "../pingSiap";

const ENV_PALSU = {
  SIAP_HOST: "host-palsu.invalid", // sensitive-ok
  SIAP_DB: "db_palsu",
  SIAP_USER: "user_palsu",
  SIAP_PASSWORD: "sandi-palsu-xyz", // sensitive-ok
  SIAP_INSTANCE: "INSTANCE_PALSU",
  SIAP_ENCRYPT: "false",
};

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.connect.mockResolvedValue(undefined);
  m.query.mockResolvedValue({ recordset: [{ "": 1 }] });
  m.close.mockResolvedValue(undefined);
  for (const [k, v] of Object.entries(ENV_PALSU)) vi.stubEnv(k, v);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("pingSiap", () => {
  it("env kosong -> belum_diatur dan pool tidak dibuat", async () => {
    vi.stubEnv("SIAP_HOST", "");
    expect(await pingSiap()).toEqual({ jenis: "belum_diatur" });
    expect(m.ctor).not.toHaveBeenCalled();
  });

  it("sukses: query persis SELECT 1 sekali, close sekali, handler error terpasang", async () => {
    expect(await pingSiap()).toEqual({ jenis: "ok" });
    expect(m.query).toHaveBeenCalledTimes(1);
    expect(m.query).toHaveBeenCalledWith("SELECT 1");
    expect(m.close).toHaveBeenCalledTimes(1);
    expect(m.on).toHaveBeenCalledWith("error", expect.any(Function));
    expect(m.ctor.mock.calls[0][0]).toMatchObject({
      connectionTimeout: 6000,
      requestTimeout: 6000,
      pool: { max: 1, min: 0 },
    });
  });

  it("konfigurasi mempertahankan instanceName dan encrypt", async () => {
    await pingSiap();
    const cfg = m.ctor.mock.calls[0][0];
    expect(cfg.options.instanceName).toBe("INSTANCE_PALSU");
    expect(cfg.options.encrypt).toBe(false);
    expect(cfg.options.cryptoCredentialsDetails).toBeDefined();
    expect(cfg).not.toHaveProperty("port");
  });

  it("jawaban bukan satu baris -> jawaban_aneh", async () => {
    m.query.mockResolvedValue({ recordset: [] });
    expect(await pingSiap()).toEqual({ jenis: "jawaban_aneh" });
    expect(m.close).toHaveBeenCalledTimes(1);
  });

  it("galat connect: kode diteruskan, message tidak; close sekali", async () => {
    m.connect.mockRejectedValue(Object.assign(new Error("gagal ke host-palsu.invalid"), { code: "ELOGIN" }));
    const r = await pingSiap();
    expect(r).toEqual({ jenis: "galat", kode: "ELOGIN", batasWaktu: false });
    expect(JSON.stringify(r)).not.toContain("host-palsu");
    expect(m.query).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalledTimes(1);
  });

  it("kode ETIMEOUT dari driver diteruskan sebagai kode, bukan batasWaktu", async () => {
    m.query.mockRejectedValue(Object.assign(new Error("x"), { code: "ETIMEOUT" }));
    expect(await pingSiap()).toEqual({ jenis: "galat", kode: "ETIMEOUT", batasWaktu: false });
  });

  it("kode tak sah -> null", async () => {
    m.query.mockRejectedValue(Object.assign(new Error("x"), { code: "kode kecil <script>" }));
    expect(await pingSiap()).toEqual({ jenis: "galat", kode: null, batasWaktu: false });
  });

  it("galat close diabaikan (juga yang melempar sinkron)", async () => {
    m.close.mockRejectedValue(new Error("close gagal"));
    expect(await pingSiap()).toEqual({ jenis: "ok" });
    m.close.mockImplementation(() => {
      throw new Error("close melempar");
    });
    expect(await pingSiap()).toEqual({ jenis: "ok" });
  });

  it("connect menggantung -> batasWaktu true sekitar 8000 ms", async () => {
    vi.useFakeTimers();
    m.connect.mockReturnValue(new Promise(() => {}));
    const janji = pingSiap();
    await vi.advanceTimersByTimeAsync(7_999);
    await vi.advanceTimersByTimeAsync(2);
    expect(await janji).toEqual({ jenis: "galat", kode: null, batasWaktu: true });
    expect(m.query).not.toHaveBeenCalled();
  });

  it("connect sukses SETELAH batas: tanpa query, pool tetap ditutup", async () => {
    vi.useFakeTimers();
    let sambung!: () => void;
    m.connect.mockReturnValue(new Promise<void>((r) => (sambung = r)));
    const janji = pingSiap();
    await vi.waitFor(() => expect(m.connect).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(8_001);
    expect(await janji).toEqual({ jenis: "galat", kode: null, batasWaktu: true });
    expect(m.close).not.toHaveBeenCalled();
    sambung();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.query).not.toHaveBeenCalled();
    expect(m.close).toHaveBeenCalledTimes(1);
  });

  it("connect gagal SETELAH batas: pool tetap ditutup", async () => {
    vi.useFakeTimers();
    let tolak!: (e: unknown) => void;
    m.connect.mockReturnValue(new Promise<void>((_r, j) => (tolak = j)));
    const janji = pingSiap();
    await vi.waitFor(() => expect(m.connect).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(8_001);
    expect((await janji).jenis).toBe("galat");
    tolak(Object.assign(new Error("x"), { code: "ETIMEOUT" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(m.close).toHaveBeenCalledTimes(1);
  });

  it("tidak pernah mencetak nilai env ke console", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {})
    );
    m.connect.mockRejectedValue(Object.assign(new Error("sandi-palsu-xyz"), { code: "ELOGIN" }));
    await pingSiap();
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toMatch(/palsu/);
      s.mockRestore();
    }
  });
});
