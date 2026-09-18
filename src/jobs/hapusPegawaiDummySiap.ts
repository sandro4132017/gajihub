/**
 * Menghapus baris uji coba SIAP yang telanjur tersinkron ke Gajihub.
 *
 * Dijalankan SEKALI atas permintaan eksplisit user (2026-09-16). Penyaringnya
 * sendiri sudah ada di importPegawaiSiap.ts, jadi yang dihapus di sini tidak
 * akan kembali pada sinkronisasi berikutnya.
 *
 *   npx tsx --env-file=.env src/jobs/hapusPegawaiDummySiap.ts           -> PERIKSA saja
 *   npx tsx --env-file=.env src/jobs/hapusPegawaiDummySiap.ts --hapus   -> hapus
 *
 * AMAN DIJALANKAN ULANG: kalau sudah bersih, ia melapor "tidak ada yang perlu
 * dihapus" dan berhenti. Ia juga MEMBATALKAN DIRI kalau baris yang mau dihapus
 * ternyata sudah menyentuh pembayaran atau punya akun login - dua keadaan yang
 * bukan lagi urusan kerapian data.
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const HAPUS = process.argv.includes("--hapus");

/** Sama persis dengan penyaring di importPegawaiSiap.ts - nama DIAWALI "dummy". */
const POLA = /^dummy/i;

async function main() {
  const kandidat = await p.pegawai.findMany({
    where: { nama: { startsWith: "dummy", mode: "insensitive" } },
    select: { id: true, nip: true, nama: true, satuanKerja: true, kelasJabatan: true, statusPegawai: true },
  });

  console.log(`Kandidat (nama diawali "dummy"): ${kandidat.length}`);
  for (const k of kandidat) {
    if (!POLA.test(k.nama.trim())) {
      console.log(`  DILEWATI (tidak cocok pola): ${k.nip} ${k.nama}`);
      continue;
    }
    console.log(`  ${k.nip}  "${k.nama}"  | ${k.satuanKerja} | kelas=${k.kelasJabatan ?? "-"} | ${k.statusPegawai}`);
  }
  const sasaran = kandidat.filter((k) => POLA.test(k.nama.trim()));
  if (sasaran.length === 0) {
    console.log("\nTidak ada yang perlu dihapus.");
    await p.$disconnect();
    return;
  }

  const ids = sasaran.map((k) => k.id);

  // Seluruh relasi yang menggantung di Pegawai (lihat schema.prisma).
  const hitung = {
    presensiHarian: await p.presensiHarian.count({ where: { pegawaiId: { in: ids } } }),
    rekapPresensi: await p.rekapPresensiPeriode.count({ where: { pegawaiId: { in: ids } } }),
    koreksiPresensi: await p.koreksiPresensiHarian.count({ where: { pegawaiId: { in: ids } } }),
    predikatKinerja: await p.predikatKinerja.count({ where: { pegawaiId: { in: ids } } }),
    tukinCalculation: await p.tukinCalculation.count({ where: { pegawaiId: { in: ids } } }),
    uangMakan: await p.uangMakan.count({ where: { pegawaiId: { in: ids } } }),
    uangLembur: await p.uangLembur.count({ where: { pegawaiId: { in: ids } } }),
    banding: await p.banding.count({ where: { pegawaiId: { in: ids } } }),
    skKgb: await p.skKgb.count({ where: { pegawaiId: { in: ids } } }),
    skHukumanDisiplin: await p.skHukumanDisiplin.count({ where: { pegawaiId: { in: ids } } }),
    skGrade: await p.skGrade.count({ where: { pegawaiId: { in: ids } } }),
    pengecualian: await p.pengecualianPegawai.count({ where: { pegawaiId: { in: ids } } }),
    buktiPotongPajak: await p.buktiPotongPajak.count({ where: { pegawaiId: { in: ids } } }),
    gajiInduk: await p.gajiInduk.count({ where: { pegawaiId: { in: ids } } }),
    rekening: await p.rekeningPegawai.count({ where: { pegawaiId: { in: ids } } }),
  };
  const akun = await p.user.count({ where: { nip: { in: sasaran.map((s) => s.nip) } } });

  console.log("\nBaris yang menempel:");
  for (const [k, v] of Object.entries(hitung)) console.log(`  ${k.padEnd(20)} ${v}`);
  console.log(`  ${"akun User".padEnd(20)} ${akun}`);

  // PAGAR: apa pun yang menyentuh pembayaran membatalkan penghapusan. Baris
  // uji coba yang sudah terlanjur masuk kalkulasi bukan lagi urusan
  // kerapian data - itu angka yang mungkin sudah dipakai orang.
  const menyentuhUang =
    hitung.tukinCalculation + hitung.uangMakan + hitung.uangLembur + hitung.gajiInduk + hitung.buktiPotongPajak;
  if (menyentuhUang > 0) {
    console.log("\nDIBATALKAN: ada baris yang menyentuh pembayaran. Perlu diputuskan manusia.");
    await p.$disconnect();
    process.exit(1);
  }
  if (akun > 0) {
    console.log("\nDIBATALKAN: ada akun login yang memakai NIP ini.");
    await p.$disconnect();
    process.exit(1);
  }

  if (!HAPUS) {
    console.log("\n(PERIKSA saja - tidak ada yang dihapus. Tambahkan --hapus untuk mengeksekusi.)");
    await p.$disconnect();
    return;
  }

  await p.$transaction([
    p.koreksiPresensiHarian.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.presensiHarian.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.rekapPresensiPeriode.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.predikatKinerja.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.banding.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.skKgb.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.skHukumanDisiplin.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.skGrade.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.pengecualianPegawai.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.rekeningPegawai.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.pegawai.deleteMany({ where: { id: { in: ids } } }),
    // Jejaknya wajib tertinggal - sesudah ini barisnya sudah tidak ada lagi.
    p.auditTrail.createMany({
      data: sasaran.map((k) => ({
        entitas: "pegawai",
        entitasId: k.nip,
        aksi: "DELETE",
        aktor: "SYSTEM",
        satuanKerja: k.satuanKerja || null,
        dataSebelum: {
          nip: k.nip,
          nama: k.nama,
          satuanKerja: k.satuanKerja,
          kelasJabatan: k.kelasJabatan,
          statusPegawai: k.statusPegawai,
          alasan:
            "Baris uji coba di SIAP (nama diawali 'dummy') yang telanjur tersinkron. " +
            "Dihapus atas permintaan user 2026-09-16; importPegawaiSiap.ts sudah menyaringnya sejak itu.",
        },
      })),
    }),
  ]);

  console.log(`\nDIHAPUS: ${sasaran.length} pegawai beserta seluruh baris yang menempel.`);
  const sisa = await p.pegawai.count({ where: { nama: { startsWith: "dummy", mode: "insensitive" } } });
  console.log(`Sisa pegawai ber-nama diawali "dummy": ${sisa}`);
  console.log(`Total pegawai sekarang: ${await p.pegawai.count()}`);

  await p.$disconnect();
}

main().catch(async (e) => {
  console.error("GAGAL:", e.message);
  await p.$disconnect();
  process.exit(1);
});
