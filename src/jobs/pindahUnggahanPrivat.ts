// ============================================================================
// PINDAHKAN UNGGAHAN LAMA DARI `public/uploads` KE PENYIMPANAN PRIVAT.
//
// Sebelumnya bukti dukung banding dan PDF SPTJM disimpan di `public/uploads`,
// jadi bisa dibuka lewat URL langsung oleh siapa pun yang punya sesi, tanpa
// pemeriksaan izin per dokumen. Sekarang berkas disajikan lewat Route Handler
// dan disimpan di luar `public/` (lihat src/lib/storage/berkasPrivat.ts).
//
// TIDAK MENGUBAH DATABASE. Baris lama menyimpan `/uploads/<jenis>/<nama>`, dan
// pembaca sudah memetakannya ke folder baru. Hanya berkas yang berpindah.
//
// BERTAHAP, dan bawaannya cuma melaporkan:
//   npm run pindah:unggahan                       (lihat dulu; = --dry-run)
//   npm run pindah:unggahan -- --terapkan         (salin; asal TIDAK dihapus)
//   npm run pindah:unggahan -- --terapkan --hapus-asal
//                                                 (hapus asal yang terbukti
//                                                  identik dengan salinannya)
//
// Penyalinan memakai COPYFILE_EXCL (tidak pernah menimpa), lalu SHA-256 salinan
// dibandingkan dengan asal. Berkas yang sudah ada di tujuan dengan isi berbeda
// dilaporkan sebagai BENTROK dan dibiarkan.
//
// LAPORAN BERUPA JUMLAH SAJA. Nama berkas bukti dukung memuat nama dan jenis
// dokumen pribadi pegawai, jadi tidak dicetak.
// ============================================================================

import { PrismaClient } from "@prisma/client";
import { constants as fsConst } from "fs";
import fs from "fs/promises";
import path from "path";
import { hitungHashBerkas } from "../lib/tte/hashBerkas";
import { JENIS_BERKAS, akarStorage, uraiReferensi } from "../lib/storage/berkasPrivat";
import {
  hitungTidakCocokDb,
  ringkasRencana,
  susunRencanaPindah,
  type BerkasAsal,
} from "../lib/storage/rencanaPindah";

const terapkan = process.argv.includes("--terapkan");
const hapusAsal = process.argv.includes("--hapus-asal");

const AKAR_ASAL = path.join(process.cwd(), "public", "uploads");

async function daftarBerkas(dir: string, awalan: string): Promise<string[]> {
  let isi;
  try {
    isi = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const hasil: string[] = [];
  for (const e of isi) {
    const rel = `${awalan}/${e.name}`;
    if (e.isDirectory()) hasil.push(...(await daftarBerkas(path.join(dir, e.name), rel)));
    else if (e.isFile()) hasil.push(rel);
  }
  return hasil;
}

async function hashDi(jalur: string): Promise<string | null> {
  try {
    return hitungHashBerkas(await fs.readFile(jalur));
  } catch {
    return null;
  }
}

const jalurAsal = (rel: string) => path.join(AKAR_ASAL, ...rel.split("/"));
const jalurTujuan = (rel: string) => path.join(akarStorage(), ...rel.split("/"));

/** Hash TTE yang dicatat di database, berkunci `<jenis>/<relatif>`. SELECT saja. */
async function ambilHashDb(): Promise<Map<string, string> | null> {
  const prisma = new PrismaClient();
  try {
    const baris = await prisma.dokumenTte.findMany({
      where: { hashBerkas: { not: null }, fileSignedPath: { not: null } },
      select: { fileSignedPath: true, hashBerkas: true },
    });
    const peta = new Map<string, string>();
    for (const b of baris) {
      const u = b.fileSignedPath ? uraiReferensi(b.fileSignedPath) : null;
      if (u && b.hashBerkas) peta.set(`${u.jenis}/${u.relatif}`, b.hashBerkas.trim().toLowerCase());
    }
    return peta;
  } catch {
    return null;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main() {
  console.log(
    terapkan
      ? "MODE TERAPKAN - berkas akan disalin ke penyimpanan privat.\n"
      : "MODE LIHAT SAJA (dry-run) - tidak ada yang ditulis. Tambahkan --terapkan untuk menyalin.\n"
  );

  const kandidat: string[] = [];
  for (const jenis of JENIS_BERKAS) {
    kandidat.push(...(await daftarBerkas(path.join(AKAR_ASAL, jenis), jenis)));
  }

  const asal: BerkasAsal[] = [];
  for (const rel of kandidat) {
    const sha256 = await hashDi(jalurAsal(rel));
    if (sha256) asal.push({ relatif: rel, sha256 });
  }

  const tujuan = new Map<string, string>();
  for (const b of asal) {
    const h = await hashDi(jalurTujuan(b.relatif));
    if (h) tujuan.set(b.relatif, h);
  }

  const rencana = susunRencanaPindah(asal, tujuan);
  const r = ringkasRencana(rencana);

  const hashDb = await ambilHashDb();
  const tidakCocokDb = hashDb ? hitungTidakCocokDb(asal, hashDb) : null;

  console.log(`Folder tujuan : ${akarStorage()}`);
  console.log(`Berkas di asal: ${asal.length}`);
  console.log(`  perlu disalin        : ${r.salin}`);
  console.log(`  sudah sama di tujuan : ${r.sudahSama}`);
  console.log(`  BENTROK (beda isi)   : ${r.bentrok}`);
  console.log(`  dilewati             : ${r.lewati}`);
  console.log(
    tidakCocokDb === null
      ? "  hash TTE vs database : dilewati (database tidak terjangkau)"
      : `  hash TTE vs database : ${tidakCocokDb} berkas tidak cocok dengan hash_berkas`
  );

  if (!terapkan) {
    if (hapusAsal) {
      console.log(
        `\n--hapus-asal tanpa --terapkan hanya melaporkan: ${r.sudahSama} asal akan dihapus ` +
          "setelah salinannya terverifikasi."
      );
    }
    return;
  }

  let disalin = 0;
  let gagalVerifikasi = 0;
  for (const item of rencana) {
    if (item.status !== "SALIN") continue;
    const dst = jalurTujuan(item.relatif);
    try {
      await fs.mkdir(path.dirname(dst), { recursive: true });
      await fs.copyFile(jalurAsal(item.relatif), dst, fsConst.COPYFILE_EXCL);
    } catch {
      gagalVerifikasi++;
      continue;
    }
    const asalHash = asal.find((b) => b.relatif === item.relatif)?.sha256;
    const salinHash = await hashDi(dst);
    if (salinHash !== asalHash) {
      // Salinan rusak dibuang supaya percobaan berikutnya tidak membacanya
      // sebagai "sudah ada".
      await fs.unlink(dst).catch(() => undefined);
      gagalVerifikasi++;
      continue;
    }
    disalin++;
  }
  console.log(`\nDisalin dan terverifikasi: ${disalin}`);
  if (gagalVerifikasi > 0) {
    console.log(`GAGAL disalin / hash salinan tidak cocok: ${gagalVerifikasi}`);
    process.exitCode = 1;
  }

  if (!hapusAsal) {
    console.log("Berkas asal di public/uploads TIDAK dihapus. Gunakan --hapus-asal setelah yakin.");
    return;
  }

  // Hapus HANYA yang terbukti identik di tujuan - hash dihitung ulang di sini,
  // bukan memercayai hasil langkah sebelumnya.
  let terhapus = 0;
  let dipertahankan = 0;
  for (const b of asal) {
    if (!rencana.find((x) => x.relatif === b.relatif && x.status !== "LEWATI" && x.status !== "BENTROK")) {
      dipertahankan++;
      continue;
    }
    const [hAsal, hTujuan] = await Promise.all([
      hashDi(jalurAsal(b.relatif)),
      hashDi(jalurTujuan(b.relatif)),
    ]);
    if (hAsal && hAsal === hTujuan) {
      await fs.unlink(jalurAsal(b.relatif));
      terhapus++;
    } else {
      dipertahankan++;
    }
  }
  console.log(`Asal dihapus (terbukti identik): ${terhapus}; dipertahankan: ${dipertahankan}`);
}

main().catch((err) => {
  console.error("Gagal:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
