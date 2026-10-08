import { describe, it, expect } from "vitest";
import {
  formatNomorTiket,
  formatWaktuTracker,
  hitungTahapanStepper,
  bangunTimelineCheckpoints,
  type BandingItem,
  type ApprovalLogItem,
} from "../saya/bandingTrackerLogic";

describe("bandingTrackerLogic", () => {
  const dummyBandingBaru: BandingItem = {
    id: "bnd-12345678-abcd",
    pegawaiId: "peg-1",
    periodeBulan: 9,
    periodeTahun: 2026,
    referensiTipe: "PRESENSI",
    referensiId: "rek-1",
    bagianData: "Jam masuk / jam pulang",
    usulanPerbaikan: "Jam masuk 07:30 WIB",
    alasan: "Web e-presensi sempat error saat tap masuk",
    status: "DIAJUKAN",
    createdAt: new Date("2026-09-05T08:00:00Z"),
    updatedAt: new Date("2026-09-05T08:00:00Z"),
  };

  it("formatNomorTiket menghasilkan format tiket [SINGKATAN]-[DDMMYYYY]-[NOMOR_URUT]", () => {
    const noTiket = formatNomorTiket({ ...dummyBandingBaru, nomorUrut: 1 });
    expect(noTiket).toBe("PRS-05092026-001");

    expect(
      formatNomorTiket({
        referensiTipe: "UANG_MAKAN",
        createdAt: new Date("2026-05-12T10:00:00Z"),
        nomorUrut: 1,
      })
    ).toBe("UMK-12052026-001");

    expect(
      formatNomorTiket({
        referensiTipe: "TUKIN",
        createdAt: new Date("2026-05-15T10:00:00Z"),
        nomorUrut: 2,
      })
    ).toBe("TUK-15052026-002");
  });

  it("formatWaktuTracker memformat tanggal dengan benar", () => {
    const waktu = formatWaktuTracker(new Date("2026-10-05T10:30:00"));
    expect(waktu).toContain("10:30");
  });

  describe("hitungTahapanStepper", () => {
    it("status DIAJUKAN: step 1 selesai, step 2 aktif, step 3 & 4 pending", () => {
      const steps = hitungTahapanStepper(dummyBandingBaru, []);
      expect(steps[0].state).toBe("completed");
      expect(steps[1].state).toBe("active");
      expect(steps[2].state).toBe("pending");
      expect(steps[3].state).toBe("pending");

      // Verifikasi label & sublabel editorial
      expect(steps[0].label).toBe("Diajukan");
      expect(steps[0].sublabel).toBe("Pegawai Pengaju");
      expect(steps[0].keterangan).toBe("Banding tercatat di sistem");

      expect(steps[1].label).toBe("Verifikasi Unit");
      expect(steps[1].sublabel).toBe("Kasubag TU");

      expect(steps[2].label).toBe("Persetujuan Akhir");
      expect(steps[2].sublabel).toBe("Biro OSDMA");

      expect(steps[3].label).toBe("Selesai");
      expect(steps[3].sublabel).toBe("Data telah diperbarui");
    });

    it("status MENUNGGU_APPROVAL_FINAL: step 1 & 2 selesai, step 3 aktif, step 4 pending", () => {
      const bandingTahap1: BandingItem = {
        ...dummyBandingBaru,
        status: "MENUNGGU_APPROVAL_FINAL",
      };
      const logs: ApprovalLogItem[] = [
        {
          id: "log-1",
          referensiTipe: "BANDING",
          referensiId: dummyBandingBaru.id,
          approverNip: "19800101",
          approverNama: "Kasubag TU",
          approverJabatan: "Kasubag TU",
          jenjang: 1,
          keputusan: "SETUJU",
          timestampAksi: new Date("2026-09-06T09:00:00Z"),
        },
      ];
      const steps = hitungTahapanStepper(bandingTahap1, logs);
      expect(steps[0].state).toBe("completed");
      expect(steps[1].state).toBe("completed");
      expect(steps[2].state).toBe("active");
      expect(steps[3].state).toBe("pending");

      expect(steps[1].keterangan).toBe("Terverifikasi oleh Kasubag TU");
      expect(steps[2].keterangan).toBe("Sedang ditelaah oleh OSDMA");
    });

    it("status DISETUJUI: semua 4 step selesai (completed)", () => {
      const bandingSetuju: BandingItem = {
        ...dummyBandingBaru,
        status: "DISETUJUI",
      };
      const logs: ApprovalLogItem[] = [
        {
          id: "log-1",
          referensiTipe: "BANDING",
          referensiId: dummyBandingBaru.id,
          approverNip: "19800101",
          approverNama: "Kasubag TU",
          approverJabatan: "Kasubag TU",
          jenjang: 1,
          keputusan: "SETUJU",
          timestampAksi: new Date("2026-09-06T09:00:00Z"),
        },
        {
          id: "log-2",
          referensiTipe: "BANDING",
          referensiId: dummyBandingBaru.id,
          approverNip: "19850101",
          approverNama: "Analis OSDMA",
          approverJabatan: "Biro OSDMA",
          jenjang: 2,
          keputusan: "SETUJU",
          timestampAksi: new Date("2026-09-07T14:00:00Z"),
        },
      ];
      const steps = hitungTahapanStepper(bandingSetuju, logs);
      expect(steps[0].state).toBe("completed");
      expect(steps[1].state).toBe("completed");
      expect(steps[2].state).toBe("completed");
      expect(steps[3].state).toBe("completed");

      expect(steps[2].keterangan).toBe("Disetujui oleh Biro OSDMA");
      expect(steps[3].keterangan).toBe("Sinkronisasi selesai");
    });

    it("status DITOLAK di Kasubag TU: step 2 rejected", () => {
      const bandingTolak: BandingItem = {
        ...dummyBandingBaru,
        status: "DITOLAK",
      };
      const logs: ApprovalLogItem[] = [
        {
          id: "log-1",
          referensiTipe: "BANDING",
          referensiId: dummyBandingBaru.id,
          approverNip: "19800101",
          approverNama: "Kasubag TU",
          approverJabatan: "Kasubag TU",
          jenjang: 1,
          keputusan: "TOLAK",
          catatan: "Bukti pendukung tidak valid",
          timestampAksi: new Date("2026-09-06T09:00:00Z"),
        },
      ];
      const steps = hitungTahapanStepper(bandingTolak, logs);
      expect(steps[0].state).toBe("completed");
      expect(steps[1].state).toBe("rejected");
      expect(steps[2].state).toBe("pending");
      expect(steps[3].state).toBe("pending");

      expect(steps[1].keterangan).toBe("Ditolak oleh Kasubag TU");
    });
  });

  describe("bangunTimelineCheckpoints", () => {
    it("menghasilkan timeline berurutan dari yang terbaru di atas", () => {
      const logs: ApprovalLogItem[] = [
        {
          id: "log-1",
          referensiTipe: "BANDING",
          referensiId: dummyBandingBaru.id,
          approverNip: "19800101",
          approverNama: "Kasubag TU",
          approverJabatan: "Kasubag TU",
          jenjang: 1,
          keputusan: "SETUJU",
          timestampAksi: new Date("2026-09-06T09:00:00Z"),
        },
      ];
      const checkpoints = bangunTimelineCheckpoints(
        { ...dummyBandingBaru, status: "MENUNGGU_APPROVAL_FINAL" },
        logs
      );

      expect(checkpoints.length).toBeGreaterThanOrEqual(2);
      expect(checkpoints[0].isLatest).toBe(true);
      expect(checkpoints[0].tanggal.getTime()).toBeGreaterThanOrEqual(checkpoints[1].tanggal.getTime());
    });
  });
});

