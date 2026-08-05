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
// TODO(confirm) - PERBEDAAN ANGKA YANG HARUS DISADARI
// ---------------------------------------------------------------------------
// 1. e-Presensi memberi TOLERANSI KETERLAMBATAN 60 MENIT (kolom
//    sistem_kerja.toleransi untuk WFO/WFH/WFA = 60), Gajihub memakai 0 karena
//    Pasal 13 ayat (3) memotong "setiap 1 (satu) menit" tanpa menyebut
//    toleransi. AKIBATNYA potongan Gajihub LEBIH BESAR dari yang tertera di
//    e-Presensi. Ini memang yang diinginkan (PROGRESS.md butir 5), tapi
//    sekarang angkanya punya penjelasan pasti. Kalau toleransi itu ternyata
//    punya dasar resmi, ubah `toleransiTerlambatMenit` di
//    JADWAL_KERJA_DEFAULT - JANGAN dipatch di sini.
// 2. Kolom `potongan`, `keterangan_potongan`, dan tabel `potongan_tukin` di
//    e-Presensi DIABAIKAN sebagai nominal - Gajihub menghitung sendiri sesuai
//    Permenaker 15/2024. Dari kolom itu yang diambil HANYA penanda "lupa
//    presensi", karena itu FAKTA yang tidak ada di kolom lain mana pun.
// 3. Database e-Presensi punya baris bertanggal rusak (mis. "252026-01-22",
//    "0003-02-28"). Filter periode di query membuangnya, tapi jangan
//    berasumsi kolom tanggalnya selalu waras.
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
 * TODO(confirm): LIBUR NASIONAL TIDAK DIKENALI - belum ada kalender libur di
 * sistem ini (tabel `libur` di e-Presensi ada tapi KOSONG). Jadi angka ini
 * bisa lebih besar dari hari kerja sebenarnya pada bulan bertanggal merah,
 * dan batas uang makannya ikut lebih longgar. Keterbatasan yang sama dengan
 * jalur PDF, cuma di sini sumbernya kalender bukan file.
 */
export function hariKerjaKalender(bulan: number, tahun: number): number {
  let n = 0;
  for (let d = 1; d <= new Date(Date.UTC(tahun, bulan, 0)).getUTCDate(); d++) {
    const hari = new Date(Date.UTC(tahun, bulan - 1, d)).getUTCDay();
    if (hari >= 1 && hari <= 5) n++;
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
    const { rows } = await client.query<BarisEpresensi>(
      `SELECT p.id_pegawai,
              p.nama_pegawai,
              to_char(p.tanggal, 'YYYY-MM-DD') AS tanggal_iso,
              p.jam_masuk,
              p.jam_keluar,
              sk.nama_sistem_kerja AS status,
              p.keterangan_potongan
         FROM presensi p
         LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
        WHERE p.tanggal >= make_date($1, $2, 1)
          AND p.tanggal <  (make_date($1, $2, 1) + interval '1 month')
        ORDER BY p.id_pegawai, p.tanggal`,
      [tahun, bulan]
    );
    return rows;
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

/** Baris database -> bentuk yang SAMA dengan hasil parsing PDF, supaya analisisnya dipakai ulang. */
function keLaporan(
  nip: string,
  nama: string | null,
  bulan: number,
  tahun: number,
  baris: BarisEpresensi[]
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
      statusTeks: (b.status ?? "").trim(),
      // Dipakai HANYA sebagai penanda "lupa presensi", tidak pernah sebagai nominal.
      potonganTeks: b.keterangan_potongan ?? "",
      aktivitas: null,
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
      kewajibanJamKerja: hariKerjaKalender(bulan, tahun) * JADWAL_KERJA_DEFAULT.jamKerjaPerHari,
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
export async function tarikPresensiPeriode(bulan: number, tahun: number): Promise<HasilTarikPeriode> {
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
    pegawai.push({ nip, nama, hasil: rekapDariLaporanPdf(keLaporan(nip, nama, bulan, tahun, rows), JADWAL_KERJA_DEFAULT) });
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
