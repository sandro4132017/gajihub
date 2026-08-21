// ============================================================================
// Import pegawai dari database SIAP (SQL Server) ke tabel Pegawai.
// Menggantikan importPegawaiXlsx.ts sebagai jalur utama.
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
  sumberKelasJabatan: string | null;
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

async function main() {
  const argSatker = process.argv.find((a) => a.startsWith("--satker="));
  const prefixSatker = argSatker ? argSatker.split("=")[1] : null;
  const dryRun = process.argv.includes("--dry-run");

  // Sumbernya ikut dicetak: server SIAP punya beberapa instance dengan
  // database bernama sama, jadi "berhasil" saja tidak cukup buat memastikan
  // data yang ditarik memang dari tempat yang dimaksud.
  console.log(`Menyambung ke SIAP ${labelSumberSiap()} (READ-ONLY)...`);
  const baris = await ambilDariSiap(prefixSatker);
  console.log(
    `Terbaca ${baris.length} pegawai aktif dari SIAP` +
      (prefixSatker ? ` (SATKERID diawali "${prefixSatker}")` : " (semua satuan kerja)")
  );

  const dilewati: string[] = [];
  const siap = baris.filter((b) => {
    if (!b.nip || !b.nama) {
      dilewati.push(`NIP/nama kosong: ${b.nip ?? "-"} / ${b.nama ?? "-"}`);
      return false;
    }
    if (!b.satuanKerja && !b.unitKerja) {
      dilewati.push(`${b.nip} (${b.nama}): satuan kerja tidak terpetakan di dbo.SATKER`);
      return false;
    }
    return true;
  });

  const tanpaGolongan = siap.filter((b) => !b.golongan).length;
  const tanpaJabatan = siap.filter((b) => !b.jabatan).length;

  console.log(`Siap disimpan   : ${siap.length}`);
  console.log(`Dilewati        : ${dilewati.length}`);
  console.log(`Tanpa golongan  : ${tanpaGolongan}`);
  console.log(`Tanpa jabatan   : ${tanpaJabatan}`);
  const perSumberKelas = new Map<string, number>();
  for (const b of siap) {
    const k = Number(b.kelasJabatan);
    const sah = Number.isInteger(k) && k >= 1 && k <= 17;
    const label = sah ? (b.sumberKelasJabatan ?? "?") : "TIDAK ADA / di luar 1-17";
    perSumberKelas.set(label, (perSumberKelas.get(label) ?? 0) + 1);
  }
  console.log("Kelas jabatan   :");
  for (const [label, jml] of [...perSumberKelas].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(jml).padStart(6)}  ${label}`);
  }

  if (dilewati.length > 0) {
    console.log("\nAlasan baris dilewati (maks 10 ditampilkan):");
    for (const d of dilewati.slice(0, 10)) console.log(`  - ${d}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: TIDAK ada yang ditulis ke database Gajihub.");
    console.log("Contoh 3 baris pertama:");
    console.log(JSON.stringify(siap.slice(0, 3), null, 2));
    return;
  }

  const prisma = new PrismaClient();
  const waktuSync = new Date();
  let tersimpan = 0;

  // Ditulis per batch supaya 3.600+ upsert tidak jadi satu transaksi raksasa
  // (pola yang sama dengan upload gaji induk di /ppabp/gaji-induk).
  const UKURAN_BATCH = 100;
  for (let i = 0; i < siap.length; i += UKURAN_BATCH) {
    const batch = siap.slice(i, i + UKURAN_BATCH);
    await prisma.$transaction(
      batch.map((b) => {
        const nip = b.nip!.trim();
        const unitKerja = (b.unitKerja ?? b.satuanKerja ?? "").trim();
        const satuanKerja = (b.satuanKerja ?? b.unitKerja ?? "").trim();
        // Hanya angka 1-17 yang diterima. Di luar itu -> null, BUKAN dipaksa
        // masuk: lookup tarif tukin pokok pasti gagal dan lebih baik pegawainya
        // dilewati dengan alasan jelas daripada dihitung pakai tarif salah.
        const kelas = Number(b.kelasJabatan);
        const kelasJabatan = Number.isInteger(kelas) && kelas >= 1 && kelas <= 17 ? kelas : null;

        const isi = {
          nama: b.nama!.trim(),
          unitKerja,
          satuanKerja,
          jabatan: b.jabatan ? b.jabatan.trim() : null,
          golongan: b.golongan ? b.golongan.trim() : null,
          kelasJabatan,
          tmtSkTerakhir: b.tmtPangkat ?? null,
          sourceSyncedAt: waktuSync,
        };
        return prisma.pegawai.upsert({
          where: { nip },
          create: {
            nip,
            statusPegawai: "AKTIF",
            sourceSystem: "SIAP_SQLSERVER",
            ...isi,
          },
          // statusPegawai ikut di-set "AKTIF" pada UPDATE, bukan cuma pada
          // CREATE: baris yang sebelumnya ditandai PENSIUN/BERHENTI harus
          // kembali AKTIF kalau ternyata statusnya di SIAP dikoreksi. Tanpa
          // ini, penandaan non-aktif jadi satu arah dan tidak bisa dibatalkan
          // lewat sync.
          update: { ...isi, statusPegawai: "AKTIF" },
        });
      })
    );
    tersimpan += batch.length;
    process.stdout.write(`\r  tersimpan ${tersimpan}/${siap.length}...`);
  }

  console.log(`\n\nImport selesai: ${tersimpan} pegawai tersimpan/diperbarui.`);

  // --- Rekonsiliasi status: siapa yang TIDAK lagi ada di daftar aktif? ---
  //
  // Tanpa langkah ini, pegawai yang statusnya berubah jadi Pensiun/
  // Pemberhentian di SIAP cuma LENYAP dari hasil query, sementara barisnya di
  // Gajihub tetap "AKTIF" selamanya - ikut terhitung di dashboard dan tetap
  // muncul di roster unit seolah masih bekerja.
  //
  // Yang dilakukan di sini CUMA MENANDAI, tidak pernah menghapus. Alasannya:
  // orang yang pensiun di tengah tahun tetap berhak atas tukin bulan-bulan
  // yang sudah dia kerjakan, dan datanya hilang kalau barisnya dibuang.
  // Penyaring "siapa yang boleh dihitung" TIDAK dipasang di sini - kalkulasi
  // sudah melewati pegawai yang tidak punya presensi di periode itu, jadi
  // bulan setelah berhenti otomatis terlewat tanpa aturan tambahan.
  const nipAktif = new Set(siap.map((b) => b.nip!.trim()));
  const semuaDiGajihub = await prisma.pegawai.findMany({
    select: { nip: true, nama: true, statusPegawai: true },
  });
  const perluDicek = semuaDiGajihub.filter((p) => !nipAktif.has(p.nip));

  if (perluDicek.length === 0) {
    console.log("Rekonsiliasi status: semua pegawai di Gajihub masih aktif di SIAP.");
  } else {
    const statusSiap = await ambilStatusDariSiap(perluDicek.map((p) => p.nip));
    const perLabel = new Map<string, number>();
    const perubahan: { nip: string; nama: string; dari: string; ke: string }[] = [];

    for (const p of perluDicek) {
      const label = statusSiap.get(p.nip) ?? "TIDAK_DI_SIAP";
      perLabel.set(label, (perLabel.get(label) ?? 0) + 1);
      if (p.statusPegawai !== label) perubahan.push({ nip: p.nip, nama: p.nama, dari: p.statusPegawai, ke: label });
    }

    console.log(`\nRekonsiliasi status: ${perluDicek.length} pegawai tidak lagi aktif di SIAP`);
    for (const [label, jml] of [...perLabel].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(jml).padStart(6)}  ${label}`);
    }

    if (perubahan.length === 0) {
      console.log("  (tidak ada perubahan - semuanya sudah bertanda benar)");
    } else {
      for (let i = 0; i < perubahan.length; i += UKURAN_BATCH) {
        await prisma.$transaction(
          perubahan
            .slice(i, i + UKURAN_BATCH)
            .map((c) => prisma.pegawai.update({ where: { nip: c.nip }, data: { statusPegawai: c.ke } }))
        );
      }
      console.log(`  ${perubahan.length} status diperbarui. Contoh:`);
      for (const c of perubahan.slice(0, 5)) console.log(`    - ${c.nama} (${c.nip}): ${c.dari} -> ${c.ke}`);
    }
  }

  console.log(
    "\nLangkah berikutnya: npx tsx src/auth/seedAkunPegawai.ts (bikin akun login buat NIP baru)."
  );
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
