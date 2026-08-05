// ============================================================================
// LAPORAN PDF e-Presensi -> REKAP BULANAN (BarisRekapPresensi)
//
// Modul ini PURE (lihat "Konvensi kode" di CLAUDE.md). Masukannya hasil
// parsePdfPresensi(), keluarannya bentuk yang SAMA PERSIS dengan hasil upload
// template Excel (BarisRekapPresensi di rekapPresensi.ts) - jadi jalur simpan,
// validasi, dan kalkulasi Tukin/uang makan/uang lembur yang sudah ada tidak
// perlu diubah sama sekali.
//
// -------------------------------------------------------------------------
// KOLOM "POTONGAN" DI PDF TIDAK DIPAKAI SEBAGAI NOMINAL
// -------------------------------------------------------------------------
// Instruksi eksplisit user: angkanya tidak sesuai Permenaker 15/2024, jadi
// potongan dihitung ulang di sini dari FAKTA presensi (tanggal, status, jam
// masuk, jam keluar) memakai hitungPotonganKehadiranPersen di tukin.ts.
//
// Dan memang terbukti tidak konsisten. Dari 3 file asli (46 laporan, 1.145
// baris) ada 238 kedatangan lewat 07:30 yang TIDAK diberi catatan
// keterlambatan sama sekali oleh e-Presensi - termasuk yang telat 84 menit -
// sementara yang telat 1 menit justru dicatat. KONSEKUENSINYA: potongan hasil
// hitungan Gajihub akan LEBIH BESAR dari yang tertera di PDF untuk sebagian
// pegawai. Itu memang yang diminta, tapi jangan sampai kaget waktu diadu.
//
// Satu-satunya hal yang DIAMBIL dari kolom itu adalah penanda "lupa presensi"
// - itu FAKTA (pegawai tidak menekan presensi), bukan nominal, dan tidak ada
// di kolom lain mana pun. Lihat LUPA_PRESENSI di bawah.
//
// -------------------------------------------------------------------------
// JADWAL KERJA - ANGKANYA DIVERIFIKASI KE DATA, BUKAN ASUMSI
// -------------------------------------------------------------------------
// - Jam masuk 07:30: dicek ke 101 baris yang punya catatan "Keterlambatan N
//   menit" di 3 file asli. 101 dari 101 cocok persis dengan
//   (jam masuk - 07:30). Nol selisih.
// - Jam pulang 16:00 (Senin-Kamis) & 16:30 (Jumat): dicek ke sebaran jam
//   presensi pulang WFO. Puncaknya tepat di 16:00 untuk Senin-Kamis dan tepat
//   di 16:30 untuk Jumat, dan hampir tidak ada yang pulang sebelum jam itu
//   (Jumat: 2 dari 29). Pola khas orang menunggu gerbang presensi terbuka.
// - 7,5 jam/hari: "Kewajiban Jam Kerja" di PDF selalu kelipatan 7,5
//   (172,5 = 23 hari, 150 = 20 hari, 112,5 = 15 hari).
//
// TODO(confirm): ketiganya cocok dengan praktik 5 hari kerja 37,5 jam/minggu,
// TAPI belum dikonfirmasi ke dokumen resmi jam kerja Kemnaker. Kalau ada
// satker dengan jadwal berbeda, angkanya cukup diubah di JADWAL_KERJA_DEFAULT.
// ============================================================================

import type { BarisRekapPresensi } from "./rekapPresensi";
import type { BarisPresensiPdf, LaporanPresensiPdf } from "./presensiPdf";

export type KategoriHari =
  | "WFO"
  | "WFH_WFA"
  | "DINAS_LUAR"
  | "DIKLAT"
  | "LEMBUR"
  | "UPACARA"
  | "CUTI"
  | "IZIN"
  | "SAKIT"
  | "TUGAS_BELAJAR"
  | "TIDAK_HADIR"
  | "TIDAK_PRESENSI"
  | "TIDAK_DIKENALI";

export interface JadwalKerja {
  jamMasukWajibMenit: number;
  /** Indeks 0 = Minggu ... 6 = Sabtu. null = bukan hari kerja. */
  jamPulangWajibMenit: (number | null)[];
  jamKerjaPerHari: number;
  /**
   * Pasal 13 ayat (3) memotong "setiap 1 (satu) menit" tanpa menyebut
   * toleransi, jadi default 0. Sengaja dibuat konstanta supaya kalau ternyata
   * ada kebijakan toleransi resmi, cukup satu angka yang diubah.
   * TODO(confirm) ke Biro OSDMA/Hukum.
   */
  toleransiTerlambatMenit: number;
}

const MENIT = (jam: number, menit: number) => jam * 60 + menit;

export const JADWAL_KERJA_DEFAULT: JadwalKerja = {
  jamMasukWajibMenit: MENIT(7, 30),
  //        Minggu Senin        Selasa       Rabu         Kamis        Jumat         Sabtu
  jamPulangWajibMenit: [null, MENIT(16, 0), MENIT(16, 0), MENIT(16, 0), MENIT(16, 0), MENIT(16, 30), null],
  jamKerjaPerHari: 7.5,
  toleransiTerlambatMenit: 0,
};

/**
 * Kategori yang PUNYA kewajiban jam kerja - hanya ini yang bisa kena potongan
 * terlambat / pulang cepat (Pasal 13 ayat (3)).
 *
 * Dinas Keluar, Diklat, dan Lembur SENGAJA tidak masuk: jam presensinya
 * mengikuti kegiatan/perjalanan dinas, bukan jam kantor - di file asli banyak
 * baris Dinas Keluar dengan jam masuk 09:00-10:00 yang jelas bukan
 * keterlambatan. e-Presensi sendiri juga tidak pernah menandainya terlambat.
 *
 * TODO(confirm): WFH/WFA DIMASUKKAN di sini karena Permenaker tidak
 * membedakan tempat kerja - kewajiban jam kerjanya sama. Belum ada penegasan
 * resmi, dan data uji tidak bisa memutuskan (e-Presensi juga tidak konsisten
 * menandai WFO yang terlambat). Kalau ternyata WFH/WFA dikecualikan, cukup
 * hapus dari daftar ini.
 */
const KATEGORI_WAJIB_JAM_KERJA: KategoriHari[] = ["WFO", "WFH_WFA"];

/** Kategori yang mewajibkan presensi masuk & pulang (Pasal 13 ayat (2)). */
const KATEGORI_WAJIB_PRESENSI: KategoriHari[] = [
  "WFO",
  "WFH_WFA",
  "DINAS_LUAR",
  "DIKLAT",
  "LEMBUR",
  "UPACARA",
];

/** Berhak uang makan (SBM 2026 item 22.1) - lihat uangMakan.ts. */
const KATEGORI_UANG_MAKAN: KategoriHari[] = ["WFO", "WFH_WFA"];

/**
 * Penanda "pegawai tidak menekan presensi" di kolom Potongan. Yang diambil
 * cuma FAKTA-nya; angka persen di kalimat yang sama diabaikan.
 *
 * Ini tidak bisa disimpulkan dari jamnya saja - di file asli, presensi yang
 * terlewat muncul dalam dua bentuk: sel jam kosong, ATAU jam terisi 23:59 /
 * jam masuk & pulang selisih satu menit di sore hari (satu ketukan disalin ke
 * dua kolom). Tanpa penanda ini, pelanggaran Pasal 13 ayat (2) hilang.
 */
const LUPA_PRESENSI = /lupa presensi|tidak melakukan presensi|tidak presensi/i;

/** Ambang "jelas bukan ketukan presensi pagi" - dipakai buat menyaring anomali. */
const AMBANG_TERLAMBAT_JANGGAL_MENIT = 240;

export interface RincianHariPdf {
  /** yyyy-mm-dd, tanggal apa adanya dari file (tanpa konversi zona waktu). */
  tanggalIso: string;
  namaHari: string | null;
  kategori: KategoriHari;
  statusTeks: string;
  jenisCuti: string | null;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  menitTerlambat: number;
  menitPulangCepat: number;
  kejadianTidakPresensi: number;
  jamLembur: number;
  hariLibur: boolean;
  berhakMakanLembur: boolean;
}

export interface BarisDibuang {
  tanggalIso: string;
  statusTeks: string;
  alasan: string;
}

export interface SelisihRingkasan {
  label: string;
  sumberPdf: number;
  gajihub: number;
}

export interface HasilRekapDariPdf {
  nip: string | null;
  nama: string | null;
  periodeBulan: number | null;
  periodeTahun: number | null;
  rekap: BarisRekapPresensi;
  hari: RincianHariPdf[];
  dibuang: BarisDibuang[];
  /** Beda antara Summary Presensi di PDF dan hitungan Gajihub. */
  selisihRingkasan: SelisihRingkasan[];
  /** Hal yang WAJIB dilihat manusia sebelum kalkulasi dijalankan. */
  catatan: string[];
}

function normal(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function kategoriDariStatus(statusTeks: string): { kategori: KategoriHari; jenisCuti: string | null } {
  const s = normal(statusTeks);
  if (s === "") return { kategori: "TIDAK_DIKENALI", jenisCuti: null };

  // "Cuti" dicek DULUAN: "Cuti - Cuti Sakit <1 bulan" mengandung kata "sakit",
  // dan kalau urutannya dibalik dia akan salah masuk kategori SAKIT.
  if (s.startsWith("cuti")) {
    const pisah = statusTeks.indexOf("-");
    const jenis = pisah >= 0 ? statusTeks.slice(pisah + 1).replace(/\s+/g, " ").trim() : null;
    return { kategori: "CUTI", jenisCuti: jenis === "" ? null : jenis };
  }
  if (s.includes("tugas belajar")) return { kategori: "TUGAS_BELAJAR", jenisCuti: null };
  if (s.includes("tidak presensi")) return { kategori: "TIDAK_PRESENSI", jenisCuti: null };
  if (s.includes("tidak hadir") || s.includes("alpha") || s.includes("alfa")) {
    return { kategori: "TIDAK_HADIR", jenisCuti: null };
  }
  if (s.includes("upacara")) return { kategori: "UPACARA", jenisCuti: null };
  if (s.includes("lembur")) return { kategori: "LEMBUR", jenisCuti: null };
  if (s.includes("dinas")) return { kategori: "DINAS_LUAR", jenisCuti: null };
  if (s.includes("diklat") || s.includes("pelatihan")) return { kategori: "DIKLAT", jenisCuti: null };
  if (s.includes("wfo")) return { kategori: "WFO", jenisCuti: null };
  if (s.includes("wfh") || s.includes("wfa")) return { kategori: "WFH_WFA", jenisCuti: null };
  if (s.includes("izin")) return { kategori: "IZIN", jenisCuti: null };
  if (s.includes("sakit")) return { kategori: "SAKIT", jenisCuti: null };
  return { kategori: "TIDAK_DIKENALI", jenisCuti: null };
}

const NAMA_HARI = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];

/**
 * Indeks hari (0=Minggu). Pakai nama hari dari FILE kalau ada - itu yang
 * dipakai e-Presensi sendiri - dan baru jatuh ke perhitungan dari tanggal
 * kalau namanya tidak terbaca.
 */
function indeksHari(baris: { namaHari: string | null; tanggal: number | null; bulan: number | null; tahun: number | null }): number | null {
  if (baris.namaHari) {
    const idx = NAMA_HARI.indexOf(normal(baris.namaHari).replace(/'/g, ""));
    if (idx >= 0) return idx;
  }
  if (baris.tanggal !== null && baris.bulan !== null && baris.tahun !== null) {
    return new Date(Date.UTC(baris.tahun, baris.bulan - 1, baris.tanggal)).getUTCDay();
  }
  return null;
}

function tanggalIso(b: BarisPresensiPdf): string | null {
  if (b.tanggal === null || b.bulan === null || b.tahun === null) return null;
  const dd = String(b.tanggal).padStart(2, "0");
  const mm = String(b.bulan).padStart(2, "0");
  return `${b.tahun}-${mm}-${dd}`;
}

function bulatkan2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turunkan rekap bulanan dari satu laporan PDF.
 *
 * Urutannya: kelompokkan per TANGGAL -> buang entri ganda -> tentukan
 * kategori hari -> hitung potongan & lembur -> jumlahkan.
 */
export function rekapDariLaporanPdf(
  laporan: LaporanPresensiPdf,
  jadwal: JadwalKerja = JADWAL_KERJA_DEFAULT
): HasilRekapDariPdf {
  const catatan: string[] = [...laporan.peringatan];
  const dibuang: BarisDibuang[] = [];

  // --- 1. Kelompokkan per tanggal --------------------------------------------
  const perTanggal = new Map<string, BarisPresensiPdf[]>();
  for (const b of laporan.baris) {
    const iso = tanggalIso(b);
    if (iso === null) {
      dibuang.push({ tanggalIso: "-", statusTeks: b.statusTeks, alasan: `tanggal tidak terbaca ("${b.tanggalTeks}")` });
      continue;
    }
    if (!perTanggal.has(iso)) perTanggal.set(iso, []);
    perTanggal.get(iso)!.push(b);
  }

  const hari: RincianHariPdf[] = [];
  const hitung = {
    wfo: 0,
    wfhWfa: 0,
    diklat: 0,
    dinasLuar: 0,
    upacara: 0,
    cuti: 0,
    izin: 0,
    sakit: 0,
    tugasBelajar: 0,
    tidakHadir: 0,
    tidakDikenali: 0,
    hariLembur: 0,
    akhirPekan: 0,
  };
  let menitTerlambatTotal = 0;
  let menitPulangCepatTotal = 0;
  let kejadianTidakPresensi = 0;
  let jamLemburKerja = 0;
  let jamLemburLibur = 0;
  let hariMakanLemburKerja = 0;
  let hariMakanLemburLibur = 0;

  const tanggalUrut = [...perTanggal.keys()].sort();

  for (const iso of tanggalUrut) {
    const semua = perTanggal.get(iso)!;
    const idxHari = indeksHari(semua[0]);
    const namaHari = semua[0].namaHari;
    const jamPulangWajib = idxHari === null ? null : jadwal.jamPulangWajibMenit[idxHari];
    const hariLibur = jamPulangWajib === null;

    const berkategori = semua.map((b) => ({ baris: b, ...kategoriDariStatus(b.statusTeks) }));
    const barisLembur = berkategori.filter((x) => x.kategori === "LEMBUR");
    const barisHarian = berkategori.filter((x) => x.kategori !== "LEMBUR");

    // --- 2. Buang entri ganda ------------------------------------------------
    // e-Presensi menambahkan baris "Tidak Hadir" untuk hari yang pegawainya
    // tidak menekan presensi - termasuk saat hari itu sebenarnya CUTI atau
    // DINAS KELUAR, dan bahkan saat baris "Tidak Hadir"-nya sendiri sudah ada
    // (17 tanggal di file uji punya DUA baris "Tidak Hadir" yang sama persis).
    // Kalau tidak dibuang, satu hari alpha terhitung dua kali = potongan 6%
    // padahal Pasal 13 ayat (1) cuma 3%.
    let terpilih = barisHarian[0] ?? null;
    if (barisHarian.length > 1) {
      const bukanTidakHadir = barisHarian.filter((x) => x.kategori !== "TIDAK_HADIR");
      terpilih = bukanTidakHadir[0] ?? barisHarian[0];
      for (const x of barisHarian) {
        if (x === terpilih) continue;
        dibuang.push({
          tanggalIso: iso,
          statusTeks: x.baris.statusTeks,
          alasan:
            x.kategori === "TIDAK_HADIR" && bukanTidakHadir.length > 0
              ? `entri ganda - tanggal ini sudah punya status "${terpilih.baris.statusTeks}"`
              : "entri ganda dengan status yang sama",
        });
      }
      if (bukanTidakHadir.length > 1) {
        catatan.push(
          `${iso}: ada ${bukanTidakHadir.length} status berbeda di tanggal yang sama (${bukanTidakHadir
            .map((x) => x.baris.statusTeks)
            .join(", ")}) - dipakai yang pertama ("${terpilih.baris.statusTeks}"), sisanya diabaikan. Perlu dicek manual.`
        );
      }
    }

    // --- 3. Hitung potongan untuk hari itu -----------------------------------
    let menitTerlambat = 0;
    let menitPulangCepat = 0;
    let tidakPresensi = 0;

    if (terpilih) {
      const b = terpilih.baris;
      const kategori = terpilih.kategori;
      const lupa = LUPA_PRESENSI.test(b.potonganTeks) || kategori === "TIDAK_PRESENSI";

      // TIDAK ADA potongan apa pun di hari yang memang bukan hari kerja.
      // Pasal 13 memotong pelanggaran terhadap KEWAJIBAN jam kerja - kalau
      // hari itu tidak ada kewajibannya, tidak ada yang dilanggar. Ini nyata
      // di file uji: semua baris dengan presensi pulang kosong adalah Dinas
      // Keluar di hari Sabtu (pegawai berangkat dinas di akhir pekan, tap
      // masuk di lokasi, tidak tap pulang). Menagih 1% untuk itu jelas keliru.
      //
      // KETERBATASAN: yang bisa dikenali cuma Sabtu & Minggu. Libur nasional
      // yang jatuh di hari kerja TIDAK bisa dideteksi - kalender hari libur
      // tidak ada di sistem ini, dan file PDF-nya juga tidak memuatnya.
      // Selisih antara jumlah hari hadir dan "Kewajiban Jam Kerja" dipakai
      // sebagai penanda supaya kasusnya tetap kelihatan (lihat catatan akhir).
      if (!hariLibur && (KATEGORI_WAJIB_PRESENSI.includes(kategori) || kategori === "TIDAK_PRESENSI")) {
        if (b.jamMasukMenit === null) tidakPresensi++;
        if (b.jamKeluarMenit === null) tidakPresensi++;
        // Penanda dari sumber cuma dipakai kalau jamnya TERISI - kalau selnya
        // memang kosong, kejadiannya sudah terhitung di atas.
        if (tidakPresensi === 0 && lupa) tidakPresensi++;
      }

      if (!hariLibur && KATEGORI_WAJIB_JAM_KERJA.includes(kategori)) {
        // Ketukan yang ditandai "lupa presensi" tidak dipercaya sebagai jam
        // masuk/pulang sungguhan. Di file uji ada baris WFO dengan jam masuk
        // 19:46 dan jam pulang 19:47 - satu ketukan sore yang disalin ke dua
        // kolom. Membacanya mentah-mentah berarti menagih "terlambat 736
        // menit" untuk orang yang sebenarnya lupa presensi pagi (pelanggaran
        // yang beda pasalnya, dan sudah dihitung di atas).
        const masukDipercaya =
          b.jamMasukMenit !== null &&
          (!lupa || jamPulangWajib === null || b.jamMasukMenit < jamPulangWajib);
        const keluarDipercaya = b.jamKeluarMenit !== null && !lupa;

        if (masukDipercaya && b.jamMasukMenit !== null) {
          const telat = b.jamMasukMenit - jadwal.jamMasukWajibMenit - jadwal.toleransiTerlambatMenit;
          menitTerlambat = Math.max(0, telat);
        }
        if (keluarDipercaya && b.jamKeluarMenit !== null && jamPulangWajib !== null) {
          menitPulangCepat = Math.max(0, jamPulangWajib - b.jamKeluarMenit);
        }
        if (menitTerlambat > AMBANG_TERLAMBAT_JANGGAL_MENIT) {
          catatan.push(
            `${iso}: jam masuk ${b.jamMasukTeks} menghasilkan keterlambatan ${menitTerlambat} menit - angkanya janggal, cek apakah pegawai lupa presensi pagi.`
          );
        }
      }

      // Hari WFO/WFH di akhir pekan TIDAK dihitung sebagai hari kerja yang
      // berhak uang makan (SBM item 22.1 dasarnya hari kerja), dan "Tidak
      // Hadir" di akhir pekan bukan alpha - tidak ada kewajiban hadir.
      if (hariLibur && ["WFO", "WFH_WFA", "TIDAK_HADIR"].includes(kategori)) {
        hitung.akhirPekan++;
        catatan.push(
          `${iso} (${namaHari ?? "akhir pekan"}): status "${b.statusTeks}" jatuh di akhir pekan - tidak dihitung sebagai hari kerja (tidak dapat uang makan, tidak kena potongan).`
        );
      } else {
        switch (kategori) {
          case "WFO": hitung.wfo++; break;
          case "WFH_WFA": hitung.wfhWfa++; break;
          case "DIKLAT": hitung.diklat++; break;
          case "DINAS_LUAR": hitung.dinasLuar++; break;
          case "UPACARA": hitung.upacara++; break;
          case "CUTI": hitung.cuti++; break;
          case "IZIN": hitung.izin++; break;
          case "SAKIT": hitung.sakit++; break;
          case "TUGAS_BELAJAR": hitung.tugasBelajar++; break;
          case "TIDAK_HADIR": hitung.tidakHadir++; break;
          case "TIDAK_DIKENALI":
            hitung.tidakDikenali++;
            catatan.push(`${iso}: status "${b.statusTeks}" tidak dikenali - hari ini tidak dihitung sebagai apa pun.`);
            break;
          default: break;
        }
      }

      menitTerlambatTotal += menitTerlambat;
      menitPulangCepatTotal += menitPulangCepat;
      kejadianTidakPresensi += tidakPresensi;

      hari.push({
        tanggalIso: iso,
        namaHari,
        kategori,
        statusTeks: b.statusTeks,
        jenisCuti: terpilih.jenisCuti,
        jamMasukMenit: b.jamMasukMenit,
        jamKeluarMenit: b.jamKeluarMenit,
        menitTerlambat,
        menitPulangCepat,
        kejadianTidakPresensi: tidakPresensi,
        jamLembur: 0,
        hariLibur,
        berhakMakanLembur: false,
      });
    }

    // --- 4. Lembur -----------------------------------------------------------
    // Lembur diambil HANYA dari baris berstatus "Lembur" - itu penanda bahwa
    // lemburnya memang diperintahkan. Jam pulang malam di baris WFO biasa
    // TIDAK dihitung lembur; tanpa surat perintah, itu cuma pulang telat.
    if (barisLembur.length > 0) {
      let jamHariIni = 0;
      let adaBlokDuaJam = false;
      for (const x of barisLembur) {
        const b = x.baris;
        if (b.jamMasukMenit === null || b.jamKeluarMenit === null) {
          catatan.push(
            `${iso}: baris Lembur tidak punya jam masuk/pulang lengkap - jam lemburnya tidak bisa dihitung, isi manual lewat template Excel kalau memang ada.`
          );
          if (KATEGORI_WAJIB_PRESENSI.includes("LEMBUR")) {
            const kurang = (b.jamMasukMenit === null ? 1 : 0) + (b.jamKeluarMenit === null ? 1 : 0);
            kejadianTidakPresensi += kurang;
          }
          continue;
        }
        // Di hari kerja, lembur baru dihitung setelah jam pulang wajib. Di
        // hari libur tidak ada jam kerja yang harus dilewati dulu.
        const mulai = jamPulangWajib === null ? b.jamMasukMenit : Math.max(b.jamMasukMenit, jamPulangWajib);
        const durasi = Math.max(0, b.jamKeluarMenit - mulai);
        if (durasi === 0) continue;
        jamHariIni += durasi / 60;
        // Syarat SBM 2026 item 23.2: minimal 2 jam BERTURUT-TURUT. Satu baris
        // = satu rentang masuk-pulang, jadi durasinya memang berturut-turut.
        if (durasi >= 120) adaBlokDuaJam = true;
      }

      if (jamHariIni > 0) {
        hitung.hariLembur++;
        const jam = bulatkan2(jamHariIni);
        if (hariLibur) {
          jamLemburLibur += jam;
          if (adaBlokDuaJam) hariMakanLemburLibur++;
        } else {
          jamLemburKerja += jam;
          if (adaBlokDuaJam) hariMakanLemburKerja++;
          catatan.push(
            `${iso} (${namaHari ?? "hari kerja"}): lembur ${jam} jam dihitung sebagai lembur HARI KERJA (tarif 1x). Kalau tanggal itu libur nasional, tarifnya 2x dan perlu dikoreksi manual - kalender libur nasional tidak ada di sistem ini.`
          );
        }
        const rincian = hari.find((h) => h.tanggalIso === iso);
        if (rincian) {
          rincian.jamLembur = jam;
          rincian.berhakMakanLembur = adaBlokDuaJam;
        } else {
          hari.push({
            tanggalIso: iso,
            namaHari,
            kategori: "LEMBUR",
            statusTeks: barisLembur[0].baris.statusTeks,
            jenisCuti: null,
            jamMasukMenit: barisLembur[0].baris.jamMasukMenit,
            jamKeluarMenit: barisLembur[0].baris.jamKeluarMenit,
            menitTerlambat: 0,
            menitPulangCepat: 0,
            kejadianTidakPresensi: 0,
            jamLembur: jam,
            hariLibur,
            berhakMakanLembur: adaBlokDuaJam,
          });
        }
      }
    }
  }

  // --- 5. Rakit rekap bulanan -------------------------------------------------
  const kewajiban = laporan.ringkasanSumber.kewajibanJamKerja;
  const jumlahHariKerja =
    kewajiban !== null && jadwal.jamKerjaPerHari > 0 ? Math.round(kewajiban / jadwal.jamKerjaPerHari) : 0;

  const jumlahHariHadir = hitung.wfo + hitung.wfhWfa + hitung.diklat + hitung.dinasLuar;

  const rekap: BarisRekapPresensi = {
    nip: laporan.nip ?? "",
    jumlahHariAlpha: hitung.tidakHadir,
    jumlahTidakPresensi: kejadianTidakPresensi,
    totalMenitTerlambat: menitTerlambatTotal,
    totalMenitPulangCepat: menitPulangCepatTotal,
    // Tidak ada datanya di export ini - PDF cuma punya satu pasang jam masuk
    // & pulang per hari, tidak mencatat keluar-masuk di tengah jam kerja.
    // Dibiarkan 0, BUKAN ditebak. Kalau satker punya catatannya, isi lewat
    // template Excel yang sudah ada.
    totalMenitMeninggalkanKantor: 0,
    // Status "Upacara Bendera" di PDF artinya pegawai IKUT upacara. Yang
    // TIDAK ikut tidak punya baris apa pun, dan tanggal upacara juga tidak
    // tercatat di file - jadi pelanggaran Pasal 13 ayat (4) tidak bisa
    // diturunkan dari sini sama sekali.
    jumlahTidakIkutUpacara: 0,
    jumlahHariKerja,
    jumlahHariHadir,
    jumlahHariWfo: hitung.wfo,
    jumlahHariWfhWfa: hitung.wfhWfa,
    jumlahHariDiklat: hitung.diklat,
    jumlahHariDinasLuar: hitung.dinasLuar,
    totalJamLembur: bulatkan2(jamLemburKerja),
    totalJamLemburHariLibur: bulatkan2(jamLemburLibur),
    jumlahHariMakanLembur: hariMakanLemburKerja,
    jumlahHariMakanLemburHariLibur: hariMakanLemburLibur,
  };

  // --- 6. Cek silang dengan Summary Presensi bawaan PDF -----------------------
  // INFORMASI SAJA, bukan penentu. Yang dipakai Gajihub selalu TABEL DETAIL -
  // itu catatan per hari yang bisa ditelusuri, sementara blok "Summary
  // Presensi" cuma angka jadi.
  //
  // Selisih bukan berarti salah baca. Ada dua sebab yang sudah terbukti:
  // (1) dedup entri ganda - summary-nya ikut menghitung baris ganda, dan
  // (2) blok summary di export lama memang tidak sinkron dengan tabelnya
  //     sendiri. Contoh nyata di file uji Juli 2025: satu pegawai punya 16
  //     baris "Tidak Hadir" dan 12 baris "WFO" di tabel, tapi summary-nya
  //     menulis "Tidak Hadir : 1" dan "WFO : 1" - dan "Kekurangan Jam Kerja"
  //     -nya bahkan negatif (-97,5). Di export 2026 summary-nya sudah cocok.
  const s = laporan.ringkasanSumber;
  const selisihRingkasan: SelisihRingkasan[] = [];
  const banding = (label: string, sumber: number | null, gajihub: number) => {
    if (sumber === null) return;
    if (sumber !== gajihub) selisihRingkasan.push({ label, sumberPdf: sumber, gajihub });
  };
  banding("WFO", s.wfo, hitung.wfo);
  banding("WFH + WFA", s.wfh === null && s.wfa === null ? null : (s.wfh ?? 0) + (s.wfa ?? 0), hitung.wfhWfa);
  banding("Dinas Keluar", s.dinasKeluar, hitung.dinasLuar);
  banding("Diklat", s.diklat, hitung.diklat);
  banding("Tidak Hadir", s.tidakHadir, hitung.tidakHadir);
  banding("Cuti", s.cuti, hitung.cuti);
  banding("Izin", s.izin, hitung.izin);
  banding("Tugas Belajar", s.tugasBelajar, hitung.tugasBelajar);
  banding("Upacara Bendera", s.upacaraBendera, hitung.upacara);
  banding("Lembur", s.lembur, hitung.hariLembur);

  // Summary yang jumlahnya jauh di bawah banyaknya baris detail = blok
  // summary-nya tidak terisi benar (lihat contoh Juli 2025 di atas). Perlu
  // dibilang eksplisit, kalau tidak daftar "selisih" di bawah malah bikin
  // ragu pada angka yang justru benar.
  const totalRingkasan =
    (s.wfo ?? 0) + (s.wfh ?? 0) + (s.wfa ?? 0) + (s.dinasKeluar ?? 0) + (s.diklat ?? 0) +
    (s.tidakHadir ?? 0) + (s.cuti ?? 0) + (s.izin ?? 0) + (s.tugasBelajar ?? 0) +
    (s.upacaraBendera ?? 0) + (s.lembur ?? 0);
  // Kalau SELURUH blok ringkasan kosong, berarti sumbernya memang tidak punya
  // "Summary Presensi" buat dibandingkan - mis. jalur tarik langsung dari
  // database e-Presensi (src/jobs/importPresensiEpresensi.ts). Tanpa penjagaan
  // ini, semua nilai null dibaca sebagai 0 dan peringatan "summary tidak
  // sinkron" muncul untuk SETIAP pegawai, padahal tidak ada summary yang
  // dibandingkan.
  const adaRingkasan = [
    s.wfo, s.wfh, s.wfa, s.dinasKeluar, s.diklat, s.tidakHadir,
    s.cuti, s.izin, s.tugasBelajar, s.upacaraBendera, s.lembur,
  ].some((v) => v !== null);
  const ringkasanTidakDipercaya =
    adaRingkasan && laporan.baris.length >= 5 && totalRingkasan * 2 < laporan.baris.length;
  if (ringkasanTidakDipercaya) {
    catatan.push(
      `Blok "Summary Presensi" di file ini tidak sinkron dengan tabel detailnya sendiri (summary menghitung ${totalRingkasan} hari, tabelnya ${laporan.baris.length} baris) - masalah yang memang ada di export e-Presensi versi lama. Yang dipakai Gajihub adalah TABEL DETAIL, jadi angka di bawah tetap sah.`
    );
  }

  if (dibuang.some((d) => d.alasan.startsWith("entri ganda"))) {
    const jumlah = dibuang.filter((d) => d.alasan.startsWith("entri ganda")).length;
    catatan.push(
      `${jumlah} baris entri ganda dibuang (satu tanggal muncul lebih dari sekali di file). Ini penyebab hitungan Gajihub bisa berbeda dari "Summary Presensi" di PDF - summary itu ikut menghitung baris gandanya.`
    );
  }
  if (hitung.upacara > 0) {
    catatan.push(
      `${hitung.upacara} hari berstatus "Upacara Bendera" TIDAK dihitung sebagai hari kerja WFO (upacara kenegaraan sering jatuh di hari libur - contoh 1 Juni). Kalau tanggal itu sebenarnya hari kerja, hari tersebut kehilangan hak uang makannya dan perlu dikoreksi manual.`
    );
  }
  if (hitung.cuti + hitung.izin + hitung.sakit + hitung.tugasBelajar > 0) {
    catatan.push(
      `Ada ${hitung.cuti} hari cuti, ${hitung.izin} izin, ${hitung.sakit} sakit, ${hitung.tugasBelajar} tugas belajar. Hari-hari ini tidak dihitung alpha dan tidak dapat uang makan. Potongan cuti besar/sakit (Pasal 14) TIDAK otomatis - itu input terpisah di kalkulasi Tukin.`
    );
  }
  if (jumlahHariKerja > 0 && jumlahHariHadir > jumlahHariKerja) {
    catatan.push(
      `Hari hadir (${jumlahHariHadir}) melebihi hari kerja (${jumlahHariKerja} hari, dari "Kewajiban Jam Kerja" ${kewajiban} jam di PDF). Ini WAJAR kalau pegawai dinas keluar / masuk di hari libur nasional - libur nasional tidak bisa dikenali sistem ini, jadi harinya tetap terbaca sebagai hari hadir. Hak uang makan tetap dibatasi ${jumlahHariKerja} hari.`
    );
  }

  return {
    nip: laporan.nip,
    nama: laporan.nama,
    periodeBulan: laporan.periodeBulan,
    periodeTahun: laporan.periodeTahun,
    rekap,
    hari,
    dibuang,
    selisihRingkasan,
    catatan,
  };
}
