// ============================================================================
// Menyiapkan (atau mencabut) pegawai uji + akun penguji Pusdatik di database.
//
//   npx tsx --env-file=.env src/jobs/seedPegawaiUji.ts                       -> UJI KERING (bawaan)
//   npx tsx --env-file=.env src/jobs/seedPegawaiUji.ts --terapkan            -> tulis
//   npx tsx --env-file=.env src/jobs/seedPegawaiUji.ts --hapus               -> uji kering penghapusan
//   npx tsx --env-file=.env src/jobs/seedPegawaiUji.ts --hapus --terapkan    -> hapus
//   tambahan: --bulan=10 --tahun=2026 (bawaan: bulan sebelumnya)
//
// Dijalankan di setiap server yang akan memakai akun penguji (staging maupun
// produksi). Tanpa baris yang ditulis di sini, login akun penguji tidak
// lolos (lihat src/auth/akunPengujiDb.ts).
//
// Pegawai uji disaring dari semua berkas ADK, angka lintas unit, dan
// rekonsiliasi SIAP berdasarkan Pegawai.sourceSystem = "DUMMY_UJI".
//
// Idempoten (upsert). Ditandai Pegawai.sourceSystem = "DUMMY_UJI" supaya
// sinkronisasi SIAP dan berkas ADK mengabaikannya. Tidak menulis rekening.
// Log hanya jumlah - tanpa NIP atau nama.
// ============================================================================

import { PrismaClient, type Role } from "@prisma/client";
import { NIP_PENGUJI, SATKER_DUMMY, SUMBER_DUMMY } from "../lib/dataUji";
import { konversiPredikatKeNilaiPersen } from "../business-logic/konversiPredikat";
import { tanggalUtc, menitKeWaktu } from "../business-logic/presensiKeDb";
import {
  DAFTAR_PEGAWAI_UJI,
  periodeBawaanUji,
  periksaTargetUji,
  punyaPredikatUji,
  susunGajiUji,
  susunPresensiUji,
} from "./dataSeedUji";

try {
  (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.();
} catch {
  /* .env tidak ada - Prisma yang melapor kalau DATABASE_URL kosong */
}

const ROLE_PENGUJI: Role = "ADMIN";
const ROLE_TAMBAHAN_PENGUJI: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN"];

function arg(nama: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nama}=`))?.split("=")[1];
}

async function main() {
  const terapkan = process.argv.includes("--terapkan");
  const hapus = process.argv.includes("--hapus");
  const bawaan = periodeBawaanUji(new Date());
  const bulan = arg("bulan") ? Number(arg("bulan")) : bawaan.bulan;
  const tahun = arg("tahun") ? Number(arg("tahun")) : bawaan.tahun;
  if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun)) {
    console.error("Pakai: --bulan=1..12 --tahun=YYYY");
    process.exit(1);
  }

  const p = new PrismaClient();
  try {
    const nipUji = DAFTAR_PEGAWAI_UJI.map((d) => d.nip);
    const sudahAda = await p.pegawai.findMany({
      where: { nip: { in: nipUji } },
      select: { id: true, nip: true, sourceSystem: true },
    });
    // PAGAR: NIP uji tidak boleh menimpa atau menghapus baris pegawai yang bukan data uji.
    const pagar = periksaTargetUji(sudahAda);
    if (!pagar.aman) {
      console.error(`DIBATALKAN: ${pagar.alasan}. Perlu dicek manusia.`);
      process.exit(1);
    }
    const ids = sudahAda.map((x) => x.id);
    console.log(`Mode: ${hapus ? "HAPUS" : "SIAPKAN"} | ${terapkan ? "TERAPKAN" : "UJI KERING"} | periode ${bulan}/${tahun}`);
    console.log(`Pegawai uji sudah ada di database: ${sudahAda.length} dari ${nipUji.length}`);

    if (hapus) {
      const jumlah = {
        presensiHarian: await p.presensiHarian.count({ where: { pegawaiId: { in: ids } } }),
        rekapPresensi: await p.rekapPresensiPeriode.count({ where: { pegawaiId: { in: ids } } }),
        predikatKinerja: await p.predikatKinerja.count({ where: { pegawaiId: { in: ids } } }),
        gajiInduk: await p.gajiInduk.count({ where: { pegawaiId: { in: ids } } }),
        kalkulasi:
          (await p.tukinCalculation.count({ where: { pegawaiId: { in: ids } } })) +
          (await p.uangMakan.count({ where: { pegawaiId: { in: ids } } })) +
          (await p.uangLembur.count({ where: { pegawaiId: { in: ids } } })),
        pengirimanUnit: await p.pengirimanUnit.count({ where: { satuanKerja: SATKER_DUMMY } }),
      };
      for (const [k, v] of Object.entries(jumlah)) console.log(`  akan dihapus ${k}: ${v}`);
      console.log(`  akan dihapus pegawai: ${sudahAda.length}`);
      if (!terapkan) {
        console.log("\n(UJI KERING - tidak ada yang dihapus. Tambahkan --terapkan untuk mengeksekusi.)");
        return;
      }
      await hapusSemua(p, ids);
      return;
    }

    console.log("Rencana tulis (per pegawai uji): 1 pegawai, presensi harian + 1 rekap bulanan, 1 gaji induk palsu, 1 predikat (kecuali skenario tanpa predikat)");
    const hitungHarian = DAFTAR_PEGAWAI_UJI.reduce((a, d) => a + susunPresensiUji(d.skenario, bulan, tahun).harian.length, 0);
    console.log(`  pegawai: ${DAFTAR_PEGAWAI_UJI.length}`);
    console.log(`  presensi harian: ${hitungHarian}`);
    console.log(`  rekap presensi: ${DAFTAR_PEGAWAI_UJI.length}`);
    console.log(`  penghasilan palsu: ${DAFTAR_PEGAWAI_UJI.length}`);
    console.log(`  predikat kinerja: ${DAFTAR_PEGAWAI_UJI.filter((d) => punyaPredikatUji(d.skenario)).length}`);
    console.log("  akun penguji: 1");
    if (!terapkan) {
      console.log("\n(UJI KERING - tidak ada yang ditulis. Tambahkan --terapkan untuk mengeksekusi.)");
      return;
    }
    await tulisSemua(p, bulan, tahun);
  } finally {
    await p.$disconnect();
  }
}

async function tulisSemua(p: PrismaClient, bulan: number, tahun: number) {
  const sekarang = new Date();

  // Akun penguji lebih dulu: rekap & gaji induk mencatat penanggung jawabnya.
  // Pembaruan SENGAJA tidak menyentuh `aktif` dan peran - kalau Admin sudah
  // menonaktifkan akun ini, menjalankan ulang seed tidak menghidupkannya lagi.
  const user = await p.user.upsert({
    where: { nip: NIP_PENGUJI },
    update: { nama: DAFTAR_PEGAWAI_UJI[0].nama, satuanKerja: SATKER_DUMMY },
    create: {
      nip: NIP_PENGUJI,
      nama: DAFTAR_PEGAWAI_UJI[0].nama,
      role: ROLE_PENGUJI,
      rolesTambahan: ROLE_TAMBAHAN_PENGUJI,
      satuanKerja: SATKER_DUMMY,
      aktif: true,
    },
  });

  let pegawaiTertulis = 0;
  let harianTertulis = 0;
  let predikatTertulis = 0;

  for (const d of DAFTAR_PEGAWAI_UJI) {
    const { harian, rekap } = susunPresensiUji(d.skenario, bulan, tahun);
    const gaji = susunGajiUji(d.gajiPokok);
    const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
    const akhir = new Date(Date.UTC(tahun, bulan, 1));

    const dataPegawai = {
      nama: d.nama,
      unitKerja: SATKER_DUMMY,
      satuanKerja: SATKER_DUMMY,
      statusPegawai: "AKTIF",
      jenisPegawai: "PNS",
      jabatan: d.jabatan,
      golongan: d.golongan,
      kelasJabatan: d.kelasJabatan,
      sourceSystem: SUMBER_DUMMY,
      sourceSyncedAt: sekarang,
    };
    const pegawai = await p.pegawai.upsert({
      where: { nip: d.nip },
      update: dataPegawai,
      create: { nip: d.nip, ...dataPegawai },
    });
    pegawaiTertulis++;

    await p.$transaction([
      p.presensiHarian.deleteMany({ where: { pegawaiId: pegawai.id, tanggal: { gte: awal, lt: akhir } } }),
      p.presensiHarian.createMany({
        data: harian.map((h) => ({
          pegawaiId: pegawai.id,
          tanggal: tanggalUtc(h.tanggalIso),
          jamMasuk: menitKeWaktu(h.tanggalIso, h.jamMasukMenit),
          jamKeluar: menitKeWaktu(h.tanggalIso, h.jamKeluarMenit),
          statusKehadiran: h.statusKehadiran,
          menitTerlambat: h.menitTerlambat,
          jamLembur: h.jamLembur,
          sourceSystem: SUMBER_DUMMY,
          sourceSyncedAt: sekarang,
        })),
      }),
      p.rekapPresensiPeriode.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan: bulan, periodeTahun: tahun } },
        update: { ...rekap, sourceSystem: SUMBER_DUMMY, diunggahOlehId: user.id },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan: bulan,
          periodeTahun: tahun,
          ...rekap,
          sourceSystem: SUMBER_DUMMY,
          diunggahOlehId: user.id,
        },
      }),
      p.gajiInduk.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan: bulan, periodeTahun: tahun } },
        update: { ...gaji, diunggahOlehId: user.id },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan: bulan,
          periodeTahun: tahun,
          ...gaji,
          sourceFileName: SUMBER_DUMMY,
          diunggahOlehId: user.id,
        },
      }),
    ]);
    harianTertulis += harian.length;

    if (punyaPredikatUji(d.skenario)) {
      const predikat = "BAIK" as const;
      const isi = {
        predikat,
        nilaiAngka: konversiPredikatKeNilaiPersen(predikat),
        sourceSystem: SUMBER_DUMMY,
        sourceSyncedAt: sekarang,
        inputMethod: "MANUAL_UPLOAD",
      };
      await p.predikatKinerja.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan: bulan, periodeTahun: tahun } },
        update: isi,
        create: { pegawaiId: pegawai.id, periodeBulan: bulan, periodeTahun: tahun, ...isi },
      });
      predikatTertulis++;
    }
  }

  console.log(`\nSELESAI. pegawai: ${pegawaiTertulis}, presensi harian: ${harianTertulis}, predikat: ${predikatTertulis}, akun penguji: 1`);
}

async function hapusSemua(p: PrismaClient, ids: string[]) {
  // Urutan: anak dulu. AuditTrail sengaja dibiarkan - itu jejak, bukan data uji.
  const bandingIds = (await p.banding.findMany({ where: { pegawaiId: { in: ids } }, select: { id: true } })).map((b) => b.id);
  await p.$transaction([
    p.buktiDukung.deleteMany({ where: { bandingId: { in: bandingIds } } }),
    p.banding.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.koreksiPresensiHarian.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.presensiHarian.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.rekapPresensiPeriode.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.predikatKinerja.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.tukinCalculation.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.uangMakan.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.uangLembur.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.skKgb.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.skHukumanDisiplin.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.skGrade.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.pengecualianPegawai.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.buktiPotongPajak.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.gajiInduk.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.rekeningPegawai.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.identitasWebGaji.deleteMany({ where: { pegawaiId: { in: ids } } }),
    p.pengirimanUnit.deleteMany({ where: { satuanKerja: SATKER_DUMMY } }),
    p.verifikasiTabelUnit.deleteMany({ where: { satuanKerja: SATKER_DUMMY } }),
    p.pegawai.deleteMany({ where: { id: { in: ids }, sourceSystem: SUMBER_DUMMY } }),
  ]);

  // Akun penguji: dihapus bila tidak ada jejak lain yang menempel padanya;
  // kalau masih ada (mis. ia pernah mengirim rekap unit lain), cukup
  // dinonaktifkan - menghapusnya akan ditolak database.
  const user = await p.user.findUnique({ where: { nip: NIP_PENGUJI }, select: { id: true } });
  let akunDihapus = 0;
  let akunDinonaktifkan = 0;
  if (user) {
    try {
      await p.$transaction([
        p.aksesSatkerTambahan.deleteMany({ where: { userId: user.id } }),
        p.user.deleteMany({ where: { id: user.id, nip: NIP_PENGUJI } }),
      ]);
      akunDihapus = 1;
    } catch {
      await p.user.update({ where: { id: user.id }, data: { aktif: false } });
      akunDinonaktifkan = 1;
    }
  }
  console.log(`\nDIHAPUS: pegawai ${ids.length}, akun penguji dihapus ${akunDihapus}, akun penguji dinonaktifkan ${akunDinonaktifkan}`);
}

main().catch((e) => {
  console.error("GAGAL:", e instanceof Error ? e.constructor.name : "galat tak dikenal");
  process.exit(1);
});
