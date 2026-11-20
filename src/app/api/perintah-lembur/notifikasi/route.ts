import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { susunPesanPerintahLembur } from "../../../../business-logic/pesanPerintahLembur";
import { berlakuMulaiSpkl, spklAktifUntuk } from "../../../../lib/lembur/gerbangSpkl";
import { NAMA_BULAN } from "../../../../lib/format/bulan";
import { NAMA_HARI } from "../../../../lib/format/presensiTampilan";

export const dynamic = "force-dynamic";

/** Batas perintah per respons; bot melanjutkan dengan kursor `sejak`. */
export const BATAS_PERINTAH_PER_RESPONS = 50;

/**
 * Bahan pesan grup WhatsApp untuk perintah lembur TERKIRIM, dibaca bot WA di
 * luar Gajihub (pola sama dengan /api/pengingat-absen). Gajihub tidak mengirim
 * apa pun; route ini READ-ONLY.
 *
 * Cara bot memakai:
 *   GET /api/perintah-lembur/notifikasi?satker=<nama persis>&sejak=<ISO>
 *   Header: x-gajihub-secret: <isi PERINTAH_LEMBUR_SECRET>
 * - Satu grup WA per satker; bot memanggil sekali per satker.
 * - `sejak` = KURSOR: ambil `dikirimPada` terbesar dari respons sebelumnya.
 *   Hasil hanya perintah dengan dikirimPada > sejak, urut naik, maks
 *   BATAS_PERINTAH_PER_RESPONS. Tanpa `sejak` = dari awal. Dua perintah yang
 *   dikirim pada milidetik yang sama dan terpotong di batas respons bisa
 *   terlewat; bot sebaiknya mundur beberapa detik dari kursor dan membuang
 *   duplikat berdasarkan `id`.
 * - Kirim `pesan` apa adanya ke grup. Isinya tanpa NIP (nama boleh).
 *
 * Keamanan: rahasia WAJIB, tanpa nilai cadangan (kosong -> 503, salah -> 401).
 * Rute ini ada di RUTE_MESIN (src/middleware.ts) sehingga tidak bersesi; rahasia
 * di header satu-satunya penjaga daftar nama pegawai yang ada di pesan.
 * Satker di luar gerbang SPKL dijawab daftar kosong (bukan 404), supaya nama
 * satker pilot tidak bisa ditebak dari perbedaan respons.
 */
function rahasiaCocok(diberikan: string | null, rahasia: string): boolean {
  if (diberikan === null) return false;
  // Di-hash dulu supaya panjangnya sama dan timingSafeEqual tidak melempar.
  const a = createHash("sha256").update(diberikan).digest();
  const b = createHash("sha256").update(rahasia).digest();
  return timingSafeEqual(a, b);
}

const TANPA_CACHE = { "Cache-Control": "private, no-store" };

export async function GET(req: NextRequest) {
  const rahasia = process.env.PERINTAH_LEMBUR_SECRET?.trim();
  if (!rahasia) {
    return Response.json(
      // Rute tanpa sesi: jangan sebut nama konfigurasi ke pemanggil anonim.
      // Sebabnya (PERINTAH_LEMBUR_SECRET kosong) tercatat di komentar file ini.
      { error: "Layanan belum dikonfigurasi." },
      { status: 503, headers: TANPA_CACHE }
    );
  }
  if (!rahasiaCocok(req.headers.get("x-gajihub-secret"), rahasia)) {
    return Response.json({ error: "Tidak berwenang." }, { status: 401, headers: TANPA_CACHE });
  }

  const satker = req.nextUrl.searchParams.get("satker")?.trim();
  if (!satker) {
    return Response.json({ error: "Parameter satker wajib diisi." }, { status: 400, headers: TANPA_CACHE });
  }

  const sejakMentah = req.nextUrl.searchParams.get("sejak")?.trim();
  let sejak: Date | null = null;
  if (sejakMentah) {
    sejak = new Date(sejakMentah);
    if (Number.isNaN(sejak.getTime())) {
      return Response.json({ error: "Parameter sejak bukan waktu ISO yang sah." }, { status: 400, headers: TANPA_CACHE });
    }
  }

  // Di luar gerbang SPKL: daftar kosong, tanpa menyentuh database.
  if (berlakuMulaiSpkl(satker) === null) {
    return Response.json([], { headers: TANPA_CACHE });
  }

  const perintah = await prisma.perintahLembur.findMany({
    where: {
      satuanKerja: satker,
      status: "TERKIRIM",
      dikirimPada: sejak ? { gt: sejak } : { not: null },
    },
    orderBy: [{ dikirimPada: "asc" }, { id: "asc" }],
    take: BATAS_PERINTAH_PER_RESPONS,
    select: {
      id: true,
      tanggal: true,
      satuanKerja: true,
      nomorSurat: true,
      uraianTugas: true,
      dikirimPada: true,
      kepalaTim: { select: { nama: true } },
      anggota: {
        where: { terkirim: true },
        select: { jamDiperintahkan: true, pegawai: { select: { nama: true } } },
      },
    },
  });

  const hasil: { id: string; dikirimPada: string; pesan: string }[] = [];
  for (const p of perintah) {
    if (!p.dikirimPada) continue;
    const tanggalIso = p.tanggal.toISOString().slice(0, 10);
    // Gerbang per tanggal perintah, sama dengan yang dipakai fitur lainnya.
    if (!spklAktifUntuk(p.satuanKerja, tanggalIso)) continue;

    const [th, bl, hr] = tanggalIso.split("-").map(Number);
    const hari = NAMA_HARI[new Date(Date.UTC(th, bl - 1, hr)).getUTCDay()];
    const pesan = susunPesanPerintahLembur({
      tanggalTeks: `${hari}, ${hr} ${NAMA_BULAN[bl - 1]} ${th}`,
      kepalaTimNama: p.kepalaTim.nama,
      satuanKerja: p.satuanKerja,
      nomorSurat: p.nomorSurat,
      uraianTugas: p.uraianTugas,
      anggota: p.anggota
        .map((a) => ({ nama: a.pegawai.nama, jam: a.jamDiperintahkan }))
        .sort((x, y) => x.nama.localeCompare(y.nama, "id")),
    });
    if (pesan === null) continue;
    hasil.push({ id: p.id, dikirimPada: p.dikirimPada.toISOString(), pesan });
  }

  return Response.json(hasil, { headers: TANPA_CACHE });
}
