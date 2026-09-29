// ============================================================================
// Ketukan presensi HARI INI per pegawai - bahan pengingat absen per unit.
//
// READ-ONLY terhadap e-Presensi DAN SIAP, tanpa kecuali. Semua query `SELECT`.
// Keduanya sistem produksi yang sedang melayani pegawai.
//
// RANTAI PEMETAANNYA TIGA DATABASE, dan urutannya tidak bisa dipotong:
//   Gajihub (NIP pegawai unit) -> SIAP (NIP -> PEGAWAIID) -> e-Presensi (ketukan)
// e-Presensi TIDAK menyimpan NIP sama sekali, jadi SIAP wajib dilewati. Ini
// rantai yang sama dipakai `EpresensiAdapter`, dan peringatannya juga sama:
// PENCOCOKANNYA HARUS PERSIS - jangan menambah/membuang nol di depan, karena
// normalisasi nol pernah mencocokkan id ke PEGAWAIID milik ORANG LAIN. Di sini
// akibatnya bukan salah potong tukin, tapi tetap buruk: NAMA ORANG YANG SALAH
// disebut di grup unit.
//
// BEDA DARI `EpresensiAdapter.tarikPeriode()`: yang itu borongan sebulan untuk
// ±5.200 pegawai dan dipakai menghitung pembayaran. Yang ini SATU HARI untuk
// SATU UNIT (puluhan orang), hasilnya tidak pernah disimpan dan tidak pernah
// menyentuh rupiah.
// ============================================================================

import pg from "pg";
import { bukaPoolSiap } from "../lib/siapConfig";

/** Satu baris ketukan hari ini, sudah dinormalkan. */
export interface KetukanHariIni {
  /** `nama_sistem_kerja` apa adanya, mis. "WFO", "Dinas Keluar". */
  status: string | null;
  /** Menit sejak tengah malam. null = tidak ada ketukan. */
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
}

/**
 * Jam yang berarti "tidak ada ketukan".
 *
 * `jam_masuk`/`jam_keluar` di e-Presensi bertipe VARCHAR, dan sel tanpa ketukan
 * muncul dalam beberapa bentuk - diukur di data nyata: string kosong, `00:00`,
 * dan `00:00:00`. Menghitungnya sebagai ketukan sah akan membuat pengingat
 * MELEWATKAN orang yang sebenarnya belum tap.
 */
const JAM_KOSONG = new Set(["", "00:00", "00:00:00"]);

/** "HH:MM" atau "HH:MM:SS" -> menit sejak tengah malam. null kalau bukan jam. */
export function menitDariJamTeks(nilai: string | null): number | null {
  if (nilai === null) return null;
  const t = nilai.trim();
  if (JAM_KOSONG.has(t)) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const jam = Number(m[1]);
  const menit = Number(m[2]);
  if (jam > 23 || menit > 59) return null;
  return jam * 60 + menit;
}

/** PEGAWAIID SIAP -> NIP. Dikirim per potongan supaya IN(...) tidak kepanjangan. */
async function petaIdPegawai(nipList: string[]): Promise<Map<string, string>> {
  const peta = new Map<string, string>();
  if (nipList.length === 0) return peta;
  const pool = await bukaPoolSiap();
  try {
    const POTONGAN = 500;
    for (let i = 0; i < nipList.length; i += POTONGAN) {
      const bagian = nipList.slice(i, i + POTONGAN).map((v) => `'${v.replace(/'/g, "''")}'`);
      const r = await pool.request().query<{ PEGAWAIID: string; NIPBARU: string }>(
        `SELECT LTRIM(RTRIM(PEGAWAIID)) AS PEGAWAIID, LTRIM(RTRIM(NIPBARU)) AS NIPBARU
           FROM dbo.PEGAWAI
          WHERE LTRIM(RTRIM(NIPBARU)) IN (${bagian.join(",")})
            AND PEGAWAIID IS NOT NULL`
      );
      for (const row of r.recordset) peta.set(row.PEGAWAIID, row.NIPBARU);
    }
  } finally {
    await pool.close();
  }
  return peta;
}

export interface HasilAbsenHariIni {
  /** Tanggal menurut SERVER e-Presensi, "YYYY-MM-DD". */
  tanggalServer: string;
  /**
   * Jam server e-Presensi dalam menit sejak tengah malam.
   *
   * Diambil dari SUMBER YANG SAMA dengan tanggalnya, bukan dari Node - kalau
   * keduanya beda zona waktu, penyaringan "sudah lewat jam boleh pulang" akan
   * bergeser berjam-jam dan pengingat menamai orang yang belum boleh pulang.
   */
  jamServerMenit: number;
  /** NIP -> ketukan. NIP yang TIDAK ada di sini berarti belum punya baris apa pun. */
  perNip: Map<string, KetukanHariIni>;
  /** NIP yang tidak punya padanan di SIAP - dilaporkan, tidak disembunyikan. */
  nipTanpaPadananSiap: string[];
}

/**
 * Ambil ketukan hari ini untuk pegawai yang NIP-nya diberikan.
 *
 * TANGGALNYA `current_date` MILIK SERVER e-PRESENSI, bukan tanggal Node.
 * Keduanya bisa berbeda zona waktu, dan pengingat yang menanyakan tanggal
 * kemarin akan menyebut seluruh unit belum absen dengan tampak yakin. Sudah
 * terbukti menyesatkan sekali di sesi ini: pembacaan tanggal lewat
 * `toISOString()` bergeser satu hari dan membuat data hari ini terlihat kosong.
 *
 * PEGAWAI YANG BELUM TAP TIDAK PUNYA BARIS SAMA SEKALI - bukan punya baris
 * berkolom kosong. Itu diukur: yang wajib hadir tapi belum tap masuk terhitung
 * NOL di seluruh e-Presensi, karena barisnya baru dibuat saat orang tap. Jadi
 * "siapa yang belum checkin" HANYA bisa dijawab dengan mengurangkan daftar ini
 * dari roster unit - dan itu dikerjakan pemanggil, bukan di sini.
 */
export async function ambilAbsenHariIni(nipList: string[]): Promise<HasilAbsenHariIni> {
  const peta = await petaIdPegawai(nipList);
  const idKeNip = peta;
  const ids = [...peta.keys()];
  const nipKetemu = new Set(peta.values());
  const nipTanpaPadananSiap = nipList.filter((n) => !nipKetemu.has(n));

  const { EPRESENSI_HOST, EPRESENSI_PORT, EPRESENSI_DB, EPRESENSI_USER, EPRESENSI_PASSWORD } = process.env;
  if (!EPRESENSI_HOST || !EPRESENSI_DB || !EPRESENSI_USER || !EPRESENSI_PASSWORD) {
    throw new Error("Kredensial e-Presensi belum lengkap di .env (EPRESENSI_HOST/DB/USER/PASSWORD).");
  }

  const client = new pg.Client({
    host: EPRESENSI_HOST,
    port: Number(EPRESENSI_PORT ?? 5432),
    database: EPRESENSI_DB,
    user: EPRESENSI_USER,
    password: EPRESENSI_PASSWORD,
  });
  await client.connect();
  try {
    // `AT TIME ZONE 'Asia/Jakarta'` WAJIB DITULIS, bukan `now()` polos.
    //
    // Server e-Presensi berjalan di UTC - diukur langsung: `now()` mengembalikan
    // 04:31 ketika waktu Jakarta 11:31. Sementara kolom `jam_masuk`/`jam_keluar`
    // isinya jam WIB (07:32 dan seterusnya). Membandingkan keduanya salah tujuh
    // jam, dan akibatnya nyata: pada pukul 16:05 WIB saringan "sudah boleh
    // pulang" akan membaca jam 09:05 dan MEMBUANG SEMUA ORANG dari daftar.
    //
    // Tanggalnya ikut dihitung dari zona yang sama - antara 00:00 dan 07:00 WIB,
    // tanggal UTC masih hari sebelumnya, jadi `current_date` polos akan
    // menanyakan hari yang salah.
    const tgl = await client.query<{ t: string; jm: string }>(
      `SELECT to_char((now() AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS t,
              to_char(now() AT TIME ZONE 'Asia/Jakarta', 'HH24:MI') AS jm`
    );
    const tanggalServer = tgl.rows[0].t;
    const jamServerMenit = menitDariJamTeks(tgl.rows[0].jm) ?? 0;

    const perNip = new Map<string, KetukanHariIni>();
    if (ids.length > 0) {
      // Kesamaan tanggal PERSIS, bukan rentang - kolomnya DATE tapi tabel ini
      // memuat baris bertanggal rusak (mis. "+252026-01-22"), jadi jangan
      // berasumsi rentang apa pun waras. Tanggalnya dikirim dari hasil hitungan
      // di atas supaya zona waktunya sama dengan yang dipakai menyaring jam.
      const r = await client.query<{
        id_pegawai: string;
        status: string | null;
        jam_masuk: string | null;
        jam_keluar: string | null;
      }>(
        `SELECT p.id_pegawai, sk.nama_sistem_kerja AS status, p.jam_masuk, p.jam_keluar
           FROM presensi p
           LEFT JOIN sistem_kerja sk ON sk.id_sistem_kerja = p.id_sistem_kerja
          WHERE p.tanggal::date = $2::date
            AND p.id_pegawai = ANY($1::text[])`,
        [ids, tanggalServer]
      );

      for (const row of r.rows) {
        const nip = idKeNip.get(row.id_pegawai);
        if (!nip) continue;
        const masuk = menitDariJamTeks(row.jam_masuk);
        const keluar = menitDariJamTeks(row.jam_keluar);
        const lama = perNip.get(nip);
        // Satu pegawai bisa punya LEBIH DARI SATU baris sehari (mis. baris WFO
        // ditambah baris Lembur). Yang diambil ketukan paling AWAL untuk masuk
        // dan paling AKHIR untuk pulang - kalau tidak, baris terakhir yang
        // kebetulan kosong akan menghapus ketukan yang sudah ada.
        perNip.set(nip, {
          status: lama?.status ?? row.status,
          jamMasukMenit:
            lama?.jamMasukMenit === null || lama?.jamMasukMenit === undefined
              ? masuk
              : masuk === null
                ? lama.jamMasukMenit
                : Math.min(lama.jamMasukMenit, masuk),
          jamKeluarMenit:
            lama?.jamKeluarMenit === null || lama?.jamKeluarMenit === undefined
              ? keluar
              : keluar === null
                ? lama.jamKeluarMenit
                : Math.max(lama.jamKeluarMenit, keluar),
        });
      }
    }

    return { tanggalServer, jamServerMenit, perNip, nipTanpaPadananSiap };
  } finally {
    await client.end();
  }
}
