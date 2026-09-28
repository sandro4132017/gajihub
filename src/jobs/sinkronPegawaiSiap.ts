// ============================================================================
// SINKRONISASI PEGAWAI DARI SIAP - logikanya, tanpa satu pun baris yang
// dijalankan saat modul ini di-import.
//
// DIPECAH DARI importPegawaiSiap.ts (2026-09-24). Berkas itu memanggil
// `main()` di baris teratasnya, jadi meng-import apa pun darinya - bukan
// menjalankannya, sekadar mengimpornya - akan menjalankan SELURUH
// sinkronisasi 5.078 pegawai. Jebakan yang sama persis dengan
// seedSimulasi.ts, dan yang menghalangi tombol sinkronisasi di UI.
//
// Sekarang: modul ini isinya, importPegawaiSiap.ts pembungkus CLI-nya, dan
// Server Action di /admin/sistem memanggil fungsi yang SAMA. Pola yang sama
// dengan presensi (EpresensiAdapter + simpanRekapPresensi + CLI tipis), dan
// alasannya sama: angka dari tombol dan dari terminal tidak boleh berbeda.
//
// DUA LANGKAH, bukan satu. `periksaSinkronPegawai()` membaca SIAP dan
// menyusun RENCANA tanpa menulis apa pun; `terapkanSinkronPegawai()` yang
// menulis. Sinkronisasi ini memindahkan orang antar unit, dan perpindahan
// unit menyeret seluruh riwayat pembayaran orang itu - lihat catatan di
// terapkanSinkronPegawai(). Perubahan sebesar itu pantas dilihat dulu.
//
// READ-ONLY terhadap SIAP - HANYA SELECT, tidak pernah menulis. SIAP adalah
// source of truth kepegawaian, Gajihub cuma mirror-nya.
//
// BUKAN live sync: snapshot manual, perlu dijalankan ulang tiap data SIAP
// berubah. Kredensial dari .env (SIAP_*), JANGAN di-hardcode.
//
//   npx tsx src/jobs/importPegawaiSiap.ts                # semua pegawai aktif
//   npx tsx src/jobs/importPegawaiSiap.ts --satker=0101  # satu Eselon I
//   npx tsx src/jobs/importPegawaiSiap.ts --dry-run
//
// PEMETAAN KOLOM (hasil penelusuran ke database, bukan tebakan):
//   nip           <- PEGAWAI.NIPBARU (18 digit; kolom NIP 9 digit TIDAK dipakai)
//   nama          <- PEGAWAI.NAMA
//   unitKerja     <- SATKER.SATKER pada SATKERID persis (unit terdalam)
//   satuanKerja   <- SATKER.SATKER pada LEFT(SATKERID,6) = Eselon II.
//                    SATKERID hirarkis: 4 digit Eselon I, 6 digit Eselon II.
//                    INI yang dipakai SELURUH scoping kewenangan Gajihub.
//   jabatan       <- RIWAYATJABATAN.NAMAJABATAN terbaru
//   golongan      <- PANGKAT.KODEPANGKAT via VWPANGKATTERAKHIR
//   tmtSkTerakhir <- VWPANGKATTERAKHIR.TMTPANGKAT
//   statusKawin   <- PEGAWAI.STATUSKAWIN (K/B/C/J/D) - fakta, bukan kode PTKP
//   jenisKelamin  <- PEGAWAI.JENISKELAMIN (L/P) - dibutuhkan aturan wanita
//                    kawin PMK 168/2023, lihat src/business-logic/ptkp.ts
//   jumlahAnakTanggungan <- COUNT(ANAK) yang kolom PEKERJAAN-nya kosong
//   kelasJabatan  <- MASTERFUNGSIONAL.JOBGRADE (fungsional/pelaksana) atau
//                    SATKER.JOBGRADE (struktural). PEGAWAI.JOBGRADE kosong
//                    total, jangan dipakai. Nilai di luar 1-17 dibuang jadi null.
//
// DATA PRIBADI TIDAK DIIMPOR (alamat, NPWP, NIK, telepon, email, rekening,
// foto, dst) - skema tidak punya kolomnya. Rekening punya jalurnya sendiri
// lewat /ppabp/rekening; JANGAN diambil dari sini.
//
// Filter aktif: STATUSPEGAWAIID IN ('1','2','23') = CPNS/PNS/PPPK.
// Pegawai yang hilang dari daftar aktif DITANDAI (PENSIUN/BERHENTI/NONAKTIF/
// TIDAK_DI_SIAP) lewat langkah "Rekonsiliasi status", TIDAK PERNAH dihapus -
// yang pensiun di tengah tahun tetap berhak atas tukin bulan yang sudah
// dikerjakannya. Penandaan ini bisa berbalik sendiri kalau SIAP dikoreksi.
//
// JANGAN menormalkan golongan PPPK ("IX") jadi format PNS ("III/a") - sufiks
// huruf itulah yang membedakan keduanya, dan begitu hilang PPPK jenjang bawah
// tidak bisa dibedakan lagi dari PNS.
//
// TODO(confirm): (1) belum ada penegasan resmi bahwa JOBGRADE adalah kelas
// jabatan TERKINI yang dipakai membayar tukin - angka ini langsung menentukan
// tarif, WAJIB dicek silang ke Biro OSDMA; (2) STATUSPEGAWAIID mencampur
// JENIS kepegawaian dengan status, pemetaan yang lebih halus perlu dibahas.
// Detail lengkap & angka terukurnya ada di CLAUDE.md.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import sql from "mssql";
import { konfigurasiSiap, labelSumberSiap } from "../lib/siapConfig";
import { kunciSidikNik, normalkanNik, sidikNik } from "../auth/sidikNik";

// Prisma memuat .env sendiri buat DATABASE_URL, tapi variabel SIAP_* di
// bawah dibaca langsung dari process.env - jadi .env perlu dimuat eksplisit.
// process.loadEnvFile ada sejak Node 20.12; kalau tidak ada, variabelnya
// diharapkan sudah di-set dari environment shell.
try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  // .env tidak ada - biarkan, pengecekan kredensial di bawah yang melapor.
}

// STATUSPEGAWAIID di SIAP yang dianggap pegawai aktif (lihat dbo.STATUSPEGAWAI):
// '1' CPNS, '2' PNS, '23' PPPK. Sengaja TIDAK termasuk '3' Pensiun,
// '8' Pemberhentian, dan '9' (tidak terdaftar di tabel lookup).
const STATUS_AKTIF = ["1", "2", "23"];

interface BarisSiap {
  nip: string | null;
  nama: string | null;
  unitKerja: string | null;
  satuanKerja: string | null;
  jabatan: string | null;
  golongan: string | null;
  tmtPangkat: Date | null;
  kelasJabatan: string | null;
  statusKawin: string | null;
  jenisKelamin: string | null;
  jumlahAnakTanggungan: number | null;
  sumberKelasJabatan: string | null;
  /**
   * NIK - SATU-SATUNYA data pribadi yang diambil, dan **tidak pernah
   * disimpan**. Dipakai sekali di memori untuk menghitung `sidikNik` (HMAC),
   * lalu dibuang. Lihat `src/auth/sidikNik.ts` untuk alasannya: Naco cuma
   * mengirim NIK, sementara seluruh data Gajihub berkunci NIP.
   */
  nik: string | null;
}

/**
 * Pemetaan STATUSPEGAWAIID SIAP -> nilai `Pegawai.statusPegawai` Gajihub,
 * KHUSUS untuk status yang bukan pegawai aktif.
 *
 * Kode aktif ('1' CPNS, '2' PNS, '23' PPPK) tidak ada di sini karena mereka
 * ditangani jalur upsert biasa. Kode yang tidak dikenal sengaja jadi
 * "NONAKTIF" yang generik daripada ditebak artinya - lebih baik kabur tapi
 * jujur daripada spesifik tapi salah.
 */
const STATUS_NONAKTIF: Record<string, string> = {
  "3": "PENSIUN",
  "8": "BERHENTI",
  "0": "USULAN_CPNS",
};

/** Status terkini di SIAP untuk sekumpulan NIP, tanpa filter status apa pun. */
async function ambilStatusDariSiap(nips: string[]): Promise<Map<string, string>> {
  const peta = new Map<string, string>();
  if (nips.length === 0) return peta;

  const pool = await sql.connect(konfigurasiSiap());
  try {
    const POTONGAN = 500;
    for (let i = 0; i < nips.length; i += POTONGAN) {
      const bagian = nips.slice(i, i + POTONGAN).map((n) => `'${n.replace(/'/g, "''")}'`);
      const hasil = await pool.request().query<{ nip: string; status: string | null }>(
        `SELECT LTRIM(RTRIM(NIPBARU)) AS nip, LTRIM(RTRIM(STATUSPEGAWAIID)) AS status
           FROM dbo.PEGAWAI
          WHERE LTRIM(RTRIM(NIPBARU)) IN (${bagian.join(",")})`
      );
      for (const r of hasil.recordset) {
        peta.set(r.nip, STATUS_NONAKTIF[r.status ?? ""] ?? "NONAKTIF");
      }
    }
  } finally {
    await pool.close();
  }
  return peta;
}

async function ambilDariSiap(prefixSatker: string | null): Promise<BarisSiap[]> {
  const pool = await sql.connect(konfigurasiSiap());
  try {
    const request = pool.request();
    request.input("prefix", sql.VarChar, prefixSatker ? `${prefixSatker}%` : null);

    // OUTER APPLY dipakai buat "ambil 1 baris terbaru per pegawai" - lebih
    // aman daripada GROUP BY karena NAMAJABATAN-nya ikut terbawa dari baris
    // yang sama dengan TMTJABATAN-nya.
    const hasil = await request.query<BarisSiap>(`
      SELECT
        LTRIM(RTRIM(p.NIPBARU))            AS nip,
        LTRIM(RTRIM(p.NAMA))               AS nama,
        sUnit.SATKER                       AS unitKerja,
        sEs2.SATKER                        AS satuanKerja,
        rj.NAMAJABATAN                     AS jabatan,
        pk.KODEPANGKAT                     AS golongan,
        vp.TMTPANGKAT                      AS tmtPangkat,
        LTRIM(RTRIM(p.NIK))                AS nik,
        LTRIM(RTRIM(p.STATUSKAWIN))        AS statusKawin,
        LTRIM(RTRIM(p.JENISKELAMIN))       AS jenisKelamin,
        ISNULL(anakTgg.n, 0)               AS jumlahAnakTanggungan,
        COALESCE(
          NULLIF(LTRIM(RTRIM(mf.JOBGRADE)), ''),
          NULLIF(LTRIM(RTRIM(sJab.JOBGRADE)), '')
        )                                  AS kelasJabatan,
        CASE
          WHEN NULLIF(LTRIM(RTRIM(mf.JOBGRADE)), '')   IS NOT NULL THEN 'MASTERFUNGSIONAL'
          WHEN NULLIF(LTRIM(RTRIM(sJab.JOBGRADE)), '') IS NOT NULL THEN 'SATKER'
          ELSE NULL
        END                                AS sumberKelasJabatan
      FROM dbo.PEGAWAI p
      LEFT JOIN dbo.SATKER sUnit ON sUnit.SATKERID = p.SATKERID
      LEFT JOIN dbo.SATKER sEs2  ON sEs2.SATKERID  = LEFT(p.SATKERID, 6)
      LEFT JOIN dbo.VWPANGKATTERAKHIR vp ON vp.PEGAWAIID = p.PEGAWAIID AND vp.RANKING = 1
      LEFT JOIN dbo.PANGKAT pk ON pk.PANGKATID = vp.PANGKATID
      OUTER APPLY (
        SELECT TOP 1 x.NAMAJABATAN, x.FUNGSIONALID, x.SATKERID
        FROM dbo.RIWAYATJABATAN x
        WHERE x.PEGAWAIID = p.PEGAWAIID AND x.NAMAJABATAN IS NOT NULL
        ORDER BY x.TMTJABATAN DESC
      ) rj
      -- Kelas jabatan menempel pada JABATAN, bukan pada orangnya:
      -- fungsional & pelaksana -> MASTERFUNGSIONAL, struktural -> SATKER.
      LEFT JOIN dbo.MASTERFUNGSIONAL mf ON mf.FUNGSIONALID = rj.FUNGSIONALID
      LEFT JOIN dbo.SATKER sJab          ON sJab.SATKERID  = rj.SATKERID
      -- Calon tanggungan PTKP dari sisi anak: yang kolom PEKERJAAN-nya
      -- kosong. JANGAN pakai STATUSTUNJANGAN - kolom itu mengikuti aturan
      -- TUNJANGAN KELUARGA (maksimal 2 anak), sementara PTKP mengakui 3
      -- tanggungan dengan syarat yang berbeda. Dua aturan, dua angka.
      OUTER APPLY (
        SELECT COUNT(*) AS n
        FROM dbo.ANAK a
        WHERE a.PEGAWAIID = p.PEGAWAIID
          AND (a.PEKERJAAN IS NULL OR LTRIM(RTRIM(a.PEKERJAAN)) = '')
      ) anakTgg
      WHERE p.STATUSPEGAWAIID IN ('${STATUS_AKTIF.join("','")}')
        AND p.NIPBARU IS NOT NULL
        AND LEN(LTRIM(RTRIM(p.NIPBARU))) = 18
        AND (@prefix IS NULL OR p.SATKERID LIKE @prefix)
    `);
    return hasil.recordset;
  } finally {
    await pool.close();
  }
}

// ---------------------------------------------------------------------------
// RENCANA & HASIL - bentuk yang dikembalikan, bukan dicetak.
//
// Modul ini TIDAK memanggil console.log sama sekali. Yang memanggilnya bisa
// terminal (mencetak) atau halaman web (merender tabel), dan keduanya butuh
// angka yang sama. Mencetak di dalam sini berarti jalur UI kehilangan separuh
// keterangannya.
// ---------------------------------------------------------------------------

/** Ditulis per batch supaya ribuan upsert tidak jadi satu transaksi raksasa. */
const UKURAN_BATCH = 100;

export interface PerubahanPegawai {
  nip: string;
  nama: string;
  dari: string;
  ke: string;
  /**
   * Unit pegawai ini SESUDAH sinkronisasi - dipakai men-scope daftar
   * perubahan ke unit yang berkepentingan.
   *
   * Untuk PINDAH UNIT nilainya sama dengan `ke`, dan di situ `dari` ikut
   * dipakai: dua unit sama-sama perlu tahu.
   */
  satuanKerja: string;
}

export interface RencanaSinkronPegawai {
  /** Instance SIAP yang dibaca - ikut dilaporkan karena ada dua yang datanya beda. */
  sumber: string;
  dibacaDariSiap: number;
  siapDisimpan: number;
  tanpaGolongan: number;
  tanpaJabatan: number;
  /** Dikelompokkan per alasan, bukan satu baris per pegawai. */
  dilewati: { alasan: string; jumlah: number }[];
  /** Pegawai yang BELUM ada di Gajihub sama sekali. */
  pegawaiBaru: { nip: string; nama: string; satuanKerja: string }[];
  /**
   * PINDAH UNIT - yang paling berat akibatnya, jadi didaftar lengkap.
   *
   * Seluruh scoping Gajihub memakai `Pegawai.satuanKerja` yang dibaca SAAT ITU
   * JUGA: TukinCalculation, UangMakan, UangLembur, RekapPresensiPeriode dan
   * PresensiHarian tidak menyimpan satuan kerja sendiri. Jadi memindahkan satu
   * orang memindahkan SELURUH riwayat pembayarannya ke unit baru - termasuk
   * periode yang sudah dikirim dan dikunci unit lama, yang berarti orang itu
   * bisa hilang dari berkas ADK periode tersebut.
   */
  pindahUnit: PerubahanPegawai[];
  /** Tidak lagi aktif di SIAP: PENSIUN / BERHENTI / NONAKTIF / TIDAK_DI_SIAP. */
  gantiStatus: PerubahanPegawai[];
  /**
   * KELAS JABATAN BERUBAH - yang paling langsung menggeser rupiah.
   *
   * Tarif tukin pokok diturunkan SELURUHNYA dari kelas jabatan, jadi satu
   * angka yang bergeser di sini mengubah pembayaran orang itu tanpa ada
   * satu pun kolom lain yang ikut berubah. Sampai 2026-09-24 perubahan ini
   * tidak pernah terdeteksi sama sekali - sinkronisasi cuma membandingkan
   * satuan kerja dan status.
   */
  gantiKelasJabatan: PerubahanPegawai[];
  /** Jabatan berubah - tidak selalu menggeser rupiah, tapi selalu menyertainya. */
  gantiJabatan: PerubahanPegawai[];
  /** Sudah ada dan unitnya tetap - nama/jabatan/golongan/kelas bisa berubah. */
  jumlahDiperbarui: number;
}

export interface HasilSinkronPegawai {
  rencana: RencanaSinkronPegawai;
  tersimpan: number;
  /** Baris yang masuk Daftar Perubahan Data Kepegawaian. */
  perubahanTercatat: number;
  statusDiperbarui: number;
  sidikNikTerisi: number;
  sidikNikDilewati: number;
  /** null = tidak ada yang perlu dikatakan soal padanan SSO. */
  catatanSidikNik: string | null;
}

/** Baris SIAP yang lolos penyaringan, beserta alasan yang tidak lolos. */
function saringBarisSiap(baris: BarisSiap[]): {
  siap: BarisSiap[];
  dilewati: { alasan: string; jumlah: number }[];
} {
  const alasan = new Map<string, number>();
  const catat = (a: string) => alasan.set(a, (alasan.get(a) ?? 0) + 1);

  const siap = baris.filter((b) => {
    if (!b.nip || !b.nama) {
      catat("NIP atau nama kosong di SIAP");
      return false;
    }
    if (!b.satuanKerja && !b.unitKerja) {
      catat("Satuan kerja tidak terpetakan di dbo.SATKER");
      return false;
    }
    // BARIS UJI COBA DI SIAP. Nyata, bukan jaga-jaga: baris bernama dummy ada
    // di SIAP dan ikut tersinkron ke Gajihub, lalu muncul di daftar "pegawai
    // belum punya predikat" dan menahan unitnya dari mengirim rekap.
    // Menghapusnya di Gajihub tidak menyelesaikan apa pun - sinkronisasi
    // berikutnya membawanya kembali.
    //
    // Sengaja HANYA yang namanya DIAWALI dummy, bukan mengandung: nama orang
    // Indonesia tidak diawali kata itu, sementara "mengandung" bisa menjaring
    // nama sah yang kebetulan memuat rangkaian huruf yang sama.
    if (/^dummy/i.test(b.nama.trim())) {
      catat("Baris uji coba di SIAP (nama diawali dummy)");
      return false;
    }
    return true;
  });

  return {
    siap,
    dilewati: [...alasan]
      .map(([a, jumlah]) => ({ alasan: a, jumlah }))
      .sort((x, y) => y.jumlah - x.jumlah),
  };
}

const bersih = (v: string | null | undefined) => (v ?? "").trim();
const satkerDari = (b: BarisSiap) => bersih(b.satuanKerja) || bersih(b.unitKerja);

/**
 * Kelas jabatan yang SAH: bilangan bulat 1-17, selain itu null.
 *
 * WAJIB dipakai oleh jalur PERIKSA dan jalur TERAPKAN sama-sama. Kalau
 * pembandingnya memakai nilai mentah sementara yang disimpan nilai yang sudah
 * dinormalkan, setiap pegawai berkelas di luar 1-17 akan terlihat "berubah"
 * pada SETIAP sinkronisasi - dan daftar perubahan yang selalu penuh persis
 * sama tidak bergunanya dengan daftar yang selalu kosong.
 */
export function normalkanKelasJabatan(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 17 ? n : null;
}

/** Jabatan yang tersimpan selalu hasil trim, atau null. Lihat alasan di atas. */
const jabatanDari = (b: BarisSiap) => (b.jabatan ? b.jabatan.trim() : null);

/**
 * Susun RENCANA tanpa menulis apa pun.
 *
 * Membaca SIAP (READ-ONLY seperti biasa) dan tabel Pegawai Gajihub, lalu
 * membandingkan keduanya. Tidak ada satu pun create/update di jalur ini.
 */
export async function periksaSinkronPegawai(
  prisma: PrismaClient,
  prefixSatker: string | null = null
): Promise<RencanaSinkronPegawai> {
  const baris = await ambilDariSiap(prefixSatker);
  const { siap, dilewati } = saringBarisSiap(baris);

  const adaDiGajihub = await prisma.pegawai.findMany({
    select: {
      nip: true,
      nama: true,
      satuanKerja: true,
      statusPegawai: true,
      kelasJabatan: true,
      jabatan: true,
    },
  });
  const peta = new Map(adaDiGajihub.map((p) => [p.nip, p]));

  const pegawaiBaru: RencanaSinkronPegawai["pegawaiBaru"] = [];
  const pindahUnit: PerubahanPegawai[] = [];
  const gantiKelasJabatan: PerubahanPegawai[] = [];
  const gantiJabatan: PerubahanPegawai[] = [];
  let jumlahDiperbarui = 0;

  for (const b of siap) {
    const nip = bersih(b.nip);
    const lama = peta.get(nip);
    const satuanKerja = satkerDari(b);
    const nama = bersih(b.nama);
    if (!lama) {
      pegawaiBaru.push({ nip, nama, satuanKerja });
      continue;
    }
    jumlahDiperbarui++;
    if (lama.satuanKerja !== satuanKerja) {
      pindahUnit.push({ nip, nama, dari: lama.satuanKerja, ke: satuanKerja, satuanKerja });
    }

    // Kelas jabatan & jabatan dibandingkan memakai fungsi normalisasi yang
    // SAMA dengan yang menulis ke database (lihat normalkanKelasJabatan).
    const kelasBaru = normalkanKelasJabatan(b.kelasJabatan);
    if (lama.kelasJabatan !== kelasBaru) {
      gantiKelasJabatan.push({
        nip,
        nama,
        // "(kosong)" bukan string sembarang - ia membedakan "kelasnya
        // dihapus di SIAP" dari "kelasnya tidak diketahui sejak awal", dan
        // keduanya menuntut tindakan berbeda.
        dari: lama.kelasJabatan === null ? "(kosong)" : String(lama.kelasJabatan),
        ke: kelasBaru === null ? "(kosong)" : String(kelasBaru),
        satuanKerja,
      });
    }

    const jabatanBaru = jabatanDari(b);
    if ((lama.jabatan ?? "") !== (jabatanBaru ?? "")) {
      gantiJabatan.push({
        nip,
        nama,
        dari: lama.jabatan ?? "(kosong)",
        ke: jabatanBaru ?? "(kosong)",
        satuanKerja,
      });
    }
  }

  // Rekonsiliasi status - siapa yang TIDAK lagi ada di daftar aktif SIAP.
  // Ditanyakan balik ke SIAP, karena hilang dari daftar aktif tidak memberi
  // tahu SEBABNYA.
  const nipAktif = new Set(siap.map((b) => bersih(b.nip)));
  const perluDicek = adaDiGajihub.filter((p) => !nipAktif.has(p.nip));
  const gantiStatus: PerubahanPegawai[] = [];
  if (perluDicek.length > 0) {
    const statusSiap = await ambilStatusDariSiap(perluDicek.map((p) => p.nip));
    for (const p of perluDicek) {
      const label = statusSiap.get(p.nip) ?? "TIDAK_DI_SIAP";
      if (p.statusPegawai !== label) {
        gantiStatus.push({
          nip: p.nip,
          nama: p.nama,
          dari: p.statusPegawai,
          ke: label,
          satuanKerja: p.satuanKerja,
        });
      }
    }
  }

  return {
    sumber: labelSumberSiap(),
    dibacaDariSiap: baris.length,
    siapDisimpan: siap.length,
    tanpaGolongan: siap.filter((b) => !b.golongan).length,
    tanpaJabatan: siap.filter((b) => !b.jabatan).length,
    dilewati,
    pegawaiBaru,
    pindahUnit,
    gantiStatus,
    gantiKelasJabatan,
    gantiJabatan,
    jumlahDiperbarui,
  };
}

/**
 * Simpan DAFTAR PERUBAHAN DATA KEPEGAWAIAN periode ini.
 *
 * Dipanggil SESUDAH seluruh tulisan ke tabel Pegawai selesai, dan memakai
 * rencana yang disusun SEBELUMNYA - itulah satu-satunya saat selisih antara
 * SIAP dan Gajihub masih bisa dilihat. Sesudah upsert berjalan, keduanya sudah
 * sama dan tidak ada lagi yang bisa dibandingkan.
 *
 * IDEMPOTEN DENGAN SENDIRINYA: pembandingnya adalah isi tabel Pegawai saat itu,
 * jadi sinkronisasi berikutnya tidak lagi melihat selisih yang sama dan tidak
 * menulis baris kembar. Tidak perlu unique key untuk itu - dan memang tidak
 * boleh ada: satu orang bisa sah berpindah unit dua kali dalam setahun, dan
 * kedua perpindahan itu dua kejadian berbeda yang dua-duanya harus tercatat.
 */
async function simpanDaftarPerubahan(
  prisma: PrismaClient,
  rencana: RencanaSinkronPegawai,
  terdeteksiOlehId: string | null,
  terdeteksiPada: Date
): Promise<number> {
  const baris: {
    nip: string;
    nama: string;
    jenis: string;
    dari: string | null;
    ke: string | null;
    satuanKerjaDari: string | null;
    satuanKerjaKe: string | null;
    terdeteksiPada: Date;
    terdeteksiOlehId: string | null;
  }[] = [];

  const catat = (
    jenis: string,
    c: { nip: string; nama: string; dari?: string; ke?: string },
    satuanKerjaDari: string | null,
    satuanKerjaKe: string | null
  ) =>
    baris.push({
      nip: c.nip,
      nama: c.nama,
      jenis,
      dari: c.dari ?? null,
      ke: c.ke ?? null,
      satuanKerjaDari,
      satuanKerjaKe,
      terdeteksiPada,
      terdeteksiOlehId,
    });

  // Pegawai baru: tidak punya unit LAMA, jadi hanya unit tujuan yang diisi.
  //
  // TIDAK DIBATASI jumlahnya walau sinkronisasi PERTAMA di server kosong akan
  // mencatat seluruh roster sekaligus. Memotongnya berarti menyembunyikan
  // perubahan sungguhan pada hari-hari berikutnya, dan itu justru kebalikan
  // dari gunanya daftar ini.
  for (const p of rencana.pegawaiBaru) {
    catat("PEGAWAI_BARU", { nip: p.nip, nama: p.nama, ke: p.satuanKerja }, null, p.satuanKerja);
  }

  // PINDAH UNIT mengisi KEDUA kolom unit - ini satu-satunya jenis yang
  // muncul di daftar dua unit sekaligus, dan memang harus begitu.
  for (const c of rencana.pindahUnit) catat("PINDAH_UNIT", c, c.dari, c.ke);

  for (const c of rencana.gantiStatus) catat("GANTI_STATUS", c, c.satuanKerja, c.satuanKerja);
  for (const c of rencana.gantiKelasJabatan) catat("KELAS_JABATAN", c, c.satuanKerja, c.satuanKerja);
  for (const c of rencana.gantiJabatan) catat("JABATAN", c, c.satuanKerja, c.satuanKerja);

  if (baris.length === 0) return 0;

  for (let i = 0; i < baris.length; i += UKURAN_BATCH) {
    await prisma.perubahanDataPegawai.createMany({ data: baris.slice(i, i + UKURAN_BATCH) });
  }
  return baris.length;
}

/**
 * Terapkan sinkronisasi - DI SINI baru ada tulisan ke database Gajihub.
 *
 * SIAP DIBACA ULANG, bukan memakai rencana yang dioper dari luar. Dua
 * sebabnya: data 5.000 pegawai tidak pantas bolak-balik lewat permintaan
 * HTTP, dan apa pun yang datang dari sisi klien tidak boleh dipercaya sebagai
 * isi yang ditulis ke database kepegawaian. Rencana itu PRATINJAU, bukan
 * muatan.
 *
 * Yang dikembalikan menyertakan rencana hasil pembacaan ulang itu, jadi kalau
 * SIAP sempat berubah di antara dua langkah, yang benar-benar terjadi tetap
 * terlihat apa adanya - bukan angka pratinjau yang sudah basi.
 */
export async function terapkanSinkronPegawai(
  prisma: PrismaClient,
  prefixSatker: string | null = null,
  /** Akun yang menekan tombol. null = dijalankan lewat CLI. */
  terdeteksiOlehId: string | null = null
): Promise<HasilSinkronPegawai> {
  const rencana = await periksaSinkronPegawai(prisma, prefixSatker);
  const baris = await ambilDariSiap(prefixSatker);
  const { siap } = saringBarisSiap(baris);
  const waktuSync = new Date();

  // --- Sidik NIK: padanan NIK ke pegawai untuk SSO Naco ---
  //
  // NIK-nya sendiri TIDAK PERNAH disimpan; yang masuk database cuma HMAC-nya.
  // Kalau SIDIK_NIK_SECRET belum diisi, sync TETAP JALAN tanpa mengisi kolom
  // itu - memblokir sinkronisasi pegawai gara-gara SSO belum siap jelas
  // keliru; yang terjadi cuma login SSO belum cocok.
  let kunci: string | null = null;
  let catatanSidikNik: string | null = null;
  try {
    kunci = kunciSidikNik();
  } catch (e) {
    catatanSidikNik = `Sidik NIK dilewati: ${e instanceof Error ? e.message : String(e)}. Login SSO belum akan cocok sampai SIDIK_NIK_SECRET diisi dan sinkronisasi diulang.`;
  }

  // NIK yang dipakai LEBIH DARI SATU pegawai tidak boleh menghasilkan sidik
  // sama sekali - satu sidik yang menunjuk dua orang berarti login SSO bisa
  // mendarat di akun yang salah.
  const hitungNik = new Map<string, number>();
  if (kunci) {
    for (const b of siap) {
      const n = normalkanNik(b.nik);
      if (n) hitungNik.set(n, (hitungNik.get(n) ?? 0) + 1);
    }
  }
  let sidikTerisi = 0;
  let sidikDilewati = 0;
  let tersimpan = 0;

  for (let i = 0; i < siap.length; i += UKURAN_BATCH) {
    const batch = siap.slice(i, i + UKURAN_BATCH);
    await prisma.$transaction(
      batch.map((b) => {
        const nip = bersih(b.nip);
        // Hanya angka 1-17 yang diterima. Di luar itu null, BUKAN dipaksa
        // masuk: lookup tarif tukin pokok pasti gagal, dan lebih baik
        // pegawainya dilewati dengan alasan jelas daripada dihitung memakai
        // tarif yang salah. Fungsinya dipakai bareng jalur PERIKSA - kalau
        // keduanya sempat berbeda, daftar perubahan jadi penuh terus.
        const kelasJabatan = normalkanKelasJabatan(b.kelasJabatan);

        let sidik: string | null = null;
        if (kunci) {
          const nikBersih = normalkanNik(b.nik);
          if (!nikBersih || (hitungNik.get(nikBersih) ?? 0) > 1) sidikDilewati++;
          else {
            sidik = sidikNik(nikBersih, kunci);
            if (sidik) sidikTerisi++;
          }
        }

        const isi = {
          nama: bersih(b.nama),
          unitKerja: bersih(b.unitKerja) || bersih(b.satuanKerja),
          satuanKerja: satkerDari(b),
          jabatan: jabatanDari(b),
          golongan: b.golongan ? b.golongan.trim() : null,
          kelasJabatan,
          tmtSkTerakhir: b.tmtPangkat ?? null,
          // Disimpan apa adanya, termasuk nilai yang tidak dikenal - penyaringnya
          // urusan hitungPtkp(), yang mengembalikan null untuk status tak
          // dikenal alih-alih menebaknya jadi TK/0.
          statusKawin: b.statusKawin ? b.statusKawin.trim() : null,
          jenisKelamin: b.jenisKelamin ? b.jenisKelamin.trim() : null,
          jumlahAnakTanggungan: b.jumlahAnakTanggungan ?? 0,
          sourceSyncedAt: waktuSync,
          // Sengaja ikut di-set walau null: kalau NIK seseorang di SIAP
          // dikoreksi (atau jadi ganda), sidik lamanya HARUS hilang - kalau
          // tidak, padanan basi itu tetap bisa dipakai masuk.
          sidikNik: sidik,
        };
        return prisma.pegawai.upsert({
          where: { nip },
          create: { nip, statusPegawai: "AKTIF", sourceSystem: "SIAP_SQLSERVER", ...isi },
          // statusPegawai ikut di-set AKTIF pada UPDATE, bukan cuma pada
          // CREATE: baris yang sebelumnya ditandai PENSIUN/BERHENTI harus
          // kembali AKTIF kalau statusnya di SIAP dikoreksi. Tanpa ini,
          // penandaan non-aktif jadi satu arah dan tidak bisa dibatalkan.
          update: { ...isi, statusPegawai: "AKTIF" },
        });
      })
    );
    tersimpan += batch.length;
  }

  // Penandaan status - MENANDAI, tidak pernah menghapus. Orang yang pensiun di
  // tengah tahun tetap berhak atas tukin bulan-bulan yang sudah dia kerjakan,
  // dan datanya hilang kalau barisnya dibuang.
  for (let i = 0; i < rencana.gantiStatus.length; i += UKURAN_BATCH) {
    await prisma.$transaction(
      rencana.gantiStatus
        .slice(i, i + UKURAN_BATCH)
        .map((c) => prisma.pegawai.update({ where: { nip: c.nip }, data: { statusPegawai: c.ke } }))
    );
  }

  if (kunci && sidikDilewati > 0) {
    catatanSidikNik = `${sidikDilewati} pegawai tidak dapat sidik NIK - NIK tidak terbaca atau dipakai lebih dari satu orang. Mereka tetap bisa login memakai NIP.`;
  }

  // Daftar perubahan ditulis PALING AKHIR - sesudah tabel Pegawai benar-benar
  // berubah. Kalau ditulis lebih dulu lalu upsert-nya gagal, yang tersisa
  // adalah daftar berisi perubahan yang tidak pernah terjadi.
  const perubahanTercatat = await simpanDaftarPerubahan(
    prisma,
    rencana,
    terdeteksiOlehId,
    waktuSync
  );

  return {
    rencana,
    tersimpan,
    perubahanTercatat,
    statusDiperbarui: rencana.gantiStatus.length,
    sidikNikTerisi: sidikTerisi,
    sidikNikDilewati: sidikDilewati,
    catatanSidikNik,
  };
}
