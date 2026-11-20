import { describe, expect, it, vi } from "vitest";
import {
  jumlahPerintahDiAudit,
  jumlahPerintahSesudah,
  muatRekapSpkl,
  perintahTidakTermuat,
  susunRekapSpkl,
  type BarisPerintahRekap,
} from "../rekapSpklBulanan";
import { susunBarisLampiranSpkl } from "../../tte/spklBulananPdf";

const SATKER = "Biro Keuangan dan Barang Milik Negara";

const orang = (id: string, nip: string, nama: string, golongan: string | null, jam: number) => ({
  pegawaiId: id,
  nip, // sensitive-ok
  nama,
  golongan,
  jamDiperintahkan: jam,
});

const A = orang("a", "199001010000000021", "ZAINAL UJI", "III/c", 3); // sensitive-ok
const B = orang("b", "199001010000000022", "ANDI UJI", "II/d", 2); // sensitive-ok

const perintah = (tanggalIso: string, uraianTugas: string, anggota: BarisPerintahRekap["anggota"], kirim = "2026-12-10T03:00:00Z"): BarisPerintahRekap => ({
  tanggalIso,
  uraianTugas,
  dikirimPada: new Date(kirim),
  anggota,
});

describe("susunRekapSpkl", () => {
  it("mengurutkan pegawai menurut nama (judul), lalu NIP", () => {
    const hasil = susunRekapSpkl(
      [perintah("2026-12-10", "Laporan", [A, B]), perintah("2026-12-11", "Laporan", [{ ...A, pegawaiId: "c", nip: "199001010000000020" }])], // sensitive-ok
      SATKER,
      12,
      2026,
    );
    expect(hasil.anggota.map((x) => x.nama)).toEqual(["Andi Uji", "Zainal Uji", "Zainal Uji"]);
    // dua orang bernama sama: NIP lebih kecil lebih dulu
    expect(hasil.anggota[1].nip < hasil.anggota[2].nip).toBe(true);
  });

  it("menggabungkan tanggal dan uraian per pegawai (dipakai lampiran PDF)", () => {
    const hasil = susunRekapSpkl(
      [
        perintah("2026-12-14", "Menyusun laporan", [A]),
        perintah("2026-12-10", "Menyusun laporan", [A, B]),
        perintah("2026-12-12", "Rekonsiliasi", [A]),
      ],
      SATKER,
      12,
      2026,
    );
    const baris = susunBarisLampiranSpkl(hasil.anggota);
    const a = baris.find((r) => r[1].includes("Zainal"))!;
    expect(a[3]).toBe("10,12,14");
    expect(a[4]).toBe("- Menyusun laporan\n- Rekonsiliasi");
    expect(a[2]).toBe("III/c");
    const b = baris.find((r) => r[1].includes("Andi"))!;
    expect(b[3]).toBe("10");
  });

  it("ringkasan: perintah, pegawai, hari, total jam diperintahkan", () => {
    const hasil = susunRekapSpkl(
      [perintah("2026-12-10", "x", [A, B]), perintah("2026-12-10", "y", [{ ...A, pegawaiId: "c", nip: "199001010000000023" }]), perintah("2026-12-11", "z", [A])], // sensitive-ok
      SATKER,
      12,
      2026,
    );
    expect(hasil.ringkasan).toEqual({ jumlahPerintah: 3, jumlahPegawai: 3, jumlahHari: 2, totalJam: 3 + 2 + 3 + 3 });
  });

  it("golongan kosong dicetak '-'", () => {
    const hasil = susunRekapSpkl([perintah("2026-12-10", "x", [{ ...A, golongan: null }])], SATKER, 12, 2026);
    expect(hasil.anggota[0].golongan).toBe("-");
  });

  it("perintah di luar bulan atau sebelum gerbang pilot tidak ikut", () => {
    const hasil = susunRekapSpkl(
      [perintah("2026-11-30", "x", [A]), perintah("2027-01-01", "x", [A]), perintah("2026-12-02", "ok", [B])],
      SATKER,
      12,
      2026,
    );
    expect(hasil.anggota.map((x) => x.nip)).toEqual([B.nip]);
    // satker bukan pilot: tidak ada yang lolos gerbang
    expect(susunRekapSpkl([perintah("2026-12-02", "ok", [B])], "Biro Lain", 12, 2026).anggota).toEqual([]);
  });

  it("perintah tanpa anggota diabaikan; bulan kosong -> rekap kosong", () => {
    const hasil = susunRekapSpkl([perintah("2026-12-10", "x", [])], SATKER, 12, 2026);
    expect(hasil.anggota).toEqual([]);
    expect(hasil.ringkasan).toEqual({ jumlahPerintah: 0, jumlahPegawai: 0, jumlahHari: 0, totalJam: 0 });
  });

  it("mencatat waktu kirim hanya dari perintah yang ikut", () => {
    const hasil = susunRekapSpkl(
      [perintah("2026-12-10", "x", [A], "2026-12-10T03:00:00Z"), perintah("2026-11-10", "x", [A], "2026-11-10T03:00:00Z")],
      SATKER,
      12,
      2026,
    );
    expect(hasil.waktuKirim).toEqual([new Date("2026-12-10T03:00:00Z")]);
  });
});

describe("jumlahPerintahSesudah", () => {
  it("menghitung yang terkirim lebih lambat dari waktu tanda tangan", () => {
    const ttd = new Date("2026-12-31T05:00:00Z");
    const w = [new Date("2026-12-31T04:59:59Z"), new Date("2026-12-31T05:00:00Z"), new Date("2026-12-31T05:00:01Z")];
    expect(jumlahPerintahSesudah(w, ttd)).toBe(1);
  });
});

describe("perintahTidakTermuat", () => {
  const dibuat = new Date("2026-12-31T05:00:00Z");
  // Perintah terkirim 04:59:59 = SEBELUM dokumen dibuat tetapi SESUDAH rekap dimuat.
  const w = [new Date("2026-12-30T01:00:00Z"), new Date("2026-12-31T04:59:59Z")];

  it("memakai selisih jumlah dengan catatan audit: perintah yang lolos di jendela BSrE tetap terhitung", () => {
    expect(perintahTidakTermuat({ waktuKirim: w, jumlahSaatIni: 2, jumlahDiDokumen: 1, dokumenDibuat: dibuat })).toBe(1);
    // pembanding waktu saja akan melewatkannya
    expect(jumlahPerintahSesudah(w, dibuat)).toBe(0);
  });

  it("jumlah sama -> 0; tidak pernah negatif", () => {
    expect(perintahTidakTermuat({ waktuKirim: w, jumlahSaatIni: 2, jumlahDiDokumen: 2, dokumenDibuat: dibuat })).toBe(0);
    expect(perintahTidakTermuat({ waktuKirim: w, jumlahSaatIni: 1, jumlahDiDokumen: 2, dokumenDibuat: dibuat })).toBe(0);
  });

  it("tanpa catatan audit, jatuh ke perbandingan waktu terhadap DokumenTte.createdAt", () => {
    const sesudah = [...w, new Date("2026-12-31T05:00:01Z")];
    expect(perintahTidakTermuat({ waktuKirim: sesudah, jumlahSaatIni: 3, jumlahDiDokumen: null, dokumenDibuat: dibuat })).toBe(1);
  });
});

describe("jumlahPerintahDiAudit", () => {
  it("membaca angka yang sah, selain itu null", () => {
    expect(jumlahPerintahDiAudit({ jumlahPerintah: 4 })).toBe(4);
    expect(jumlahPerintahDiAudit({ jumlahPerintah: "4" })).toBeNull();
    expect(jumlahPerintahDiAudit({ jumlahPerintah: -1 })).toBeNull();
    expect(jumlahPerintahDiAudit(null)).toBeNull();
    expect(jumlahPerintahDiAudit({})).toBeNull();
  });
});

describe("muatRekapSpkl", () => {
  it("satu query PerintahLembur: satker persis, TERKIRIM, rentang bulan, anggota terkirim", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        tanggal: new Date(Date.UTC(2026, 11, 10)),
        uraianTugas: "Laporan",
        dikirimPada: new Date("2026-12-10T03:00:00Z"),
        anggota: [{ pegawaiId: "a", jamDiperintahkan: 3, pegawai: { nip: A.nip, nama: A.nama, golongan: "III/c" } }],
      },
    ]);
    const hasil = await muatRekapSpkl({ perintahLembur: { findMany } } as never, SATKER, 12, 2026);
    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.satuanKerja).toBe(SATKER);
    expect(arg.where.status).toBe("TERKIRIM");
    expect(arg.where.tanggal).toEqual({ gte: new Date(Date.UTC(2026, 11, 1)), lt: new Date(Date.UTC(2027, 0, 1)) });
    expect(arg.select.anggota.where).toEqual({ terkirim: true });
    expect(hasil.ringkasan.jumlahPerintah).toBe(1);
    expect(hasil.anggota[0].nama).toBe("Zainal Uji");
  });
});
