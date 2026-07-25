import { describe, it, expect } from "vitest";
import { evaluasiApproval } from "../approvalEngine";

describe("evaluasiApproval", () => {
  it("MENUNGGU_APPROVAL kalau belum ada log sama sekali", () => {
    const hasil = evaluasiApproval([], 2);
    expect(hasil.outcome).toBe("MENUNGGU_APPROVAL");
    expect(hasil.jenjangBerikutnya).toBe(1);
  });

  it("MENUNGGU_APPROVAL di jenjang 2 setelah jenjang 1 SETUJU", () => {
    const hasil = evaluasiApproval([{ jenjang: 1, keputusan: "SETUJU" }], 2);
    expect(hasil.outcome).toBe("MENUNGGU_APPROVAL");
    expect(hasil.jenjangBerikutnya).toBe(2);
  });

  it("APPROVED kalau semua jenjang SETUJU", () => {
    const hasil = evaluasiApproval(
      [
        { jenjang: 1, keputusan: "SETUJU" },
        { jenjang: 2, keputusan: "SETUJU" },
      ],
      2
    );
    expect(hasil.outcome).toBe("APPROVED");
    expect(hasil.jenjangBerikutnya).toBeNull();
  });

  it("PERLU_REVISI kalau ada jenjang yang TOLAK", () => {
    const hasil = evaluasiApproval([{ jenjang: 1, keputusan: "TOLAK" }], 2);
    expect(hasil.outcome).toBe("PERLU_REVISI");
    expect(hasil.alasan).toContain("Jenjang 1");
  });

  it("PERLU_REVISI kalau jenjang 2 REVISI walau jenjang 1 sudah SETUJU", () => {
    const hasil = evaluasiApproval(
      [
        { jenjang: 1, keputusan: "SETUJU" },
        { jenjang: 2, keputusan: "REVISI" },
      ],
      2
    );
    expect(hasil.outcome).toBe("PERLU_REVISI");
  });

  it("tidak peduli urutan array masuk - tetap dievaluasi berdasarkan nomor jenjang", () => {
    const hasil = evaluasiApproval(
      [
        { jenjang: 2, keputusan: "SETUJU" },
        { jenjang: 1, keputusan: "SETUJU" },
      ],
      2
    );
    expect(hasil.outcome).toBe("APPROVED");
  });
});
