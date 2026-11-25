import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Izin unduh dokumen lembur: penandatangan sendiri boleh, kepala tim lain
// ditolak, dan jenis SPTJM tetap memakai aturan lamanya.

const { findUnique, readFile, ambilUserSesi } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  readFile: vi.fn(),
  ambilUserSesi: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { dokumenTte: { findUnique } } }));
vi.mock("@/auth/getSessionAccount", () => ({ ambilUserSesi }));
vi.mock("fs/promises", () => ({
  default: { readFile, realpath: async (p: string) => p },
  readFile,
  realpath: async (p: string) => p,
}));

import { GET } from "../route";

const UNIT = "Biro Umum";
const NIP_KT = "199001010000000011"; // sensitive-ok
const NIP_KT_LAIN = "199001010000000022"; // sensitive-ok
const sesi = (o: Record<string, unknown> = {}) => ({
  nip: NIP_KT,
  role: "KEPALA_TIM",
  satuanKerja: UNIT,
  aktif: true,
  ...o,
});
const permintaan = () => new NextRequest("http://localhost/berkas/tte/abc");
const konteks = { params: Promise.resolve({ id: "abc" }) };

const dok = (o: Record<string, unknown> = {}) => ({
  jenisDokumen: "SURAT_TUGAS_LEMBUR",
  penandatanganNip: NIP_KT,
  status: "TERTANDATANGANI",
  satuanKerja: UNIT,
  fileDraftPath: "tte/Biro Umum/2026-10/draft_abc.pdf",
  fileSignedPath: "tte/Biro Umum/2026-10/abc/Surat Tugas Lembur 2026-10-14 Biro Umum.pdf",
  ...o,
});

beforeEach(() => {
  findUnique.mockReset();
  readFile.mockReset();
  ambilUserSesi.mockReset();
  readFile.mockResolvedValue(Buffer.from("%PDF-1.7"));
});

describe("GET /berkas/tte/[id] - dokumen lembur", () => {
  it("penandatangan surat tugas boleh mengunduh", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(dok());
    expect((await GET(permintaan(), konteks)).status).toBe(200);
  });

  it("kepala tim lain (satu unit) ditolak tanpa membaca disk", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_KT_LAIN }));
    findUnique.mockResolvedValue(dok());
    expect((await GET(permintaan(), konteks)).status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  it("akun penandatangan yang nonaktif ditolak", async () => {
    ambilUserSesi.mockResolvedValue(sesi({ aktif: false }));
    findUnique.mockResolvedValue(dok());
    expect((await GET(permintaan(), konteks)).status).toBe(403);
  });

  it("Kasubag TU unit itu boleh; Kasubag TU unit lain ditolak", async () => {
    findUnique.mockResolvedValue(dok());
    ambilUserSesi.mockResolvedValue(sesi({ nip: NIP_KT_LAIN, role: "KASUBAG_TU" }));
    expect((await GET(permintaan(), konteks)).status).toBe(200);
    ambilUserSesi.mockResolvedValue(
      sesi({ nip: NIP_KT_LAIN, role: "KASUBAG_TU", satuanKerja: "Sekretariat Jenderal" }),
    );
    expect((await GET(permintaan(), konteks)).status).toBe(403);
  });

  it("SPTJM tetap seperti dulu: penandatangan non-Kasubag tidak otomatis boleh", async () => {
    ambilUserSesi.mockResolvedValue(sesi());
    findUnique.mockResolvedValue(dok({ jenisDokumen: "SPTJM_TUKIN" }));
    expect((await GET(permintaan(), konteks)).status).toBe(403);

    ambilUserSesi.mockResolvedValue(sesi({ role: "KASUBAG_TU" }));
    expect((await GET(permintaan(), konteks)).status).toBe(200);
  });
});
