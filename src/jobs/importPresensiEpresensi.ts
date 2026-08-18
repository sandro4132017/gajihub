// ============================================================================
// Tarik presensi satu periode dari database e-Presensi ke Gajihub - jalur CLI.
//
// Ini pembungkus TIPIS di atas dua modul yang dipakai bareng dengan tombol
// "Tarik data presensi" di /tukin/presensi:
//   - src/adapters/EpresensiAdapter.ts   (menarik & menganalisis)
//   - src/jobs/simpanRekapPresensi.ts    (menulis ke database)
// Baca dua file itu untuk detail pemetaan pegawai & TODO(confirm)-nya.
//
// Gunanya jalur CLI ini (tombol UI tidak menggantikannya): tarikan massal
// untuk SELURUH kementerian sekaligus, dan nantinya penjadwalan otomatis
// (cron/Task Scheduler) tanpa perlu ada orang menekan tombol.
//
// Cara pakai:
//   npx tsx src/jobs/importPresensiEpresensi.ts --bulan=6 --tahun=2026 --dry-run
//   npx tsx src/jobs/importPresensiEpresensi.ts --bulan=6 --tahun=2026 --oleh=<NIP>
//   npx tsx src/jobs/importPresensiEpresensi.ts --bulan=6 --tahun=2026 --oleh=<NIP> --limit=50
//
// CATATAN KEWENANGAN: jalur CLI ini TIDAK memfilter per satuan kerja - siapa
// pun yang bisa menjalankan skrip ini menarik data seluruh kementerian. Yang
// memfilter per unit adalah jalur TOMBOL di UI (canUploadRekapPresensi per
// pegawai). Jaga akses ke server/skrip ini sebagaimana akses administratif.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { tarikPresensiPeriode } from "../adapters/EpresensiAdapter";
import { simpanHasilPresensi } from "./simpanRekapPresensi";
import { muatKendalaPeriode, muatKoreksiPeriode } from "../lib/kendalaPresensi";
import { muatHariLiburPeriode } from "../lib/hariLibur";

try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* .env tidak ada - pengecekan kredensial di adapter yang melapor */
}

async function main() {
  const arg = (nama: string) => process.argv.find((a) => a.startsWith(`--${nama}=`))?.split("=")[1];
  // Tanpa --bulan/--tahun dipakai BULAN BERJALAN, supaya bisa dijadwalkan
  // (Task Scheduler / cron) tanpa perlu mengganti argumen tiap bulan.
  const sekarang = new Date();
  const bulan = arg("bulan") ? Number(arg("bulan")) : sekarang.getMonth() + 1;
  const tahun = arg("tahun") ? Number(arg("tahun")) : sekarang.getFullYear();
  const limit = arg("limit") ? Number(arg("limit")) : null;
  const dryRun = process.argv.includes("--dry-run");

  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun)) {
    console.error("Pakai: npx tsx src/jobs/importPresensiEpresensi.ts --bulan=6 --tahun=2026 --oleh=<NIP> [--limit=N] [--dry-run]");
    process.exit(1);
  }

  const prisma = new PrismaClient();

  // Penanda kendala e-Presensi (Pasal 10 ayat (2)) dimuat DULU lalu dioper ke
  // tarikan - jalur CLI dan jalur tombol UI memakai helper yang sama supaya
  // angkanya tidak bisa berbeda.
  const kendala = await muatKendalaPeriode(prisma, bulan, tahun);
  if (kendala.penanda.length > 0) {
    const tanggal = [...new Set(kendala.penanda.map((k) => k.tanggalIso))].sort();
    console.log(`Tanggal ditandai kendala e-Presensi: ${tanggal.join(", ")}`);
    console.log("  -> potongan Pasal 13 ayat (2) di tanggal itu TIDAK diterapkan.\n");
  }

  console.log(`Menarik presensi ${bulan}/${tahun} dari e-Presensi (READ-ONLY)...`);
  const koreksi = await muatKoreksiPeriode(prisma, bulan, tahun);
  if (koreksi.jumlah > 0) console.log(`Koreksi jam manual yang akan diterapkan: ${koreksi.jumlah} baris\n`);
  const hariLibur = await muatHariLiburPeriode(bulan, tahun);
  if (hariLibur.size > 0) {
    console.log(`   hari libur nasional periode ini: ${[...hariLibur.entries()].map(([t, k]) => `${t} (${k})`).join(", ")}`);
  }
  const tarikan = await tarikPresensiPeriode(bulan, tahun, kendala.untukNip, koreksi.untukNip, hariLibur);
  console.log(`  ${tarikan.totalBarisSumber.toLocaleString("id-ID")} baris, ${tarikan.totalPegawaiSumber.toLocaleString("id-ID")} pegawai di sumber`);
  console.log(`  ${tarikan.pegawai.length.toLocaleString("id-ID")} berhasil dipetakan ke NIP`);

  const pegawaiGajihub = new Map(
    (await prisma.pegawai.findMany({ select: { id: true, nip: true } })).map((p) => [p.nip, p.id])
  );

  const dilewati = tarikan.dilewati.map((d) => d.alasan);
  const siapTulis: { pegawaiId: string; nip: string; hasil: (typeof tarikan.pegawai)[number]["hasil"] }[] = [];
  for (const p of tarikan.pegawai) {
    const pegawaiId = pegawaiGajihub.get(p.nip);
    if (!pegawaiId) {
      dilewati.push("NIP belum ada di tabel Pegawai Gajihub - jalankan importPegawaiSiap dulu");
      continue;
    }
    siapTulis.push({ pegawaiId, nip: p.nip, hasil: p.hasil });
    if (limit && siapTulis.length >= limit) break;
  }

  console.log(`\nSiap disimpan : ${siapTulis.length.toLocaleString("id-ID")} pegawai`);
  console.log(`Dilewati      : ${dilewati.length.toLocaleString("id-ID")} pegawai`);
  const perAlasan = new Map<string, number>();
  for (const a of dilewati) perAlasan.set(a, (perAlasan.get(a) ?? 0) + 1);
  for (const [alasan, jml] of [...perAlasan].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${jml.toLocaleString("id-ID").padStart(6)}  ${alasan}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: TIDAK ada yang ditulis. Contoh 2 hasil pertama:");
    for (const s of siapTulis.slice(0, 2)) {
      const r = s.hasil.rekap;
      console.log(`\n  NIP ${s.nip}`);
      console.log(
        `    hari kerja ${r.jumlahHariKerja}, hadir ${r.jumlahHariHadir} (WFO ${r.jumlahHariWfo}, WFH/WFA ${r.jumlahHariWfhWfa}), ` +
          `alpha ${r.jumlahHariAlpha}, telat ${r.totalMenitTerlambat} menit, pulang cepat ${r.totalMenitPulangCepat} menit`
      );
      console.log(`    lembur ${r.totalJamLembur} jam (hari libur ${r.totalJamLemburHariLibur} jam)`);
      if (s.hasil.catatan.length) console.log(`    catatan: ${s.hasil.catatan.slice(0, 2).join(" | ")}`);
    }
    await prisma.$disconnect();
    return;
  }

  // Siapa yang menarik data ini WAJIB tercatat - RekapPresensiPeriode menyimpan
  // penanggung jawabnya, dan jalur CLI tidak punya sesi login. Jangan diakali
  // dengan user acak: kolom ini yang dilihat kalau nanti ada pertanyaan
  // "siapa yang memasukkan angka ini".
  const nipOperator = arg("oleh");
  if (!nipOperator) {
    console.error("\nWAJIB: --oleh=<NIP> - akun penanggung jawab penarikan (dicatat di RekapPresensiPeriode).");
    await prisma.$disconnect();
    process.exit(1);
  }
  const operator = await prisma.user.findUnique({ where: { nip: nipOperator } });
  if (!operator) {
    console.error(`\nAkun dengan NIP ${nipOperator} tidak ditemukan di tabel User.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`\nDicatat atas nama: ${operator.nama} (${operator.nip}, ${operator.role})`);

  let tersimpan = 0;
  for (const s of siapTulis) {
    await simpanHasilPresensi(prisma, {
      pegawaiId: s.pegawaiId,
      periodeBulan: bulan,
      periodeTahun: tahun,
      hasil: s.hasil,
      diunggahOlehId: operator.id,
      sourceSystem: "e-Presensi (database)",
    });
    tersimpan++;
    if (tersimpan % 100 === 0) console.log(`  tersimpan ${tersimpan}/${siapTulis.length}...`);
  }

  console.log(`\nSelesai: ${tersimpan.toLocaleString("id-ID")} pegawai tersimpan untuk periode ${bulan}/${tahun}.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
