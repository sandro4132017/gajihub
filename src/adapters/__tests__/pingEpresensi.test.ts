import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  ctor: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
  on: vi.fn(),
}));

vi.mock("pg", () => {
  class Client {
    constructor(cfg: unknown) {
      m.ctor(cfg);
    }
    connect = m.connect;
    query = m.query;
    end = m.end;
    on = m.on;
  }
  return { default: { Client } };
});

import { pingEpresensi } from "../pingEpresensi";

const ENV_PALSU = {
  EPRESENSI_HOST: "host-palsu.invalid", // sensitive-ok
  EPRESENSI_PORT: "5999",
  EPRESENSI_DB: "db_palsu",
  EPRESENSI_USER: "user_palsu",
  EPRESENSI_PASSWORD: "sandi-palsu-xyz", // sensitive-ok
};

function pasangEnv() {
  for (const [k, v] of Object.entries(ENV_PALSU)) vi.stubEnv(k, v);
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.connect.mockResolvedValue(undefined);
  m.query.mockResolvedValue({ rows: [{ "?column?": 1 }] });
  m.end.mockResolvedValue(undefined);
  pasangEnv();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("pingEpresensi", () => {
  it("env kosong -> belum_diatur dan Client tidak dibuat", async () => {
    vi.stubEnv("EPRESENSI_HOST", "");
    expect(await pingEpresensi()).toEqual({ jenis: "belum_diatur" });
    expect(m.ctor).not.toHaveBeenCalled();
  });

  it("sukses: query persis SELECT 1 sekali, end sekali, handler error terpasang", async () => {
    expect(await pingEpresensi()).toEqual({ jenis: "ok" });
    expect(m.query).toHaveBeenCalledTimes(1);
    expect(m.query).toHaveBeenCalledWith("SELECT 1");
    expect(m.end).toHaveBeenCalledTimes(1);
    expect(m.on).toHaveBeenCalledWith("error", expect.any(Function));
    const cfg = m.ctor.mock.calls[0][0];
    expect(cfg).toMatchObject({
      connectionTimeoutMillis: 4500,
      query_timeout: 4500,
      application_name: "gajihub-cek-koneksi",
    });
    expect(cfg).not.toHaveProperty("statement_timeout");
  });

  it("jawaban bukan satu baris -> jawaban_aneh", async () => {
    m.query.mockResolvedValue({ rows: [] });
    expect(await pingEpresensi()).toEqual({ jenis: "jawaban_aneh" });
    expect(m.end).toHaveBeenCalledTimes(1);
  });

  it("galat connect: kode diteruskan, message tidak; end sekali", async () => {
    m.connect.mockRejectedValue(Object.assign(new Error("gagal ke host-palsu.invalid"), { code: "ECONNREFUSED" }));
    const r = await pingEpresensi();
    expect(r).toEqual({ jenis: "galat", kode: "ECONNREFUSED", batasWaktu: false });
    expect(JSON.stringify(r)).not.toContain("host-palsu");
    expect(m.query).not.toHaveBeenCalled();
    expect(m.end).toHaveBeenCalledTimes(1);
  });

  it("galat query: SQLSTATE diteruskan; kode tak sah -> null; end sekali", async () => {
    m.query.mockRejectedValue(Object.assign(new Error("x"), { code: "57P01" }));
    expect(await pingEpresensi()).toEqual({ jenis: "galat", kode: "57P01", batasWaktu: false });
    expect(m.end).toHaveBeenCalledTimes(1);
    m.end.mockClear();
    m.query.mockRejectedValue(Object.assign(new Error("x"), { code: "kode kecil <script>" }));
    expect(await pingEpresensi()).toEqual({ jenis: "galat", kode: null, batasWaktu: false });
  });

  it("galat end diabaikan", async () => {
    m.end.mockRejectedValue(new Error("end gagal"));
    expect(await pingEpresensi()).toEqual({ jenis: "ok" });
  });

  it("connect menggantung -> batasWaktu true sekitar 4000 ms; end sekali", async () => {
    vi.useFakeTimers();
    m.connect.mockReturnValue(new Promise(() => {}));
    const janji = pingEpresensi();
    await vi.advanceTimersByTimeAsync(3_999);
    expect(m.end).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(await janji).toEqual({ jenis: "galat", kode: null, batasWaktu: true });
    expect(m.end).toHaveBeenCalledTimes(1);
  });

  it("tidak pernah mencetak nilai env ke console", async () => {
    const spies = (["log", "warn", "error", "info", "debug"] as const).map((k) =>
      vi.spyOn(console, k).mockImplementation(() => {})
    );
    m.connect.mockRejectedValue(Object.assign(new Error("sandi-palsu-xyz"), { code: "28P01" }));
    await pingEpresensi();
    for (const s of spies) {
      expect(JSON.stringify(s.mock.calls)).not.toMatch(/palsu/);
      s.mockRestore();
    }
  });
});
