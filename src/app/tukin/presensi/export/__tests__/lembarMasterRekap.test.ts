import { describe, expect, it } from "vitest";
import { susunBarisHarianPegawai } from "../../[nip]/barisHarianPegawai";
import {
  HEADER_MASTER_PRESENSI,
  HEADER_REKAP_HADIR,
  jamExcel,
  susunLembarMasterPresensi,
  susunLembarRekapHadir,
  type PegawaiMaster,
} from "../lembarMasterRekap";

const jam = (iso: string, hhmm: string) => new Date(`${iso}T${hhmm}:00Z`);
const hari = (iso: string, o: Record<string, unknown> = {}) => ({
  tanggal: new Date(`${iso}T00:00:00Z`),
  statusKehadiran: "WFO",
  namaSistemKerja: null as string | null,
  jamMasuk: jam(iso, "07:20") as Date | null,
  jamKeluar: jam(iso, "16:05") as Date | null,
  menitTerlambat: 0,
  menitPulangCepat: 0,
  menitMeninggalkanKantor: 0,
  tidakIkutUpacara: false,
  jamLembur: 0,
  ...o,
});

function pegawai(harian: ReturnType<typeof hari>[], cutiRekap: PegawaiMaster["cutiRekap"] = null): PegawaiMaster {
  return {
    nama: "Pegawai Contoh",
    nip: "199001012020121001", // sensitive-ok
    golongan: "III/a",
    harian,
    rincian: susunBarisHarianPegawai(harian, {
      petaKoreksi: new Map(),
      tanggalKendala: new Set(),
      hariLibur: new Map([["2026-10-12", "Libur Contoh"]]),
    }),
    cutiRekap,
  };
}

describe("lembar Master Presensi", () => {
  it("kolom mengikuti template, plus keterangan potongan", () => {
    expect(HEADER_MASTER_PRESENSI.slice(0, 19)).toEqual([
      "No", "Nama Pegawai", "NIP", "Tanggal", "Hari", "Status", "Keterangan Cuti", "Checkin", "Checkout",
      "Jam Harus Checkout", "Jam Masuk", "Jam Toleransi Masuk", "Jam Pulang", "Jam Toleransi Pulang",
      "Terlambat", "Menit Kerja", "Kekurangan Jam Kerja", "Jumlah Menit Kekurangan Harian",
      "Persentase Potongan Harian",
    ]);
  });

  it("hari normal: jam sebagai nilai jam Excel, jadwal 07.30/08.30/16.00/17.00", () => {
    const [b] = susunLembarMasterPresensi([pegawai([hari("2026-10-05")])]);
    expect(b).toHaveLength(HEADER_MASTER_PRESENSI.length);
    expect(b[0]).toBe(1);
    expect(b[4]).toBe("Senin");
    expect(b[5]).toBe("WFO");
    expect(b[7]).toBe(jamExcel(7 * 60 + 20));
    expect(b[10]).toBe(jamExcel(7 * 60 + 30));
    expect(b[11]).toBe(jamExcel(8 * 60 + 30));
    expect(b[12]).toBe(jamExcel(16 * 60));
    expect(b[13]).toBe(jamExcel(17 * 60));
    expect(b[15]).toBe(16 * 60 + 5 - (7 * 60 + 20) - 60);
    expect(b[18]).toBe(0);
  });

  it("angka potongan sama dengan susunBarisHarianPegawai", () => {
    const p = pegawai([hari("2026-10-06", { jamMasuk: jam("2026-10-06", "08:50"), menitTerlambat: 20 })]);
    const [b] = susunLembarMasterPresensi([p]);
    expect(b[18]).toBe(p.rincian[0].potonganPersen);
    expect(b[18]).toBeGreaterThan(0);
    expect(String(b[19])).toContain("Terlambat");
  });

  it("tanpa tap = Lupa Absen; cuti menyebut jenisnya", () => {
    const [lupa, cuti] = susunLembarMasterPresensi([
      pegawai([
        hari("2026-10-07", { jamMasuk: null, jamKeluar: null }),
        hari("2026-10-08", { statusKehadiran: "CUTI", namaSistemKerja: "Cuti - Cuti Tahunan", jamMasuk: null, jamKeluar: null }),
      ]),
    ]);
    expect(lupa[6]).toBe("Lupa Absen");
    const [pulang2359] = susunLembarMasterPresensi([pegawai([hari("2026-10-09", { jamKeluar: jam("2026-10-09", "23:59") })])]);
    expect(pulang2359[6]).toBe("Lupa Absen");
    expect(lupa[7]).toBe(0);
    expect(lupa[8]).toBe(0);
    expect(cuti[7]).toBe(0);
    expect(cuti.slice(15, 18)).toEqual(["-", "-", "-"]);
    expect(cuti[5]).toBe("Cuti");
    expect(cuti[6]).toBe("Cuti Tahunan");
  });
});

describe("lembar Master Presensi - hari libur", () => {
  it("lembur akhir pekan: jadwal '-', potongan 0, menit kerja tanpa istirahat, lembur di keterangan", () => {
    const iso = "2026-10-10"; // Sabtu
    const [b] = susunLembarMasterPresensi([
      pegawai([hari(iso, { statusKehadiran: "LEMBUR", jamMasuk: jam(iso, "08:00"), jamKeluar: jam(iso, "14:00"), jamLembur: 6 })]),
    ]);
    expect(b.slice(9, 14)).toEqual(["-", "-", "-", "-", "-"]);
    expect(b[14]).toBe(0);
    expect(b[15]).toBe(360);
    expect(b[16]).toBe(0);
    expect(b[17]).toBe(0);
    expect(b[18]).toBe(0);
    expect(b[6]).toBe("Akhir pekan; Lembur 6 jam");
  });
});

describe("lembar Rekap Hadir", () => {
  const kol = (nama: string) => HEADER_REKAP_HADIR.indexOf(nama as (typeof HEADER_REKAP_HADIR)[number]);

  it("menghitung per jenis, hari libur tidak dihitung hari kerja", () => {
    const [b] = susunLembarRekapHadir([
      pegawai([
        hari("2026-10-05"),
        hari("2026-10-06", { statusKehadiran: "ALPHA", jamMasuk: null, jamKeluar: null }),
        hari("2026-10-07", { statusKehadiran: "DINAS_LUAR" }),
        hari("2026-10-08", { statusKehadiran: "CUTI", namaSistemKerja: "Cuti - Cuti Tahunan", jamMasuk: null, jamKeluar: null }),
        hari("2026-10-09", { statusKehadiran: "DIKLAT", tidakIkutUpacara: true }),
        hari("2026-10-12", { statusKehadiran: "LIBUR", jamMasuk: null, jamKeluar: null }),
      ]),
    ]);
    expect(b).toHaveLength(HEADER_REKAP_HADIR.length);
    expect(b[kol("GOL")]).toBe("III/a");
    expect(b[kol("Hari Kerja")]).toBe(5);
    expect(b[kol("Alpa")]).toBe(1);
    expect(b[kol("Dinas")]).toBe(1);
    expect(b[kol("Cuti Thn")]).toBe(1);
    expect(b[kol("Diklat")]).toBe(1);
    expect(b[kol("TDK UPC")]).toBe(1);
    expect(b[kol("Tidak Hadir")]).toBe(4);
    expect(b[kol("CPNS")]).toBeNull();
    expect(b[kol("% Pot")]).toBeGreaterThanOrEqual(0.03);
  });

  it("cuti sakit ikut bulan ke berapa di rekap; tanpa itu masuk Keterangan, tidak ditebak", () => {
    const sakit = hari("2026-10-05", { statusKehadiran: "CUTI", namaSistemKerja: "Cuti - Cuti Sakit", jamMasuk: null, jamKeluar: null });
    const cutiLabel = (label: string) =>
      hari("2026-10-06", { statusKehadiran: "CUTI", namaSistemKerja: label, jamMasuk: null, jamKeluar: null });
    const [dariLabel] = susunLembarRekapHadir([
      pegawai([cutiLabel("Cuti - Cuti Sakit <1 bulan"), cutiLabel("Cuti - Cuti Sakit Bulan II"), cutiLabel("Cuti - Cuti Besar III"), cutiLabel("Cuti - Cuti Besar <1 Bulan"), cutiLabel("Cuti - Cuti di Luar Tanggungan Negara")]),
    ]);
    expect(dariLabel[kol("Cuti Sakit I")]).toBe(1);
    expect(dariLabel[kol("Cuti Sakit Bln II")]).toBe(1);
    expect(dariLabel[kol("CT Besar Bln III")]).toBe(1);
    expect(dariLabel[kol("CT B/ CT AP < 1 Bln")]).toBe(1);
    expect(dariLabel[kol("Keterangan")]).toBe("Cuti di Luar Tanggungan Negara 1 hari");

    const [dgnRekap] = susunLembarRekapHadir([pegawai([sakit], { jenisCutiAktif: "CUTI_SAKIT", bulanCutiKeberapa: 2 })]);
    expect(dgnRekap[kol("Cuti Sakit Bln II")]).toBe(1);

    const [tanpaRekap] = susunLembarRekapHadir([pegawai([sakit])]);
    expect(tanpaRekap[kol("Cuti Sakit I")]).toBe(0);
    expect(tanpaRekap[kol("Keterangan")]).toBe("Cuti Sakit 1 hari");
  });
});
