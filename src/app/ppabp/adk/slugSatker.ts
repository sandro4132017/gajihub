/**
 * Potongan nama satuan kerja untuk disisipkan ke nama berkas ADK.
 *
 * KENAPA PERLU: operator sering mengunduh beberapa potongan periode yang sama
 * berturut-turut - Biro A, lalu Biro B, lalu semua unit. Tanpa pembeda di
 * namanya, yang tertinggal di folder Downloads adalah tiga berkas bernama
 * sama dengan angka (1), (2), (3) di belakangnya, dan tidak ada cara
 * mengetahui mana yang mana selain membukanya satu per satu.
 *
 * DIPOTONG PER KATA, bukan per huruf. Nama satuan kerja di sini panjang
 * ("Balai Besar Pelatihan Vokasi dan Produktivitas Bandung"), dan pemotongan
 * huruf ke-32 menghasilkan ekor seperti "...-barang-milik-n" yang terbaca
 * seperti berkas rusak. Kata terakhir yang tidak muat dibuang utuh.
 *
 * SLUG INI TIDAK PERNAH DIBACA BALIK jadi nama unit; ia cuma label. Sumber
 * yang sah tetap kolom satuan kerja di dalam berkasnya dan baris audit trail
 * yang mencatat nama lengkapnya.
 */
const MAKS_HURUF = 32;

export function slugSatker(satker: string | null | undefined): string {
  if (!satker) return "";
  const kata = satker
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (kata.length === 0) return "";

  const dipakai: string[] = [];
  for (const k of kata) {
    // Kata pertama selalu diambil walau sendirian sudah kepanjangan -
    // dipotong di bawah. Tanpa itu, unit bernama satu kata panjang
    // menghasilkan slug kosong dan pembedanya hilang justru di kasus yang
    // paling butuh dibedakan.
    if (dipakai.length > 0 && [...dipakai, k].join("-").length > MAKS_HURUF) break;
    dipakai.push(k);
  }
  return `-${dipakai.join("-").slice(0, MAKS_HURUF)}`;
}
