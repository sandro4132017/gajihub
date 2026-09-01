// ============================================================================
// PROBE JEDA e-PRESENSI - mengukur, bukan menebak.
//
//   npx tsx src/jobs/cekJedaEpresensi.ts
//
// Menjawab SATU pertanyaan: baris presensi hari ini muncul di database
// e-Presensi SEGERA setelah pegawai menempel, atau baru muncul lewat proses
// batch di kemudian hari?
//
// Jawaban itu menentukan apakah fitur "pengingat lupa absen pulang" mungkin
// dibuat sama sekali. Kalau datanya baru masuk besok pagi, tidak ada
// pengingat yang bisa dikirim hari ini - dan tidak ada gunanya membangun
// apa pun sebelum ini diukur.
//
// READ-ONLY. Hanya SELECT, dan hanya atas tanggal HARI INI - jauh lebih
// sempit daripada tarikan bulanan yang sudah rutin dijalankan
// importPresensiEpresensi.ts. Tidak menulis, tidak membuat index, tidak
// menyentuh Gajihub sama sekali.
//
// CARA MEMBACANYA - jalankan di tengah jam kerja (mis. 10:00 dan 14:00):
//   - Baris hari ini ADA & sebagian jam_keluar masih kosong  -> data hidup,
//     pengingat mungkin dibuat.
//   - Baris hari ini ADA tapi jam_masuk semuanya kosong      -> barisnya
//     dibuat dulu, jamnya menyusul; ukur lagi beberapa jam kemudian.
//   - Baris hari ini NOL, padahal kemarin banyak             -> batch. Fitur
//     pengingat harian TIDAK bisa dibangun di atas sumber ini.
//
// Jalankan dua kali dengan jarak beberapa jam dan bandingkan - satu kali
// pengukuran tidak bisa membedakan "belum ada yang absen" dari "batch".
// ============================================================================

import pg from "pg";

async function main() {
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
    // CURRENT_DATE dievaluasi di server e-Presensi, bukan di mesin ini -
    // supaya hasilnya tidak bergeser sehari oleh zona waktu klien. Pola yang
    // sama dipakai EpresensiAdapter (to_char di SQL, bukan Date di JS).
    const { rows } = await client.query<{
      hari: string;
      baris: string;
      ada_jam_masuk: string;
      ada_jam_keluar: string;
      jam_masuk_terakhir: string | null;
    }>(
      `SELECT to_char(p.tanggal, 'YYYY-MM-DD')                     AS hari,
              count(*)                                             AS baris,
              count(p.jam_masuk)                                   AS ada_jam_masuk,
              count(p.jam_keluar)                                  AS ada_jam_keluar,
              max(p.jam_masuk)::text                               AS jam_masuk_terakhir
         FROM presensi p
        WHERE p.tanggal >= CURRENT_DATE - 3
          AND p.tanggal <= CURRENT_DATE
        GROUP BY 1
        ORDER BY 1`
    );

    const sekarang = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
    console.log(`Diukur ${sekarang} WIB\n`);
    console.log("hari        baris   jam_masuk  jam_keluar  masuk terakhir");
    console.log("--------------------------------------------------------");
    for (const r of rows) {
      console.log(
        `${r.hari}  ${r.baris.padStart(6)}  ${r.ada_jam_masuk.padStart(9)}  ` +
          `${r.ada_jam_keluar.padStart(10)}  ${r.jam_masuk_terakhir ?? "-"}`
      );
    }
    if (rows.length === 0 || rows[rows.length - 1].hari !== new Date().toISOString().slice(0, 10)) {
      console.log("\nTidak ada baris untuk hari ini pada saat diukur.");
    }
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
