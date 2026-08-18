// ============================================================================
// ADAPTER e-PRESENSI ASLI - baca langsung dari database e-Presensi (PostgreSQL)
//
// Ini "RealPresensiAdapter" yang selama ini ditunggu (lihat catatan di
// src/app/tukin/presensi/SinkronisasiPresensi.tsx). Dipakai BARENG oleh:
//   - tombol "Tarik data presensi" di /tukin/presensi (Server Action)
//   - src/jobs/importPresensiEpresensi.ts (CLI, buat tarikan massal/terjadwal)
//
// READ-ONLY terhadap e-Presensi DAN SIAP: hanya SELECT. e-Presensi adalah
// sistem absensi yang sedang melayani pegawai sungguhan - jangan pernah
// menulis ke sana.
//
// ---------------------------------------------------------------------------
// KENAPA TIDAK MENGIMPLEMENTASIKAN interface `PresensiAdapter`
// ---------------------------------------------------------------------------
// `PresensiAdapter` (DataSourceAdapter.ts) berbentuk PER-NIP:
// getRekapKehadiranPeriode(nip, bulan, tahun). Untuk satu periode ada ±5.200
// pegawai - memakainya berarti 5.200 kali round-trip ke database e-Presensi
// DAN 5.200 lookup ke SIAP, padahal satu query sudah cukup untuk semuanya.
// Jadi adapter ini sengaja berbentuk BORONGAN per periode. Interface lama
// tetap dibiarkan apa adanya (masih dipakai MockPresensiAdapter & job
// scheduler lama) - TODO(confirm): kalau nanti job scheduler dialihkan ke
// sumber asli, interface itu yang perlu ditinjau ulang, bukan adapter ini
// yang dipaksa masuk ke bentuk per-NIP.
//
// ---------------------------------------------------------------------------
// RANTAI PEMETAAN PEGAWAI - bagian paling rawan, sudah dibuktikan ke data
// ---------------------------------------------------------------------------
//   e-Presensi.presensi.id_pegawai -> SIAP.PEGAWAI.PEGAWAIID -> NIPBARU (NIP)
//
// Database e-Presensi TIDAK menyimpan NIP sama sekali (sudah dicek ke seluruh
// information_schema - tidak ada satu pun kolom ber-NIP). Yang ada
// `id_pegawai`, ID internal e-Presensi.
//
// PENCOCOKANNYA HARUS PERSIS - JANGAN menambah/membuang nol di depan. Waktu
// verifikasi, normalisasi nol sempat mencocokkan "00009600" (Deva Dwi Septian
// di e-Presensi) ke PEGAWAIID "000009600" milik ORANG LAIN (Afriansyah Noor).
// Salah orang = salah potong tukin. Dengan pencocokan persis, hasil uji:
// 150/150 cocok untuk ID 8 digit, 9 digit, dan 12 digit (nama diverifikasi
// silang). Yang ber-UUID (36 karakter) TIDAK ada di SIAP dan DILEWATI dengan
// alasan eksplisit - TIDAK dicocokkan lewat nama, karena penulisan nama di
// e-Presensi tidak konsisten ("Ir ANNA YULIANA M.Si." vs "Anna Yuliana").
//
// ---------------------------------------------------------------------------
// JENIS CUTI - sumber potongan Pasal 14, DAN "bulan ke berapa"-nya
// ---------------------------------------------------------------------------
//   presensi.id_presensi -> presensi_cuti.id_presensi -> cuti.nama_cuti
//
// Diambil lewat DUA query terpisah lalu dipasangkan di memori - JANGAN
// diubah jadi JOIN/LATERAL, lihat alasannya di ambilBarisPresensi().
//
// Tabel `cuti` (16 baris) memecah jenisnya SAMPAI KE TINGKAT BULAN - "Cuti
// Besar I/II/III", "Cuti Sakit Bulan I/II/III", "Cuti Sakit Bulan Lebih Dari
// 3 Bulan" - dan kolom `cuti.nilai_persen` di sana cocok PERSIS dengan tabel
// Pasal 14 yang sudah ada di tukin.ts (50/75/90 untuk cuti besar, 0/50/75
// untuk cuti sakit, 1%/hari untuk gugur kandungan di atas 1 bulan).
//
// Ini membatalkan asumsi lama bahwa "bulan ke berapa" mustahil diturunkan
// dari data satu bulan dan harus diketik manual. Lihat bulanCutiDariLabel()
// di business-logic/jenisCuti.ts.
//
// JANGAN ambil cuti dari SIAP. Tabel `CUTI` di sana memang ada, tapi sudah
// ditinggalkan: puncaknya 2019 (304 baris), 2025 cuma 26 baris, dan NOL baris
// yang beririsan dengan Juli 2026. Pengajuan cuti sudah pindah ke e-Presensi.
//
// ---------------------------------------------------------------------------
// TODO(confirm) - PERBEDAAN ANGKA YANG HARUS DISADARI
// ---------------------------------------------------------------------------
// 1. TOLERANSI KETERLAMBATAN 60 MENIT (kolom sistem_kerja.toleransi untuk
//    WFO/WFH/WFA = 60) SEKARANG DIIKUTI Gajihub - lihat
//    TOLERANSI_TERLAMBAT_MENIT di presensiPdfKeRekap.ts untuk bukti angkanya
//    (diadu ke rincian tukin manual Rokeu Juli 2026: 44 dari 48 pegawai cocok
//    sampai ke satuan menit). Sebelumnya Gajihub memakai 0 dan memotong 5,2x
//    lebih besar dari perhitungan manual.
//    Toleransinya diterapkan di JADWAL_KERJA_DEFAULT, BUKAN di sini - supaya
//    jalur tarikan e-Presensi dan jalur upload PDF tidak bisa berbeda.
// 2. Kolom `potongan`, `keterangan_potongan`, dan tabel `potongan_tukin` di
//    e-Presensi DIABAIKAN sebagai nominal - Gajihub menghitung sendiri sesuai
//    Permenaker 15/2024. Dari kolom itu yang diambil HANYA penanda "lupa
//    presensi", karena itu FAKTA yang tidak ada di kolom lain mana pun.
// 3. Database e-Presensi punya baris bertanggal rusak (mis. "252026-01-22",
//    "0003-02-28"). Filter periode di query membuangnya, tapi jangan
//    berasumsi kolom tanggalnya selalu waras.
// 4. NAMA JENIS CUTI BISA BERTENTANGAN DENGAN ISINYA. Ada pegawai dengan 34
//    hari cuti berlabel "Cuti Sakit <1 bulan" di Juli 2026 - jelas bukan
//    kurang dari sebulan. Labelnya tetap dipakai apa adanya (menebak ulang
//    dari jumlah hari berarti menimpa keputusan pihak yang berwenang), TAPI
//    kasus seperti ini menghasilkan potongan yang terlalu kecil. Kalau nanti
//    ada pemeriksaan, ini salah satu tempat yang perlu diadu ke SK cutinya.
// ============================================================================

import pg from "pg";
import sql from "mssql";
import { konfigurasiSiap } from "../lib/siapConfig";
import {
  rekapDariLaporanPdf,
  JADWAL_KERJA_DEFAULT,
  type HasilRekapDariPdf,
} from "../business-logic/presensiPdfKeRekap";
import type { BarisPresensiPdf, LaporanPresensiPdf } from "../business-logic/presensiPdf";

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export interface HasilTarikPegawai {
  nip: string;
  nama: string | null;
  hasil: HasilRekapDariPdf;
}

export interface DilewatiTarik {
  idPegawai: string;
  nama: string | null;
  alasan: string;
}

export interface HasilTarikPeriode {
  periodeBulan: number;
  periodeTahun: number;
  totalBarisSumber: number;
  totalPegawaiSumber: number;
  pegawai: HasilTarikPegawai[];
  dilewati: DilewatiTarik[];
}

interface BarisEpresensi {
  id_pegawai: string;
  nama_pegawai: string | null;
  tanggal_iso: string;
  jam_masuk: string | null;
  jam_keluar: string | null;
  status: string | null;
  /** Nama jenis cuti dari tabel `cuti`, mis. "Cuti Besar II". null = bukan cuti. */
  jenis_cuti: string | null;
  /** Menit kerja hari itu menurut e-Presensi. 0 = tap pulang hilang. */
  menit_kerja: number | null;
  keterangan_potongan: string | null;
}

/**
 * Jumlah hari kerja (Senin-Jumat) dalam satu periode.
 *
 * KENAPA DIHITUNG SENDIRI: jalur PDF menurunkan `jumlahHariKerja` dari blok
 * "Kewajiban Jam Kerja" di file, dan blok itu TIDAK ADA di database. Tanpa
 * angka ini `jumlahHariKerja` jadi 0, dan uangMakan.ts memakainya sebagai
 * BATAS ATAS hari yang dibayar (Math.min) - artinya uang makan SELURUH
 * pegawai jadi Rp 0 tanpa ada error apa pun. Ketemu waktu verifikasi.
 *
 * Tanggal merah & cuti bersama DIKURANGKAN lewat parameter `hariLibur` (ISO
 * "YYYY-MM-DD"), sumbernya tabel `HariLiburNasional`. Tanpa itu angka ini
 * lebih besar dari hari kerja sebenarnya pada bulan bertanggal merah, dan
 * batas uang makannya ikut lebih longgar. Daftar kosong = perilaku lama
 * (Senin-Jumat saja).
 */
export function hariKerjaKalender(
  bulan: number,
  tahun: number,
  hariLibur: ReadonlySet<string> = new Set()
): number {
  let n = 0;
  for (let d = 1; d <= new Date(Date.UTC(tahun, bulan, 0)).getUTCDate(); d++) {
    const tanggal = new Date(Date.UTC(tahun, bulan - 1, d));
    const hari = tanggal.getUTCDay();
    if (hari < 1 || hari > 5) continue;
    if (hariLibur.has(tanggal.toISOString().slice(0, 10))) continue;
    n++;
  }
  return n;
}

/** "07:25" / "07:25:00" -> menit sejak 00:00. "00:00" dianggap TIDAK ADA. */
function keMenit(jam: string | null): number | null {
  if (!jam) return null;
  const m = jam.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const menit = Number(m[1]) * 60 + Number(m[2]);
  // 00:00 di e-Presensi berarti sel kosong / tidak menekan presensi, bukan
  // benar-benar hadir tengah malam. Perlakuannya sama dengan jalur PDF.
  return menit === 0 ? null : menit;
}

async function ambilBarisPresensi(bulan: number, tahun: number): Promise<BarisEpresensi[]> {
  const { EPRESENSI_HOST, EPRESENSI_PORT, EPRESENSI_DB, EPRESENSI_USER, EPRESENSI_PASSWORD } = process.env;
  if (!EPRESENSI_HOST || !EPRESENSI_DB || !EPRESENSI_USER || !EPRESENSI_PASSWORD) {
    throw new Error("Kredensial e-Presensi belum lengkap di .env (EPRESENSI_HOST/DB/USER/PASSWORD).");
  }
  const client = new pg.Client({
    host: EPRESENSI_HOST,
    port: EPRESENSI_PORT ? Number(EPRESENSI_PORT) : 5432,
    database: EPRESENSI_DB,
    user: EPRESENSI_USER,
    password: EPRESENSI_PASSWORD,
  });
  await client.connect();
  try {
    // tanggal di-cast ke teks di SQL supaya tidak bergeser hari oleh zona
    // waktu klien - pola yang sama dengan jalur PDF (tanggal apa adanya).
    const { rows } = await client.query<BarisEpresensi & { id_presensi: string }>(
      `SELECT p.id_presensi,
              p.id_pegawai,
              p.nama_pegawai,
              to_char(p.tanggal, 'YYYY-MM-DD') AS tanggal_iso,
              p.jam_masuk,
              p.jam_keluar,
              sk.nama_sistem_kerja AS status,
              p.menit_kerja,
              p.keterangan_potongan
         FROM presensi p
         LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
        WHERE p.tanggal >= make_date($1, $2, 1)
          AND p.tanggal <  (make_date($1, $2, 1) + interval '1 month')
        ORDER BY p.id_pegawai, p.tanggal`,
      [tahun, bulan]
    );

    // ------------------------------------------------------------------
    // JENIS CUTI - DUA QUERY TERPISAH, BUKAN JOIN KE QUERY DI ATAS
    // ------------------------------------------------------------------
    // Ini bukan pilihan gaya. `presensi_cuti` TIDAK punya index atas
    // `id_presensi` (satu-satunya index di tabel itu PK `id_presensi_cuti`),
    // jadi apa pun yang mencari per-baris ke sana memicu Seq Scan penuh atas
    // ±169.000 baris SETIAP KALI.
    //
    // Versi pertama modul ini memakai LEFT JOIN LATERAL ... LIMIT 1. Rencana
    // eksekusinya: Seq Scan presensi_cuti dijalankan sekali per baris
    // presensi - EXPLAIN memberi cost 212.999.001 untuk satu periode, lawan
    // 120.006 untuk bentuk di bawah (±1.775x). Terbukti di lapangan: tarikan
    // Juli 2026 berjalan 19 menit tanpa selesai, dan CPU proses cuma terpakai
    // 3 detik - semuanya menunggu database. Sinkronisasi yang tadinya
    // beberapa menit jadi tidak selesai sama sekali.
    //
    // MENAMBAH INDEX BUKAN PILIHAN - e-Presensi READ-ONLY tanpa kecuali, dan
    // itu database produksi yang sedang melayani presensi pegawai.
    //
    // Bentuk di bawah membaca seluruh keterkaitan cuti periode itu SEKALI
    // (hash join, satu lintasan), lalu pemasangannya ke tiap hari dilakukan
    // di memori. Sifat "satu hari = satu jenis cuti" tetap dijaga: dedup
    // di JS memakai baris TERBARU (ORDER BY createdAt ASC, yang belakangan
    // menimpa) - persis perilaku LIMIT 1 yang digantikan.
    const { rows: barisCuti } = await client.query<{ id_presensi: string; nama_cuti: string }>(
      `SELECT pc.id_presensi, c.nama_cuti
         FROM presensi_cuti pc
         JOIN cuti c ON c.id_cuti = pc.id_cuti
         JOIN presensi p ON p.id_presensi = pc.id_presensi
        WHERE p.tanggal >= make_date($1, $2, 1)
          AND p.tanggal <  (make_date($1, $2, 1) + interval '1 month')
        ORDER BY pc."createdAt" ASC`,
      [tahun, bulan]
    );
    const petaCuti = new Map<string, string>();
    for (const b of barisCuti) petaCuti.set(b.id_presensi, b.nama_cuti);

    return rows.map(({ id_presensi, ...b }) => ({
      ...b,
      jenis_cuti: petaCuti.get(id_presensi) ?? null,
    }));
  } finally {
    await client.end();
  }
}

/** PEGAWAIID SIAP -> NIP 18 digit. Dikirim per potongan supaya IN(...) tidak kepanjangan. */
async function petaIdKeNip(ids: string[]): Promise<Map<string, string>> {
  // Konfigurasinya WAJIB sama persis dengan importPegawaiSiap.ts - kalau
  // keduanya menunjuk instance berbeda, pemetaan id_pegawai->NIP dilakukan
  // terhadap daftar pegawai yang berbeda dari yang ada di Gajihub, dan
  // gagalnya diam-diam (cuma jadi "sekian pegawai dilewati").
  const pool = await sql.connect(konfigurasiSiap());
  const peta = new Map<string, string>();
  try {
    const POTONGAN = 500;
    for (let i = 0; i < ids.length; i += POTONGAN) {
      const bagian = ids.slice(i, i + POTONGAN).map((v) => `'${v.replace(/'/g, "''")}'`);
      const hasil = await pool.request().query<{ PEGAWAIID: string; NIPBARU: string }>(
        `SELECT LTRIM(RTRIM(PEGAWAIID)) AS PEGAWAIID, LTRIM(RTRIM(NIPBARU)) AS NIPBARU
           FROM dbo.PEGAWAI
          WHERE LTRIM(RTRIM(PEGAWAIID)) IN (${bagian.join(",")})
            AND NIPBARU IS NOT NULL AND LEN(LTRIM(RTRIM(NIPBARU))) = 18`
      );
      for (const r of hasil.recordset) peta.set(r.PEGAWAIID, r.NIPBARU);
    }
  } finally {
    await pool.close();
  }
  return peta;
}

/**
 * Status hari + jenis cutinya, dirangkai jadi SATU teks berformat
 * "Cuti - Cuti Besar II" - format yang SAMA PERSIS dengan yang muncul di
 * export PDF e-Presensi.
 *
 * Sengaja dirangkai di sini, bukan dibawa sebagai field terpisah sampai ke
 * business logic: `kategoriDariStatus()` sudah tahu cara memecah format itu,
 * dan sudah teruji. Menambah jalur kedua berarti dua tempat yang bisa
 * berbeda perilaku, dan bedanya baru ketahuan sebagai selisih rupiah.
 *
 * Jenis cuti cuma ditempelkan kalau statusnya memang CUTI. `presensi_cuti`
 * secara teori bisa memuat baris untuk hari non-cuti; kalau itu terjadi,
 * menempelkannya akan MENGUBAH kategori hari itu jadi cuti (kategori
 * ditentukan dari awalan teks) - hari kerja biasa berubah jadi hari cuti.
 */
export function gabungStatusCuti(status: string | null, jenisCuti: string | null): string {
  const s = (status ?? "").trim();
  if (!jenisCuti || !s.toLowerCase().startsWith("cuti")) return s;
  const j = jenisCuti.replace(/\s+/g, " ").trim();
  if (j === "") return s;
  return `${s} - ${j}`;
}

/** Baris database -> bentuk yang SAMA dengan hasil parsing PDF, supaya analisisnya dipakai ulang. */
function keLaporan(
  nip: string,
  nama: string | null,
  bulan: number,
  tahun: number,
  baris: BarisEpresensi[],
  hariLiburNasional: ReadonlySet<string>
): LaporanPresensiPdf {
  const barisPdf: BarisPresensiPdf[] = baris.map((b, i) => {
    const [y, m, d] = b.tanggal_iso.split("-").map(Number);
    const namaHari = NAMA_HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return {
      nomor: i + 1,
      halaman: 1,
      tanggalTeks: `${namaHari}, ${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`,
      namaHari,
      tanggal: d,
      bulan: m,
      tahun: y,
      jamMasukMenit: keMenit(b.jam_masuk),
      jamKeluarMenit: keMenit(b.jam_keluar),
      jamMasukTeks: b.jam_masuk,
      jamKeluarTeks: b.jam_keluar,
      lokasiKeluar: null,
      statusTeks: gabungStatusCuti(b.status, b.jenis_cuti),
      // Dipakai HANYA sebagai penanda "lupa presensi", tidak pernah sebagai nominal.
      potonganTeks: b.keterangan_potongan ?? "",
      aktivitas: null,
      // 0 = tap pulang hilang (jam keluarnya diisi 23:59 oleh e-Presensi).
      // Penanda Pasal 13 ayat (2) - lihat pemakaiannya di presensiPdfKeRekap.ts.
      menitKerja: b.menit_kerja,
    };
  });

  return {
    nip,
    nama,
    jabatan: null,
    periodeBulan: bulan,
    periodeTahun: tahun,
    ringkasanSumber: {
      // Blok "Summary Presensi" cuma ada di PDF - dari database tidak ada
      // pembandingnya, jadi dibiarkan null. rekapDariLaporanPdf sudah
      // melewati cek-silangnya kalau seluruh blok ini kosong.
      tidakHadir: null,
      izin: null,
      tugasBelajar: null,
      lembur: null,
      tidakPresensi: null,
      cuti: null,
      upacaraBendera: null,
      dinasKeluar: null,
      wfo: null,
      diklat: null,
      wfh: null,
      wfa: null,
      // SATU-SATUNYA yang diisi: dari sinilah jumlahHariKerja diturunkan
      // (kewajiban / 7,5 jam). Lihat hariKerjaKalender() di atas.
      kewajibanJamKerja:
        hariKerjaKalender(bulan, tahun, hariLiburNasional) * JADWAL_KERJA_DEFAULT.jamKerjaPerHari,
      kekuranganJamKerja: null,
    },
    baris: barisPdf,
    halamanMulai: 1,
    peringatan: [],
  };
}

/**
 * Tarik & analisis presensi SATU PERIODE untuk SEMUA pegawai yang ada di
 * e-Presensi. TIDAK menulis apa pun ke database manapun - pemanggil yang
 * memutuskan mana yang boleh disimpan (otorisasi per pegawai) dan menyimpannya
 * lewat simpanHasilPresensi().
 */
export async function tarikPresensiPeriode(
  bulan: number,
  tahun: number,
  /**
   * Tanggal ISO yang ditandai kendala e-Presensi untuk pegawai ber-NIP itu
   * (Pasal 10 ayat (2)) - lihat `kendalaEpresensi.ts`.
   *
   * Diterima sebagai FUNGSI, bukan daftar jadi: penandanya bisa ber-scope
   * satuan kerja, dan yang tahu satuan kerja tiap NIP adalah database
   * Gajihub - yang tidak boleh disentuh adapter ini. Pemanggil yang
   * menutupnya dalam closure.
   */
  tanggalKendalaUntuk: (nip: string) => ReadonlySet<string> = () => new Set(),
  /**
   * Jam hasil koreksi petugas absensi untuk pegawai ber-NIP itu. Alasan
   * bentuknya fungsi sama dengan parameter di atas: sumbernya database
   * Gajihub, yang tidak boleh disentuh adapter ini.
   */
  koreksiJamUntuk: (
    nip: string
  ) => ReadonlyMap<string, { jamMasukMenit: number | null; jamKeluarMenit: number | null }> = () => new Map(),
  /**
   * Tanggal merah & cuti bersama (ISO -> keterangan), dari tabel
   * `HariLiburNasional`. Berlaku sama untuk semua pegawai - jadi cukup satu
   * daftar, tidak perlu fungsi per-NIP seperti dua parameter di atas.
   */
  hariLiburNasional: ReadonlyMap<string, string> = new Map()
): Promise<HasilTarikPeriode> {
  const kunciLibur = new Set(hariLiburNasional.keys());
  const baris = await ambilBarisPresensi(bulan, tahun);

  const perPegawai = new Map<string, BarisEpresensi[]>();
  for (const b of baris) {
    const id = (b.id_pegawai ?? "").trim();
    if (!id) continue;
    const daftar = perPegawai.get(id);
    if (daftar) daftar.push(b);
    else perPegawai.set(id, [b]);
  }

  const peta = await petaIdKeNip([...perPegawai.keys()]);

  const pegawai: HasilTarikPegawai[] = [];
  const dilewati: DilewatiTarik[] = [];
  for (const [id, rows] of perPegawai) {
    const nama = rows.find((r) => r.nama_pegawai)?.nama_pegawai ?? null;
    const nip = peta.get(id);
    if (!nip) {
      dilewati.push({
        idPegawai: id,
        nama,
        alasan:
          id.length === 36
            ? "ID pegawai berbentuk UUID - tidak terdaftar di SIAP, tidak dicocokkan lewat nama"
            : "ID pegawai tidak ketemu di SIAP",
      });
      continue;
    }
    pegawai.push({
      nip,
      nama,
      hasil: rekapDariLaporanPdf(
        keLaporan(nip, nama, bulan, tahun, rows, kunciLibur),
        JADWAL_KERJA_DEFAULT,
        tanggalKendalaUntuk(nip),
        koreksiJamUntuk(nip),
        hariLiburNasional
      ),
    });
  }

  return {
    periodeBulan: bulan,
    periodeTahun: tahun,
    totalBarisSumber: baris.length,
    totalPegawaiSumber: perPegawai.size,
    pegawai,
    dilewati,
  };
}
