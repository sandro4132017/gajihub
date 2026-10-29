import { StatusBadge } from "./StatusBadge";

// ============================================================================
// Status satu baris kalkulasi di dashboard domain (Tukin / Uang Makan).
//
// MENGGANTIKAN badge approval berjenjang ("Menunggu jenjang 2", "Disetujui",
// "Perlu revisi"). Approval per baris dihapus 2026-09-02: yang menentukan
// sekarang bukan keadaan baris itu sendiri, melainkan apakah UNITNYA sudah
// mengirim rekap periode itu ke PPABP.
//
// KONSEKUENSI YANG SENGAJA: seluruh baris dalam satu unit selalu berstatus
// sama. Itu bukan kehilangan ketelitian - itu memang kenyataannya sekarang,
// dan menampilkannya per baris seolah bisa berbeda justru menyesatkan.
// ============================================================================

export type KeadaanKirimBaris = "TERKIRIM" | "DIKEMBALIKAN" | "BELUM_KIRIM";

/**
 * Terjemahkan status baris PengirimanUnit jadi keadaan yang ditampilkan.
 *
 * `undefined` berarti unit itu belum pernah mengirim untuk periode tersebut -
 * memang tidak ada barisnya, dan itu keadaan normal di awal bulan, bukan
 * kesalahan data.
 */
export function keadaanKirimBaris(status: string | undefined): KeadaanKirimBaris {
  if (status === "TERKIRIM") return "TERKIRIM";
  if (status === "DIKEMBALIKAN") return "DIKEMBALIKAN";
  return "BELUM_KIRIM";
}

export function BadgeStatusKirim({ keadaan }: { keadaan: KeadaanKirimBaris }) {
  if (keadaan === "TERKIRIM") return <StatusBadge label="Terkirim & terkunci" warna="hijau" />;
  if (keadaan === "DIKEMBALIKAN") return <StatusBadge label="Dikembalikan PPABP" warna="amber" />;
  return <StatusBadge label="Belum dikirim unit" warna="abu" />;
}
