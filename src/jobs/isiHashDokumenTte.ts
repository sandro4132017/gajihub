// ============================================================================
// ISI SIDIK (SHA-256) UNTUK DOKUMEN TTE YANG SUDAH TERLANJUR DITANDATANGANI.
//
// Kolom `hash_berkas` baru ada sesudah sebagian SPTJM ditandatangani, jadi
// baris lama kosong. Job ini membacanya dari berkas yang ada di disk.
//
// TIDAK MENGUBAH BERKASNYA SAMA SEKALI - hanya dibaca. Dan tidak menyentuh
// baris yang sidiknya sudah terisi: sidik yang dihitung saat penandatanganan
// lebih dipercaya daripada hasil pembacaan ulang, karena diambil dari bita
// yang sama persis dengan yang ditulis.
//
// BAWAANNYA CUMA MELAPORKAN. Menulis butuh --terapkan.
//
// Jalankan: npm run isi:hash-tte            (lihat dulu)
//           npm run isi:hash-tte -- --terapkan
// ============================================================================

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { hitungHashBerkas } from "../lib/tte/hashBerkas";
import { jalurDisk } from "../lib/tte/periksaBsre";

const prisma = new PrismaClient();
const terapkan = process.argv.includes("--terapkan");

async function main() {
  const daftar = await prisma.dokumenTte.findMany({
    where: { status: "TERTANDATANGANI", hashBerkas: null, fileSignedPath: { not: null } },
    select: {
      id: true, jenisDokumen: true, satuanKerja: true,
      periodeBulan: true, periodeTahun: true, fileSignedPath: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(
    terapkan
      ? "MODE TERAPKAN - sidik akan ditulis ke database.\n"
      : "MODE LIHAT SAJA - tidak ada yang ditulis. Tambahkan --terapkan untuk menyimpan.\n"
  );
  console.log(`Dokumen tertandatangani yang belum punya sidik: ${daftar.length}\n`);

  let terisi = 0;
  let berkasHilang = 0;

  for (const d of daftar) {
    const label = `${d.jenisDokumen} ${d.periodeBulan}/${d.periodeTahun} - ${d.satuanKerja}`;
    let jalur = "";

    let isi: Buffer;
    try {
      jalur = jalurDisk(d.fileSignedPath!); // melempar bila referensi tak sah
      isi = await fs.readFile(jalur);
    } catch {
      console.log(`  LEWAT  ${label}`);
      console.log(`         berkas tidak ada: ${path.basename(jalur)}`);
      berkasHilang++;
      continue;
    }

    const hash = hitungHashBerkas(isi);
    console.log(`  ${terapkan ? "ISI   " : "AKAN  "} ${label}`);
    console.log(`         ${hash}`);

    if (terapkan) {
      await prisma.dokumenTte.update({
        where: { id: d.id },
        data: { hashBerkas: hash },
      });
    }
    terisi++;
  }

  console.log("");
  console.log(
    `Ringkasan: ${terisi} ${terapkan ? "terisi" : "siap diisi"}, ` +
      `${berkasHilang} dilewati karena berkasnya tidak ada di disk.`
  );
  if (berkasHilang > 0) {
    console.log(
      "PERHATIAN: dokumen yang tercatat tertandatangani tapi berkasnya hilang " +
        "tidak bisa dibuktikan sama sekali - periksa satu per satu."
    );
  }
}

main()
  .catch((err) => {
    console.error("Gagal:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
