import { describe, expect, it } from "vitest";
import { jamTeks, labelStatus, namaHari, tanggalTeks } from "../presensiTampilan";

describe("jamTeks", () => {
  it("membaca jam sebagai waktu dinding UTC, bukan zona server", () => {
    // Baris presensi ditulis menitKeWaktu() sebagai Date.UTC(y, m, d, jam, menit).
    // Kalau dibaca pakai getHours(), di server ber-WIB angkanya bergeser 7 jam
    // dan 07:25 tampil jadi 14:25 - lalu menit keterlambatannya ikut salah.
    expect(jamTeks(new Date(Date.UTC(2026, 7, 5, 7, 25)))).toBe("07:25");
    expect(jamTeks(new Date(Date.UTC(2026, 7, 5, 16, 3)))).toBe("16:03");
  });

  it("jam kosong jadi tanda hubung, bukan 00:00", () => {
    // 00:00 adalah jam yang sah; memakainya untuk "tidak ada data" berarti
    // presensi tengah malam tidak bisa dibedakan dari yang tidak menempel.
    expect(jamTeks(null)).toBe("-");
  });
});

describe("labelStatus", () => {
  it("menerjemahkan status yang dikenal", () => {
    expect(labelStatus("ALPHA")).toBe("Tidak hadir (alpha)");
    expect(labelStatus("TIDAK_PRESENSI")).toBe("Tidak presensi");
  });

  it("status baru dari e-Presensi tampil apa adanya, tidak jadi sel kosong", () => {
    expect(labelStatus("STATUS_BARU_ENTAH_APA")).toBe("STATUS_BARU_ENTAH_APA");
    expect(labelStatus("")).toBe("");
  });
});

describe("namaHari & tanggalTeks", () => {
  it("memakai UTC supaya tidak bergeser sehari", () => {
    // 1 Agustus 2026 jatuh hari Sabtu.
    expect(namaHari(new Date(Date.UTC(2026, 7, 1)))).toBe("Sabtu");
    expect(tanggalTeks(new Date(Date.UTC(2026, 7, 1)))).toContain("01");
    expect(tanggalTeks(new Date(Date.UTC(2026, 7, 1)))).toContain("2026");
  });

  it("tengah malam UTC tetap tanggal yang sama, bukan mundur sehari", () => {
    expect(namaHari(new Date(Date.UTC(2026, 7, 3, 0, 0)))).toBe("Senin");
  });
});
