// ============================================================================
// CLI sinkronisasi pegawai dari SIAP.
//
//   npm run sync:pegawai                          # semua pegawai aktif
//   npm run sync:pegawai -- --satker=0101         # satu Eselon I
//   npm run sync:pegawai -- --dry-run             # periksa saja, tidak menulis
//
// PEMBUNGKUS TIPIS - seluruh logikanya di src/jobs/sinkronPegawaiSiap.ts,
// yang dipakai bareng tombol sinkronisasi di /admin/sistem. Berkas ini hanya
// membaca argumen dan MENCETAK; tidak ada satu pun aturan yang tinggal di
// sini.
//
// KENAPA DIPECAH (2026-09-24): berkas ini dulu memanggil `main()` di baris
// teratasnya, jadi meng-import apa pun darinya - bukan menjalankannya,
// sekadar mengimpornya - akan menjalankan SELURUH sinkronisasi 5.078 pegawai.
// Jebakan yang sama persis dengan seedSimulasi.ts, dan yang menghalangi
// tombol sinkronisasi di UI. Sekarang yang punya efek samping cuma berkas
// ini, dan ia memang dimaksudkan untuk dijalankan.
//
// Dokumentasi pemetaan kolom SIAP -> Pegawai ada di kepala
// sinkronPegawaiSiap.ts, bersama kodenya.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import {
  periksaSinkronPegawai,
  terapkanSinkronPegawai,
  type RencanaSinkronPegawai,
} from "./sinkronPegawaiSiap";

function cetakRencana(r: RencanaSinkronPegawai) {
  // Sumbernya ikut dicetak: server SIAP punya beberapa instance dengan
  // database bernama sama, jadi "berhasil" saja tidak cukup buat memastikan
  // data yang ditarik memang dari tempat yang dimaksud.
  console.log(`Sumber          : SIAP ${r.sumber} (READ-ONLY)`);
  console.log(`Terbaca         : ${r.dibacaDariSiap}`);
  console.log(`Siap disimpan   : ${r.siapDisimpan}`);
  console.log(`Tanpa golongan  : ${r.tanpaGolongan}`);
  console.log(`Tanpa jabatan   : ${r.tanpaJabatan}`);

  if (r.dilewati.length > 0) {
    console.log(`\nDilewati        : ${r.dilewati.reduce((n, d) => n + d.jumlah, 0)}`);
    for (const d of r.dilewati) console.log(`  ${String(d.jumlah).padStart(6)}  ${d.alasan}`);
  }

  console.log(`\nPerubahan yang akan diterapkan:`);
  console.log(`  pegawai baru      : ${r.pegawaiBaru.length}`);
  console.log(`  pindah unit       : ${r.pindahUnit.length}`);
  console.log(`  ganti status      : ${r.gantiStatus.length}`);
  console.log(`  kelas jabatan     : ${r.gantiKelasJabatan.length}`);
  console.log(`  jabatan           : ${r.gantiJabatan.length}`);
  console.log(`  baris ter-upsert  : ${r.jumlahDiperbarui}`);

  // PINDAH UNIT didaftar LENGKAP, tidak dipotong sepuluh seperti yang lain.
  // Perpindahan unit menyeret seluruh riwayat pembayaran orang itu ke unit
  // baru - termasuk periode yang sudah dikirim unit lama - jadi tidak ada
  // satu pun yang boleh lewat tanpa terlihat.
  if (r.pindahUnit.length > 0) {
    console.log(`\nPINDAH UNIT (${r.pindahUnit.length}):`);
    for (const c of r.pindahUnit) {
      console.log(`  - ${c.nama} (${c.nip})`);
      console.log(`      ${c.dari}  ->  ${c.ke}`);
    }
    console.log(
      `  Riwayat pembayaran mereka ikut pindah ke unit baru, termasuk periode\n` +
        `  yang sudah dikirim unit lama. Periksa berkas ADK periode berjalan.`
    );
  }

  // KELAS JABATAN didaftar LENGKAP, sederajat dengan pindah unit: tarif tukin
  // pokok diturunkan seluruhnya dari angka ini, jadi satu kelas yang bergeser
  // mengubah pembayaran orang itu tanpa satu pun kolom lain ikut berubah.
  if (r.gantiKelasJabatan.length > 0) {
    console.log(`
KELAS JABATAN BERUBAH (${r.gantiKelasJabatan.length}):`);
    for (const c of r.gantiKelasJabatan) {
      console.log(`  - ${c.nama} (${c.nip}): kelas ${c.dari} -> ${c.ke}`);
      console.log(`      ${c.satuanKerja}`);
    }
  }

  if (r.gantiStatus.length > 0) {
    console.log(`\nGANTI STATUS (${r.gantiStatus.length}, maks 10 ditampilkan):`);
    for (const c of r.gantiStatus.slice(0, 10)) {
      console.log(`  - ${c.nama} (${c.nip}): ${c.dari} -> ${c.ke}`);
    }
  }

  if (r.pegawaiBaru.length > 0) {
    console.log(`\nPEGAWAI BARU (${r.pegawaiBaru.length}, maks 10 ditampilkan):`);
    for (const p of r.pegawaiBaru.slice(0, 10)) {
      console.log(`  - ${p.nama} (${p.nip}) - ${p.satuanKerja}`);
    }
  }
}

async function main() {
  const argSatker = process.argv.find((a) => a.startsWith("--satker="));
  const prefixSatker = argSatker ? argSatker.split("=")[1] : null;
  const dryRun = process.argv.includes("--dry-run");

  const prisma = new PrismaClient();
  try {
    if (dryRun) {
      console.log("Memeriksa perubahan dari SIAP (--dry-run: tidak menulis apa pun)...\n");
      cetakRencana(await periksaSinkronPegawai(prisma, prefixSatker));
      console.log("\n--dry-run: TIDAK ada yang ditulis ke database Gajihub.");
      return;
    }

    console.log("Menyinkronkan pegawai dari SIAP...\n");
    const hasil = await terapkanSinkronPegawai(prisma, prefixSatker);
    cetakRencana(hasil.rencana);

    console.log(`\nSelesai: ${hasil.tersimpan} pegawai tersimpan/diperbarui.`);
    console.log(`         ${hasil.perubahanTercatat} baris masuk Daftar Perubahan Data Kepegawaian.`);
    if (hasil.statusDiperbarui > 0) console.log(`         ${hasil.statusDiperbarui} status ditandai ulang.`);

    // Sidik NIK dilaporkan apa adanya - yang tidak terisi berarti orangnya
    // belum bisa masuk lewat SSO (login NIP tetap jalan), dan itu harus
    // kelihatan, bukan hilang diam-diam.
    console.log(`\nSidik NIK (padanan SSO Naco): ${hasil.sidikNikTerisi} terisi.`);
    if (hasil.catatanSidikNik) console.log(`  ! ${hasil.catatanSidikNik}`);

    console.log(
      "\nLangkah berikutnya: npx tsx src/auth/seedAkunPegawai.ts (bikin akun login buat NIP baru)."
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
