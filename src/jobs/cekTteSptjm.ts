// ============================================================================
// CEK TTE SPTJM - menjawab satu pertanyaan: dokumen ini benar-benar
// ditandatangani BSrE, atau cuma distempel simulasi?
//
// READ-ONLY SEPENUHNYA. Nol tulisan ke database, nol berkas diubah, dan
// endpoint BSrE yang dipanggil hanya `/api/sign/verify` - memeriksa, bukan
// menandatangani. Aman dijalankan kapan saja, termasuk di produksi.
//
// DUA LAPIS PEMERIKSAAN, dan keduanya perlu karena menjawab hal berbeda:
//
//   1. PENANDA LOKAL (`apakahHasilSimulasi`) - apa yang DICATAT Gajihub.
//      Cepat, tidak butuh jaringan, dan mengenali dokumen simulasi lama
//      maupun baru.
//   2. VERIFIKASI BSrE (`verifyPdf`) - apa yang dikatakan BSrE tentang berkas
//      PDF-nya sendiri. Ini kata putusnya: tanda tangan kriptografis hanya
//      bisa dibuktikan oleh yang memegang sertifikatnya, bukan oleh catatan
//      kita.
//
// Kalau keduanya BERBEDA, itu temuan yang perlu ditindaklanjuti - bukan
// gangguan kecil. Mis. catatan kita bilang asli tapi BSrE menolak berkasnya.
//
// Jalankan: npm run cek:tte
// ============================================================================

import { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import { verifyPdf } from "../lib/tte/esignClient";
import { apakahHasilSimulasi } from "../lib/tte/simulasiTte";
import { jalurDisk } from "../lib/tte/periksaBsre";

const prisma = new PrismaClient();

async function main() {
  const dokumen = await prisma.dokumenTte.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      jenisDokumen: true,
      nomorDokumen: true,
      status: true,
      satuanKerja: true,
      periodeBulan: true,
      periodeTahun: true,
      idDokumenBsre: true,
      signingTimeMs: true,
      signedAt: true,
      fileSignedPath: true,
      penandatanganNama: true,
      penandatanganNip: true,
    },
  });

  console.log(`Dokumen TTE di database: ${dokumen.length}\n`);

  let asli = 0;
  let simulasi = 0;
  let belum = 0;
  let ditolak = 0;
  let bedaPendapat = 0;

  for (const d of dokumen) {
    const simLokal = apakahHasilSimulasi(d);
    const label = `${d.jenisDokumen} ${d.periodeBulan}/${d.periodeTahun} - ${d.satuanKerja}`;

    console.log("-".repeat(72));
    console.log(label);
    console.log(
      `  status        : ${d.status}` +
        `   nomor: ${d.nomorDokumen ?? "-"}`
    );
    console.log(
      `  penanda tangan: ${d.penandatanganNama ?? "-"}` +
        (d.penandatanganNip ? ` (${d.penandatanganNip})` : "")
    );
    console.log(
      `  id BSrE       : ${d.idDokumenBsre ?? "-"}` +
        `   lama TTE: ${d.signingTimeMs ?? "-"} ms`
    );
    console.log(`  catatan kita  : ${simLokal ? "SIMULASI (bukan TTE BSrE)" : "mengaku TTE BSrE"}`);

    if (d.status !== "TERTANDATANGANI" || !d.fileSignedPath) {
      console.log("  verifikasi    : dilewati - belum ada berkas tertandatangani");
      belum++;
      continue;
    }

    let jalur: string;
    try {
      jalur = jalurDisk(d.fileSignedPath);
    } catch {
      console.log("  verifikasi    : GAGAL - referensi berkas tidak sah");
      bedaPendapat++;
      continue;
    }
    console.log(`  berkas        : ${path.basename(jalur)}`);
    let buf: Buffer;
    try {
      buf = await fs.readFile(jalur);
    } catch {
      // Berkasnya hilang dari disk. Dilaporkan, tidak disembunyikan: dokumen
      // yang tercatat tertandatangani tapi berkasnya tidak ada berarti
      // lampiran SPTJM-nya tidak bisa dibuktikan sama sekali.
      console.log(`  verifikasi    : GAGAL - berkas tidak ada di ${jalur}`);
      bedaPendapat++;
      continue;
    }

    const hasil = await verifyPdf(buf, path.basename(jalur));

    if (!hasil.success) {
      // `success` HANYA berarti panggilan API-nya berhasil. Vonis tanda
      // tangannya ada di `summary` - keliru membaca `success` sebagai "sah"
      // membuat dokumen tanpa tanda tangan ikut terbaca sah.
      console.log(`  kata BSrE     : tidak bisa diperiksa - ${hasil.error ?? "tanpa keterangan"}`);
      bedaPendapat++;
      continue;
    }

    const vonis = (hasil.summary ?? "").toUpperCase();
    console.log(`  kata BSrE     : ${vonis || "(tanpa summary)"}`);
    if (hasil.notes) console.log(`                  ${hasil.notes}`);

    if (vonis === "VALID") {
      asli++;
      if (simLokal) {
        console.log("  !! BEDA        : catatan kita bilang SIMULASI, BSrE bilang VALID");
        bedaPendapat++;
      }
    } else if (vonis === "NO_SIGNATURE") {
      // Tidak ada tanda tangan elektronik sama sekali - inilah bentuk
      // dokumen hasil stempel simulasi di mata BSrE.
      simulasi++;
      if (!simLokal) {
        console.log("  !! BEDA        : catatan kita bilang ASLI, BSrE bilang TIDAK ADA tanda tangan");
        bedaPendapat++;
      }
    } else {
      // ADA tanda tangannya, tapi verifier BSrE tidak mengesahkannya.
      //
      // JANGAN LANGSUNG DIBACA SEBAGAI "dokumen palsu" atau "berkas rusak".
      // Tanda tangan PAdES-LTV menambahkan DSS (sertifikat + CRL) sebagai
      // penulisan susulan SESUDAH penandatanganan - itu memang caranya,
      // supaya tanda tangannya tetap bisa diperiksa bertahun-tahun kemudian.
      // Sebagian verifier membaca penulisan susulan itu sebagai "dokumen
      // berubah". Terukur pada berkas SPTJM di sini: yang ditambahkan HANYA
      // /DSS /VRI /Certs /CRLs - tidak ada gambar, font, halaman, maupun
      // anotasi baru.
      //
      // Pemeriksaan pembanding yang layak dipercaya: buka PDF-nya di Adobe
      // Acrobat Reader, yang memang memvalidasi PAdES-LTV.
      ditolak++;
      console.log(
        "                  (tanda tangannya ADA; periksa banding di Adobe Acrobat Reader" +
          " sebelum menyimpulkan dokumennya bermasalah)"
      );
    }
  }
  console.log("=".repeat(72));
  console.log(
    `Ringkasan: ${asli} VALID menurut BSrE, ${ditolak} bertanda tangan tapi tidak disahkan verifier, ` +
      `${simulasi} tanpa tanda tangan (simulasi), ${belum} belum ditandatangani.`
  );
  if (bedaPendapat > 0) {
    console.log(
      `PERHATIAN: ${bedaPendapat} dokumen yang catatan Gajihub dan jawaban BSrE ` +
        `TIDAK SEPAKAT - periksa satu per satu di atas.`
    );
  }
}

main()
  .catch((err) => {
    console.error("Gagal:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
