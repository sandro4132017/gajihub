import { labelSistemKerja } from "../../../../business-logic/exportPresensiHarian";
import { teksKeteranganPotongan } from "../../../../business-logic/rincianJamKerjaHarian";
import { NAMA_HARI, lemburTeks } from "../../../../lib/format/presensiTampilan";
import { labelJenisCutiHarian } from "../../../../lib/format/rincianCuti";
import type { BarisTabelRincianJamKerja } from "../[nip]/TabelRincianJamKerja";

/**
 * Lembar "Master Presensi" dan "Rekap Hadir" untuk Excel presensi unit -
 * BENTUKNYA mengikuti template Kasubag TU (`docs/jam_absensi.xlsx`,
 * 2026-11-25), ANGKANYA hasil hitungan Gajihub (keputusan user 2026-11-25).
 *
 * Template aslinya berumus (0,5% per 30 menit, maksimal 2%). Rumus itu TIDAK
 * disalin: yang ditulis nilai dari `susunBarisHarianPegawai` - fungsi yang
 * sama dengan halaman pegawai & mesin potongan Pasal 13 - supaya Excel ini
 * tidak bercerita beda dengan Tukin yang dibayar. Murni, tanpa prisma.
 */

export type SelExcel = string | number | Date | null;

/** Satu hari presensi, sejajar dengan baris rincian yang sudah disusun. */
export interface HariMaster {
  tanggal: Date;
  statusKehadiran: string;
  namaSistemKerja: string | null;
  tidakIkutUpacara: boolean;
}

export interface PegawaiMaster {
  nama: string;
  nip: string;
  golongan: string | null;
  harian: readonly HariMaster[];
  /** Hasil `susunBarisHarianPegawai(harian, ...)`, urutan sama dengan `harian`. */
  rincian: readonly BarisTabelRincianJamKerja[];
  /** Dari rekap bulanan - penentu "bulan ke berapa" cuti sakit / cuti besar. */
  cutiRekap: { jenisCutiAktif: string | null; bulanCutiKeberapa: number | null } | null;
}

export const HEADER_MASTER_PRESENSI = [
  "No",
  "Nama Pegawai",
  "NIP",
  "Tanggal",
  "Hari",
  "Status",
  "Keterangan Cuti",
  "Checkin",
  "Checkout",
  "Jam Harus Checkout",
  "Jam Masuk",
  "Jam Toleransi Masuk",
  "Jam Pulang",
  "Jam Toleransi Pulang",
  "Terlambat",
  "Menit Kerja",
  "Kekurangan Jam Kerja",
  "Jumlah Menit Kekurangan Harian",
  "Persentase Potongan Harian",
  "Keterangan Potongan",
] as const;

/** Lebar kolom, diukur dari template. */
export const LEBAR_MASTER_PRESENSI = [5, 40, 21, 20, 12, 20, 22, 10, 10, 20, 11, 21, 12, 21, 13, 12, 20, 29, 25, 60];

/** Kolom berformat jam (1-based): Checkin s.d. Jam Toleransi Pulang. */
export const KOLOM_JAM_MASTER = [8, 9, 10, 11, 12, 13, 14];

/** Menit sejak tengah malam -> pecahan hari (nilai jam Excel). null tetap kosong. */
export function jamExcel(menit: number | null): number | null {
  return menit === null ? null : menit / 1440;
}

/** Keterangan Cuti: jenis cuti, lupa absen, tap tidak wajar, atau nama hari libur. */
function keteranganHari(h: HariMaster, r: BarisTabelRincianJamKerja): string {
  const t: string[] = [];
  if (h.statusKehadiran === "CUTI") t.push(labelJenisCutiHarian(h.namaSistemKerja));
  // Termasuk jam keluar 23:59 (isian otomatis e-Presensi saat tap pulang
  // tidak masuk). Rinciannya ada di kolom Keterangan Potongan.
  if (r.kejadianTidakPresensi > 0 || r.rincian.tapTidakWajar) t.push("Lupa Absen");
  if (r.keteranganLibur) t.push(r.keteranganLibur);
  else if (r.rincian.hariLibur) t.push("Akhir pekan");
  if (r.rincian.hariLibur && r.jamLembur > 0) t.push(`Lembur ${lemburTeks(r.jamLembur)}`);
  return t.join("; ");
}

export function susunLembarMasterPresensi(pegawai: readonly PegawaiMaster[]): SelExcel[][] {
  const baris: SelExcel[][] = [];
  pegawai.forEach((p, i) => {
    p.harian.forEach((h, j) => {
      const r = p.rincian[j];
      const x = r.rincian;
      // Hari libur (akhir pekan / tanggal merah): tidak ada jadwal wajib, jadi
      // kolom jadwal "-" dan terlambat/kekurangan 0 - tidak ada potongan.
      // Menit kerja tetap dihitung (tanpa istirahat) bila kedua tap ada.
      const libur = x.hariLibur;
      // Yang tidak bisa dihitung (cuti, alpa, lupa absen) ditulis "-", bukan kosong.
      const jadwal = (menit: number | null) => (libur ? "-" : (jamExcel(menit) ?? "-"));
      const nolKalauLibur = (n: number | null) => (libur ? (n ?? 0) : (n ?? "-"));
      const menitKerja =
        libur && x.jamMasukMenit !== null && x.jamKeluarMenit !== null && x.jamKeluarMenit > x.jamMasukMenit
          ? x.jamKeluarMenit - x.jamMasukMenit
          : x.menitKerja;
      baris.push([
        i + 1,
        p.nama,
        p.nip,
        h.tanggal,
        NAMA_HARI[h.tanggal.getUTCDay()],
        // Cuti cukup "Cuti"; jenisnya di kolom Keterangan Cuti.
        h.statusKehadiran === "CUTI" ? "Cuti" : labelSistemKerja(h.namaSistemKerja, h.statusKehadiran),
        keteranganHari(h, r),
        // Tanpa ketukan ditulis 00:00 (cuti, alpa, lupa absen), seperti template.
        jamExcel(x.jamMasukMenit) ?? 0,
        jamExcel(x.jamKeluarMenit) ?? 0,
        // Sama dengan kolom "Jam harus pulang" di halaman pegawai.
        jadwal(x.batasLemburMenit),
        jadwal(x.jamMasukWajibMenit),
        jadwal(x.jamToleransiMasukMenit),
        jadwal(x.jamPulangWajibMenit),
        jadwal(x.jamToleransiPulangMenit),
        nolKalauLibur(x.menitTerlambat),
        menitKerja ?? "-",
        nolKalauLibur(x.kekuranganJamKerjaMenit),
        nolKalauLibur(x.totalMenitKekuranganHarian),
        Math.round(r.potonganPersen * 1e6) / 1e6,
        teksKeteranganPotongan(r.bagianPotongan),
      ]);
    });
  });
  return baris;
}

export const HEADER_REKAP_HADIR = [
  "No",
  "Nama Pegawai",
  "NIP",
  "GOL",
  "Hari Kerja",
  "Hasil Akhir Flexible Time",
  "% Pot",
  "Tidak Hadir",
  "Alpa",
  "Dinas",
  "Sakit",
  "CT Gugur Kandungan",
  "Cuti Thn",
  "Cuti Melahirkan",
  "Cuti Sakit I",
  "Cuti Sakit Bln II",
  "Cuti Sakit Bln III",
  "Cuti Sakit >  3 Bulan",
  "Izin",
  "CT B/ CT AP < 1 Bln",
  "CT Bsr Bln I",
  "CT Besar Bln II",
  "CT Besar Bln III",
  "TB",
  "CPNS",
  "Diklat",
  "TDK UPC",
  "Keterangan",
] as const;

export const LEBAR_REKAP_HADIR = [5, 35, 21, 7, 10, 14, 9, 11, 7, 7, 7, 11, 9, 10, 9, 10, 10, 11, 7, 12, 10, 10, 10, 6, 7, 7, 9, 45];

/** Indeks kolom (0-based di HEADER_REKAP_HADIR), Alpa s.d. TDK UPC. */
const KOLOM = {
  alpa: 8, dinas: 9, sakit: 10, gugur: 11, tahunan: 12, melahirkan: 13,
  sakit1: 14, sakit2: 15, sakit3: 16, sakitLebih3: 17, izin: 18, besarKurang1AtauAp: 19,
  besar1: 20, besar2: 21, besar3: 22, tb: 23, cpns: 24, diklat: 25, tdkUpc: 26,
} as const;

/**
 * "Bulan ke berapa" dari label e-Presensi: "Cuti Sakit <1 bulan" / "Bulan I"
 * = 1, "Cuti Besar II" = 2. null kalau labelnya tidak menyebut.
 */
function bulanDariLabel(j: string): number | null {
  if (/<\s*1\s*bulan/.test(j)) return 1;
  const m = /\s(iii|ii|i)$/.exec(j.trim());
  return m ? m[1].length : null;
}

/**
 * Kolom cuti untuk satu hari cuti. Bulan ke berapa diambil dari label harian
 * e-Presensi, kalau tidak ada dari rekap bulanan. null = tidak bisa
 * ditempatkan tanpa menebak - hari itu disebut di kolom Keterangan, tidak
 * dimasukkan ke kolom mana pun (juga CLTN, "Cuti - Libur", cuti tanpa jenis).
 */
function kolomCuti(jenis: string, cuti: PegawaiMaster["cutiRekap"]): number | null {
  const j = jenis.toLowerCase();
  const bulanLabel = bulanDariLabel(j);
  if (j.includes("gugur")) return KOLOM.gugur;
  if (j.includes("tahunan")) return KOLOM.tahunan;
  if (j.includes("melahirkan") || j.includes("bersalin")) return KOLOM.melahirkan;
  if (j.includes("alasan penting")) return KOLOM.besarKurang1AtauAp;
  if (j.includes("sakit")) {
    const bulanKe = bulanLabel ?? (cuti?.jenisCutiAktif === "CUTI_SAKIT" ? (cuti.bulanCutiKeberapa ?? null) : null);
    if (bulanKe === null) return null;
    if (bulanKe <= 1) return KOLOM.sakit1;
    if (bulanKe === 2) return KOLOM.sakit2;
    if (bulanKe === 3) return KOLOM.sakit3;
    return KOLOM.sakitLebih3;
  }
  if (j.includes("besar")) {
    if (/<\s*1\s*bulan/.test(j) || cuti?.jenisCutiAktif === "CUTI_BESAR_KURANG_1_BULAN") return KOLOM.besarKurang1AtauAp;
    const bulanKe = bulanLabel ?? (cuti?.jenisCutiAktif === "CUTI_BESAR" ? (cuti.bulanCutiKeberapa ?? null) : null);
    if (bulanKe === null || bulanKe > 3) return null;
    if (bulanKe <= 1) return KOLOM.besar1;
    if (bulanKe === 2) return KOLOM.besar2;
    return KOLOM.besar3;
  }
  return null;
}

const KOLOM_STATUS: Record<string, number> = {
  ALPHA: KOLOM.alpa,
  DINAS_LUAR: KOLOM.dinas,
  SAKIT: KOLOM.sakit,
  IZIN: KOLOM.izin,
  TUGAS_BELAJAR: KOLOM.tb,
  DIKLAT: KOLOM.diklat,
};

/**
 * Satu baris per pegawai. Hari kerja = hari presensi yang bukan akhir pekan /
 * libur nasional. Flexible Time = jumlah menit kekurangan harian; % Pot =
 * jumlah persentase potongan harian (sama dengan lembar Master Presensi).
 * Kolom CPNS tidak punya sumber data - dibiarkan kosong.
 */
export function susunLembarRekapHadir(pegawai: readonly PegawaiMaster[]): SelExcel[][] {
  return pegawai.map((p, i) => {
    const hitung = new Array<number>(KOLOM.tdkUpc - KOLOM.alpa + 1).fill(0);
    const tambah = (kolom: number) => {
      hitung[kolom - KOLOM.alpa] += 1;
    };
    const tanpaKolom = new Map<string, number>();
    let hariKerja = 0;
    let menitFlexi = 0;
    let persen = 0;

    p.harian.forEach((h, j) => {
      const r = p.rincian[j];
      persen += r.potonganPersen;
      if (r.rincian.hariLibur) return;
      hariKerja += 1;
      menitFlexi += r.rincian.totalMenitKekuranganHarian ?? 0;
      if (h.tidakIkutUpacara) tambah(KOLOM.tdkUpc);
      if (h.statusKehadiran === "CUTI") {
        const jenis = labelJenisCutiHarian(h.namaSistemKerja);
        const k = kolomCuti(jenis, p.cutiRekap);
        if (k === null) tanpaKolom.set(jenis, (tanpaKolom.get(jenis) ?? 0) + 1);
        else tambah(k);
        return;
      }
      const k = KOLOM_STATUS[h.statusKehadiran];
      if (k !== undefined) tambah(k);
    });

    // Tidak Ikut Upacara bukan hari tidak hadir - tidak ikut dijumlah.
    const tidakHadir = hitung.reduce((t, x, idx) => (idx + KOLOM.alpa === KOLOM.tdkUpc ? t : t + x), 0);
    const sel: SelExcel[] = hitung.map((x, idx) => (idx + KOLOM.alpa === KOLOM.cpns ? null : x));
    const keterangan = [...tanpaKolom].map(([jenis, n]) => `${jenis} ${n} hari`).join("; ");

    return [
      i + 1,
      p.nama,
      p.nip,
      p.golongan ?? "",
      hariKerja,
      menitFlexi,
      // Pecahan, diformat persen di lembarnya. Dibulatkan supaya 0,1 + 0,2
      // tidak tertulis 0,30000000000000004.
      Math.round(persen * 1e6) / 1e6,
      tidakHadir,
      ...sel,
      keterangan,
    ];
  });
}
