/**
 * "2026-08-31" -> "31/08/2026" - satu-satunya cara menulis tanggal ke layar
 * di halaman-halaman presensi.
 *
 * SENGAJA memotong string, BUKAN `new Date(iso).toLocaleDateString()`. Tanggal
 * presensi disimpan sebagai tengah malam UTC; mengubahnya jadi Date lalu
 * memformat dalam zona waktu pembaca bisa memundurkannya SEHARI di zona
 * negatif - dan tanggal yang meleset sehari berarti penanda kendala terbaca
 * menempel di hari yang salah.
 *
 * Nol di depannya sudah dibawa bentuk ISO-nya, jadi hasilnya selalu DD/MM/YYYY
 * genap - beda dari `toLocaleDateString("id-ID")` yang menulis "1/9/2026".
 */
export function tglTampil(iso: string): string {
  const [y, b, h] = iso.split("-");
  return `${h}/${b}/${y}`;
}
