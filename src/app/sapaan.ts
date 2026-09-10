/**
 * Nama untuk sapaan - maksimal dua kata.
 *
 * Nama dari SIAP sering panjang dan bergelar ("IRVAN GANEVA, M.M. , S.Ds"),
 * dan sapaan yang memuat seluruhnya justru terbaca kaku. Dua kata pertama
 * menangani mayoritas nama Indonesia dengan wajar.
 *
 * HURUF BESARNYA TIDAK DIUBAH. Banyak nama di SIAP tersimpan kapital penuh,
 * dan menurunkannya jadi Title Case akan merusak nama yang memang ditulis
 * begitu ("LA ODE", singkatan gelar) - proyek ini sudah punya aturan bahwa
 * nama pegawai tidak dikarang ulang.
 *
 * BERDIRI SENDIRI, bukan tinggal di halaman yang pertama memakainya: begitu
 * dashboard kedua ikut menyapa pemakainya, aturan di atas akan hidup di dua
 * tempat - dan aturan yang disalin pasti berbeda cepat atau lambat.
 */
export function sapaanNama(nama: string): string {
  const kata = nama.trim().split(/\s+/).filter(Boolean);
  if (kata.length === 0) return "";
  return kata.slice(0, 2).join(" ").replace(/,$/, "");
}
