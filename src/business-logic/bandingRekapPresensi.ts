// ============================================================================
// Membandingkan rekap presensi PETUGAS (berkas Excel manual) dengan rekap
// GAJIHUB (hasil tarikan e-Presensi) - per hari dan per pegawai.
//
// TIDAK MENULIS APA PUN. Modul ini murni menyusun daftar beda; keputusan mana
// yang benar tetap di tangan manusia. Selama masa transisi, berkas petugaslah
// yang menentukan pembayaran, jadi setiap beda yang tidak bisa dijelaskan
// adalah calon salah bayar - dan justru itu yang harus kelihatan.
//
// PURE - tidak ada I/O.
//
// PRINSIP YANG MENENTUKAN BENTUK MODUL INI: yang dibandingkan adalah
// KELUARAN MESIN YANG SAMA atas DUA SUMBER DATA. Kedua sisi sudah lebih dulu
// dilewatkan `rekapDariLaporanPdf()`, jadi kalau hasilnya beda, penyebabnya
// pasti datanya - bukan dua rumus yang diam-diam berlainan.
// ============================================================================

import type { BarisRekapPresensi } from "./rekapPresensi";
import { hitungPotonganKehadiranPersen } from "./tukin";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "./tarifTukinPokok";
import { JAM_TAP_PULANG_HILANG } from "./rincianJamKerjaHarian";

/** Bobot komponen kehadiran - Pasal 5 ayat (2) huruf b Permenaker 15/2024. */
const BOBOT_KEHADIRAN = 0.3;

/** Bentuk paling kecil yang cukup untuk membandingkan satu hari. */
export interface HariDibandingkan {
  tanggalIso: string;
  /** Nilai enum `StatusKehadiran` (lihat STATUS_HARIAN di presensiKeDb.ts). */
  status: string;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
}

export type JenisBeda = "STATUS" | "JAM_MASUK" | "JAM_KELUAR" | "HANYA_PETUGAS" | "HANYA_GAJIHUB";

export interface BedaHarian {
  tanggalIso: string;
  jenis: JenisBeda;
  petugas: string;
  gajihub: string;
  /**
   * false = sudah dipastikan TIDAK menggeser rupiah (mis. WFO vs WFH - sama
   * perlakuannya untuk Pasal 13 maupun uang makan). Dipisah supaya beda yang
   * benar-benar penting tidak tenggelam di antara puluhan beda kosmetik.
   */
  berdampak: boolean;
  keterangan: string;
}

export interface BedaAngkaRekap {
  label: string;
  petugas: number;
  gajihub: number;
  satuan: string;
}

export interface HasilBandingPegawai {
  nip: string;
  nama: string;
  satuanKerja: string;
  kelasJabatan: number | null;
  jumlahHariPetugas: number;
  jumlahHariGajihub: number;
  jumlahHariDibandingkan: number;
  bedaHarian: BedaHarian[];
  bedaAngka: BedaAngkaRekap[];
  /**
   * Potongan Pasal 13, dalam SATUAN PERSEN dari bobot kehadiran (0,99 = 0,99%).
   *
   * `hitungPotonganKehadiranPersen()` sendiri mengembalikan PECAHAN (0,0099) -
   * bentuk yang langsung dikalikan ke rupiah di `tukin.ts`. Di sini sengaja
   * dikali 100 karena angkanya dibaca manusia di layar, dan "0,0099" terbaca
   * seperti seperseratus persen.
   */
  potonganPersenPetugas: number;
  potonganPersenGajihub: number;
  /**
   * Selisih rupiah pada komponen kehadiran (tarif kelas x 30% x selisih persen).
   * POSITIF = Gajihub membayar LEBIH BESAR daripada hitungan petugas.
   * null kalau kelas jabatannya tidak diketahui - JANGAN ditebak, salah kelas
   * berarti salah tarif berarti salah nominal.
   */
  selisihRupiah: number | null;
}

/**
 * Status yang untuk keperluan pembayaran diperlakukan SAMA.
 *
 * WFO dan WFH/WFA sama-sama masuk `KATEGORI_WAJIB_JAM_KERJA` (kena Pasal 13
 * ayat (3)) DAN sama-sama berhak uang makan dengan tarif yang sama (SBM 2026
 * item 22.1) - jadi tertukar di antara keduanya tidak menggeser rupiah sama
 * sekali. "HADIR"/"TERLAMBAT" adalah nilai lama yang artinya WFO.
 */
const SETARA: Record<string, string> = {
  HADIR: "WFO",
  TERLAMBAT: "WFO",
  WFO: "WFO",
  WFH: "WFH_WFA",
  WFA: "WFH_WFA",
  WFH_WFA: "WFH_WFA",
};

const KELOMPOK_WAJIB_JAM_KERJA = new Set(["WFO", "WFH_WFA"]);

function normalStatus(s: string): string {
  const t = (s ?? "").trim().toUpperCase();
  return SETARA[t] ?? t;
}

function jamTeks(menit: number | null): string {
  if (menit === null) return "(kosong)";
  return `${String(Math.floor(menit / 60)).padStart(2, "0")}:${String(menit % 60).padStart(2, "0")}`;
}

/**
 * "Tidak ada ketukan pulang yang sah" - dua sumber menuliskannya BEDA, dan
 * kalau tidak disamakan dulu, setiap kejadian yang sebenarnya DISEPAKATI
 * kedua sisi malah muncul sebagai selisih.
 *
 *   e-Presensi (Gajihub) : jam keluar diisi 23:59
 *   berkas petugas       : kolomnya dikosongkan parser (ketukan pagi/ganda)
 *
 * Bahwa 23:59 memang isian otomatis, bukan jam pulang sungguhan, sudah
 * terukur: 3.320 baris jatuh persis di menit yang sama lawan 456 yang tersebar
 * di 59 menit lain sepanjang jam 23 - manusia tidak menekan tombol serentak di
 * satu menit.
 */
function ketukanPulang(menit: number | null): number | null {
  return menit === JAM_TAP_PULANG_HILANG ? null : menit;
}

/**
 * Beda status ini menggeser rupiah atau tidak?
 *
 * TIDAK, hanya kalau keduanya sama-sama WFO/WFH-WFA: perlakuan Pasal 13 dan
 * uang makannya identik. Selain itu SELALU dianggap berdampak - lebih baik
 * menyodorkan beda yang ternyata tidak penting daripada menyembunyikan yang
 * penting.
 */
function statusBerdampak(a: string, b: string): boolean {
  return !(KELOMPOK_WAJIB_JAM_KERJA.has(a) && KELOMPOK_WAJIB_JAM_KERJA.has(b));
}

function bandingHarian(petugas: HariDibandingkan[], gajihub: HariDibandingkan[]): BedaHarian[] {
  const pG = new Map(gajihub.map((h) => [h.tanggalIso, h]));
  const pP = new Map(petugas.map((h) => [h.tanggalIso, h]));
  const beda: BedaHarian[] = [];

  for (const p of petugas) {
    const g = pG.get(p.tanggalIso);
    if (!g) {
      beda.push({
        tanggalIso: p.tanggalIso,
        jenis: "HANYA_PETUGAS",
        petugas: p.status,
        gajihub: "(tidak ada baris)",
        berdampak: true,
        keterangan: "Tanggal ini ada di berkas petugas tapi tidak ada di data Gajihub.",
      });
      continue;
    }
    const sp = normalStatus(p.status);
    const sg = normalStatus(g.status);
    if (sp !== sg) {
      const dampak = statusBerdampak(sp, sg);
      beda.push({
        tanggalIso: p.tanggalIso,
        jenis: "STATUS",
        petugas: p.status,
        gajihub: g.status,
        berdampak: dampak,
        keterangan: dampak
          ? "Status berbeda - bisa menggeser potongan Pasal 13 dan/atau hari uang makan."
          : "WFO dan WFH/WFA diperlakukan sama untuk potongan maupun uang makan - tidak menggeser rupiah.",
      });
    }
    if (p.jamMasukMenit !== g.jamMasukMenit) {
      beda.push({
        tanggalIso: p.tanggalIso,
        jenis: "JAM_MASUK",
        petugas: jamTeks(p.jamMasukMenit),
        gajihub: jamTeks(g.jamMasukMenit),
        // Cuma menggeser rupiah kalau harinya memang wajib jam kerja.
        berdampak: KELOMPOK_WAJIB_JAM_KERJA.has(sp) || KELOMPOK_WAJIB_JAM_KERJA.has(sg),
        keterangan: "Jam masuk berbeda - menentukan menit keterlambatan (Pasal 13 ayat (3)).",
      });
    }
    // Dibandingkan SESUDAH disamakan: dua sumber menuliskan "tap pulang
    // hilang" dengan cara berbeda, dan itu kesepakatan - bukan selisih.
    const keluarP = ketukanPulang(p.jamKeluarMenit);
    const keluarG = ketukanPulang(g.jamKeluarMenit);
    if (keluarP !== keluarG) {
      const petugasMengisi = keluarG === null && keluarP !== null;
      beda.push({
        tanggalIso: p.tanggalIso,
        jenis: "JAM_KELUAR",
        petugas: jamTeks(p.jamKeluarMenit),
        gajihub: jamTeks(g.jamKeluarMenit),
        berdampak: KELOMPOK_WAJIB_JAM_KERJA.has(sp) || KELOMPOK_WAJIB_JAM_KERJA.has(sg),
        keterangan: petugasMengisi
          ? "Tap pulang tidak masuk ke e-Presensi, tapi petugas sudah mengisinya manual. Kalau tanggal ini memang kendala sistem, tandai lewat halaman Data e-Presensi Bermasalah lalu koreksi jamnya di Gajihub - supaya angkanya ikut terpakai saat menghitung, bukan berhenti di Excel."
          : "Jam pulang berbeda - menentukan menit pulang cepat (Pasal 13 ayat (3)).",
      });
    }
  }

  for (const g of gajihub) {
    if (pP.has(g.tanggalIso)) continue;
    beda.push({
      tanggalIso: g.tanggalIso,
      jenis: "HANYA_GAJIHUB",
      petugas: "(tidak ada baris)",
      gajihub: g.status,
      berdampak: true,
      keterangan: "Tanggal ini ada di data Gajihub tapi tidak ada di berkas petugas.",
    });
  }

  return beda.sort((a, b) => a.tanggalIso.localeCompare(b.tanggalIso));
}

const ANGKA_DIBANDINGKAN: { label: string; kunci: keyof BarisRekapPresensi; satuan: string }[] = [
  { label: "Menit terlambat", kunci: "totalMenitTerlambat", satuan: "menit" },
  { label: "Menit pulang cepat", kunci: "totalMenitPulangCepat", satuan: "menit" },
  { label: "Hari alpa", kunci: "jumlahHariAlpha", satuan: "hari" },
  { label: "Tidak melakukan presensi", kunci: "jumlahTidakPresensi", satuan: "kejadian" },
  { label: "Hari WFO", kunci: "jumlahHariWfo", satuan: "hari" },
  { label: "Hari WFH/WFA", kunci: "jumlahHariWfhWfa", satuan: "hari" },
  { label: "Hari dinas luar", kunci: "jumlahHariDinasLuar", satuan: "hari" },
  { label: "Hari diklat", kunci: "jumlahHariDiklat", satuan: "hari" },
  { label: "Hari cuti", kunci: "jumlahHariCuti", satuan: "hari" },
  { label: "Jam lembur hari kerja", kunci: "totalJamLembur", satuan: "jam" },
  { label: "Jam lembur hari libur", kunci: "totalJamLemburHariLibur", satuan: "jam" },
];

function potonganPersen(r: BarisRekapPresensi): number {
  return hitungPotonganKehadiranPersen({
    jumlahHariAlpha: r.jumlahHariAlpha,
    jumlahTidakPresensi: r.jumlahTidakPresensi,
    totalMenitTerlambat: r.totalMenitTerlambat,
    totalMenitPulangCepat: r.totalMenitPulangCepat,
    totalMenitMeninggalkanKantor: r.totalMenitMeninggalkanKantor,
    jumlahTidakIkutUpacara: r.jumlahTidakIkutUpacara,
  }).totalPersen;
}

export function bandingkanSatuPegawai(input: {
  nip: string;
  nama: string;
  satuanKerja: string;
  kelasJabatan: number | null;
  petugas: { rekap: BarisRekapPresensi; hari: HariDibandingkan[] };
  gajihub: { rekap: BarisRekapPresensi; hari: HariDibandingkan[] };
}): HasilBandingPegawai {
  const bedaHarian = bandingHarian(input.petugas.hari, input.gajihub.hari);

  const bedaAngka: BedaAngkaRekap[] = [];
  for (const { label, kunci, satuan } of ANGKA_DIBANDINGKAN) {
    const p = Number(input.petugas.rekap[kunci] ?? 0);
    const g = Number(input.gajihub.rekap[kunci] ?? 0);
    if (Math.abs(p - g) > 0.001) bedaAngka.push({ label, petugas: p, gajihub: g, satuan });
  }

  // PECAHAN (0,0099 = 0,99%) - bentuk yang dipakai tukin.ts mengalikan ke
  // rupiah. Jangan dibagi/dikali 100 sebelum perkalian di bawah.
  const pecahanP = potonganPersen(input.petugas.rekap);
  const pecahanG = potonganPersen(input.gajihub.rekap);

  // Kelas jabatan tidak diketahui -> nominalnya TIDAK ditebak. Selisih
  // persennya tetap dilaporkan; yang hilang cuma penerjemahannya ke rupiah.
  const tarif =
    input.kelasJabatan !== null ? TUKIN_POKOK_PER_KELAS_JABATAN[input.kelasJabatan] : undefined;
  const selisihRupiah =
    tarif === undefined ? null : Math.round(tarif * BOBOT_KEHADIRAN * (pecahanP - pecahanG));

  return {
    nip: input.nip,
    nama: input.nama,
    satuanKerja: input.satuanKerja,
    kelasJabatan: input.kelasJabatan,
    jumlahHariPetugas: input.petugas.hari.length,
    jumlahHariGajihub: input.gajihub.hari.length,
    jumlahHariDibandingkan: input.petugas.hari.filter((h) =>
      input.gajihub.hari.some((g) => g.tanggalIso === h.tanggalIso)
    ).length,
    bedaHarian,
    bedaAngka,
    potonganPersenPetugas: pecahanP * 100,
    potonganPersenGajihub: pecahanG * 100,
    selisihRupiah,
  };
}

export interface RingkasanBanding {
  jumlahPegawai: number;
  jumlahPegawaiIdentik: number;
  jumlahHariDibandingkan: number;
  jumlahBedaBerdampak: number;
  jumlahBedaTidakBerdampak: number;
  /** Jumlah mutlak selisih rupiah - besarnya taruhan, bukan selisih bersih. */
  totalSelisihRupiahMutlak: number;
  /** Berapa pegawai yang kelas jabatannya tidak diketahui (rupiah tidak dihitung). */
  jumlahTanpaKelasJabatan: number;
  perJenis: { jenis: JenisBeda; jumlah: number; berdampak: number }[];
}

export function ringkasBanding(hasil: HasilBandingPegawai[]): RingkasanBanding {
  const perJenis = new Map<JenisBeda, { jumlah: number; berdampak: number }>();
  let berdampak = 0;
  let tidak = 0;
  let rupiah = 0;
  let tanpaKelas = 0;
  let identik = 0;
  let hari = 0;

  for (const h of hasil) {
    hari += h.jumlahHariDibandingkan;
    if (h.bedaHarian.length === 0 && h.bedaAngka.length === 0) identik++;
    if (h.selisihRupiah === null) tanpaKelas++;
    else rupiah += Math.abs(h.selisihRupiah);
    for (const b of h.bedaHarian) {
      const t = perJenis.get(b.jenis) ?? { jumlah: 0, berdampak: 0 };
      t.jumlah++;
      if (b.berdampak) t.berdampak++;
      perJenis.set(b.jenis, t);
      if (b.berdampak) berdampak++;
      else tidak++;
    }
  }

  return {
    jumlahPegawai: hasil.length,
    jumlahPegawaiIdentik: identik,
    jumlahHariDibandingkan: hari,
    jumlahBedaBerdampak: berdampak,
    jumlahBedaTidakBerdampak: tidak,
    totalSelisihRupiahMutlak: rupiah,
    jumlahTanpaKelasJabatan: tanpaKelas,
    perJenis: [...perJenis.entries()]
      .map(([jenis, t]) => ({ jenis, ...t }))
      .sort((a, b) => b.berdampak - a.berdampak || b.jumlah - a.jumlah),
  };
}
