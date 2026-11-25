import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { spklHarianSiap, tanggalIsoWib } from "../../../../business-logic/perintahLembur";
import { susunPesanSpklHarian } from "../../../../business-logic/pesanPerintahLembur";
import { berlakuMulaiSpkl, spklAktifUntuk } from "../../../../lib/lembur/gerbangSpkl";
import { TTE_LEMBUR_AKTIF } from "../../../../lib/lembur/sakelarTteLembur";
import { NAMA_BULAN } from "../../../../lib/format/bulan";
import { NAMA_HARI } from "../../../../lib/format/presensiTampilan";

export const dynamic = "force-dynamic";

/** Batas tanggal SPKL harian per respons; bot melanjutkan dengan kursor `sejak`. */
export const BATAS_HARI_PER_RESPONS = 31;
/**
 * Batas baris perintah yang dibaca dari database per respons (kursor `sejak`
 * yang sangat lama tidak memuat setahun penuh). Kalau batas tercapai, tanggal
 * terakhir bisa terpotong di tengah, jadi tanggal itu ditunda ke respons
 * berikutnya; pesan per hari selalu utuh.
 */
export const BATAS_BARIS_PER_RESPONS = BATAS_HARI_PER_RESPONS * 20;

const FORMAT_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Bahan pesan grup WhatsApp untuk SPKL HARIAN, dibaca bot WA di luar Gajihub
 * (pola sama dengan /api/pengingat-absen). Gajihub tidak mengirim apa pun;
 * route ini READ-ONLY.
 *
 * Satu pesan per satker per tanggal, memuat semua perintah TERKIRIM hari itu
 * dari semua Kepala Tim. Pesan baru tersedia setelah SPKL harian terkunci
 * 15.00 WIB ditambah tenggang (`spklHarianSiap`).
 *
 * Cara bot memakai:
 *   GET /api/perintah-lembur/notifikasi?satker=<nama persis>&sejak=YYYY-MM-DD
 *   Header: x-gajihub-secret: <isi PERINTAH_LEMBUR_SECRET>
 * - Satu grup WA per satker; bot memanggil sekali per satker.
 * - `sejak` = KURSOR EKSKLUSIF: ambil `tanggal` terbesar dari respons
 *   sebelumnya. Hasil hanya tanggal > sejak yang SUDAH siap dan punya minimal
 *   satu perintah, urut naik, maks BATAS_HARI_PER_RESPONS. Tanpa `sejak` =
 *   hanya hari ini (WIB).
 * - Tiap item: {id: "spkl-harian:<tanggal>", tanggal, pesan}. Kirim `pesan`
 *   apa adanya ke grup; buang duplikat berdasarkan `id`. Isinya tanpa NIP
 *   (nama boleh).
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
  if (sejakMentah && (!FORMAT_TANGGAL.test(sejakMentah) || Number.isNaN(Date.parse(`${sejakMentah}T00:00:00Z`)))) {
    return Response.json({ error: "Parameter sejak harus berformat YYYY-MM-DD." }, { status: 400, headers: TANPA_CACHE });
  }

  // Di luar gerbang SPKL: daftar kosong, tanpa menyentuh database.
  if (berlakuMulaiSpkl(satker) === null) {
    return Response.json([], { headers: TANPA_CACHE });
  }

  const sekarang = new Date();
  const hariIni = tanggalIsoWib(sekarang);
  // Tanggal depan tidak pernah siap, jadi batas atas = hari ini WIB.
  const filterTanggal = sejakMentah
    ? { gt: new Date(sejakMentah + "T00:00:00Z"), lte: new Date(hariIni + "T00:00:00Z") }
    : new Date(hariIni + "T00:00:00Z");

  const dibaca = await prisma.perintahLembur.findMany({
    where: { satuanKerja: satker, status: "TERKIRIM", tanggal: filterTanggal },
    orderBy: [{ tanggal: "asc" }, { dikirimPada: "asc" }, { id: "asc" }],
    take: BATAS_BARIS_PER_RESPONS,
    select: {
      tanggal: true,
      satuanKerja: true,
      uraianTugas: true,
      kepalaTim: { select: { nama: true } },
      anggota: {
        where: { terkirim: true },
        select: { jamDiperintahkan: true, pegawai: { select: { nama: true } } },
      },
    },
  });

  let perintah = dibaca;
  if (dibaca.length >= BATAS_BARIS_PER_RESPONS) {
    const terakhir = dibaca[dibaca.length - 1].tanggal.getTime();
    const tanpaTerakhir = dibaca.filter((p) => p.tanggal.getTime() !== terakhir);
    // Satu tanggal saja yang memenuhi batas: tetap dikirim (tidak realistis, tapi jangan macet).
    if (tanpaTerakhir.length > 0) perintah = tanpaTerakhir;
  }

  const perTanggal = new Map<string, typeof perintah>();
  for (const p of perintah) {
    const tanggalIso = p.tanggal.toISOString().slice(0, 10);
    // Gerbang per tanggal dan kesiapan (terkunci + tenggang), dihitung di sini.
    if (!spklAktifUntuk(p.satuanKerja, tanggalIso)) continue;
    if (!spklHarianSiap(tanggalIso, sekarang)) continue;
    if (p.anggota.length === 0) continue;
    const daftar = perTanggal.get(tanggalIso) ?? [];
    daftar.push(p);
    perTanggal.set(tanggalIso, daftar);
  }

  const hasil: { id: string; tanggal: string; pesan: string }[] = [];
  for (const tanggalIso of [...perTanggal.keys()].sort().slice(0, BATAS_HARI_PER_RESPONS)) {
    const [th, bl, hr] = tanggalIso.split("-").map(Number);
    const hari = NAMA_HARI[new Date(Date.UTC(th, bl - 1, hr)).getUTCDay()];
    const pesan = susunPesanSpklHarian({
      tanggalTeks: `${hari}, ${hr} ${NAMA_BULAN[bl - 1]} ${th}`,
      satuanKerja: satker,
      bertte: TTE_LEMBUR_AKTIF,
      kelompok: (perTanggal.get(tanggalIso) ?? []).map((p) => ({
        kepalaTimNama: p.kepalaTim.nama,
        uraian: p.uraianTugas,
        anggota: p.anggota
          .map((a) => ({ nama: a.pegawai.nama, jam: a.jamDiperintahkan }))
          .sort((x, y) => x.nama.localeCompare(y.nama, "id")),
      })),
    });
    if (pesan === null) continue;
    hasil.push({ id: `spkl-harian:${tanggalIso}`, tanggal: tanggalIso, pesan });
  }

  return Response.json(hasil, { headers: TANPA_CACHE });
}
