// ============================================================================
// Composition root sementara untuk verifikasi manual: wiring adapter mock +
// PrismaClient asli, jalankan jalankanTukinPeriodeJob, lalu cetak hasilnya.
//
// Cara pakai: npx tsx src/jobs/runTukinJobDemo.ts
//
// tukinPokokPerKelasJabatan sekarang pakai TUKIN_POKOK_PER_KELAS_JABATAN -
// nilai RESMI dari Lampiran Permenaker 15/2024 (sebelumnya angka contoh).
// Predikat kinerja & konversinya ke persen juga sudah pakai
// konversiPredikatKeNilaiPersen() (Lampiran Kepsekjen 82/2025), bukan angka
// karangan lagi.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { MockSiapAdapter } from "./../adapters/MockSiapAdapter";
import { MockPresensiAdapter } from "./../adapters/MockPresensiAdapter";
import { MockEKinerjaAdapter } from "./../adapters/MockEKinerjaAdapter";
import { jalankanTukinPeriodeJob } from "./hitungTukinPeriodeJob";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "./../business-logic/tarifTukinPokok";
import { konversiPredikatKeNilaiPersen } from "./../business-logic/konversiPredikat";

async function main() {
  const prisma = new PrismaClient();

  const eKinerja = new MockEKinerjaAdapter();
  eKinerja.seed({
    pegawaiId: "000000000000000001",
    periodeBulan: 7,
    periodeTahun: 2026,
    nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen("SANGAT_BAIK"),
  });
  eKinerja.seed({
    pegawaiId: "000000000000000003",
    periodeBulan: 7,
    periodeTahun: 2026,
    nilaiCapaianKinerjaPersen: konversiPredikatKeNilaiPersen("BAIK"),
  });

  const ringkasan = await jalankanTukinPeriodeJob(
    prisma,
    {
      siap: new MockSiapAdapter(),
      presensi: new MockPresensiAdapter(),
      eKinerja,
    },
    {
      periodeBulan: 7,
      periodeTahun: 2026,
      tukinPokokPerKelasJabatan: TUKIN_POKOK_PER_KELAS_JABATAN,
    }
  );

  console.log(JSON.stringify(ringkasan, null, 2));

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
