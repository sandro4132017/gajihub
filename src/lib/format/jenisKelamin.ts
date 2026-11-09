/**
 * Jenis kelamin untuk TAMPILAN (sapaan, ilustrasi), bukan perhitungan.
 *
 * Urutan sumber:
 * 1. Kolom `Pegawai.jenisKelamin` (L/P dari SIAP).
 * 2. Digit ke-15 NIP 18 digit menurut format NIP BKN: 1 = laki-laki,
 *    2 = perempuan.
 *
 * Mengembalikan null kalau keduanya tidak memberi jawaban - pemanggil yang
 * memilih bawaannya, bukan fungsi ini yang menebak.
 */
export function jenisKelaminTampil(
  jenisKelamin: string | null | undefined,
  nip: string | null | undefined,
): "L" | "P" | null {
  const jk = jenisKelamin?.trim().toUpperCase();
  if (jk === "L" || jk === "P") return jk;
  const digit = (nip ?? "").replace(/\D/g, "");
  if (digit.length !== 18) return null;
  if (digit[14] === "1") return "L";
  if (digit[14] === "2") return "P";
  return null;
}
