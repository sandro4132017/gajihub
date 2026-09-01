/**
 * Kosakata tampilan presensi harian - dipakai bareng halaman rincian milik
 * verifikator (/tukin/presensi/[nip]) dan halaman milik pegawai sendiri
 * (/saya/presensi/[bulan]/[tahun]).
 *
 * DIPISAH KE SINI supaya keduanya tidak pernah menyebut hal yang sama dengan
 * nama berbeda. Kalau "ALPHA" tertulis "Tidak hadir (alpha)" di layar Kasubag
 * TU tapi "Alpha" di layar pegawainya, percakapan soal potongan dimulai dengan
 * dua orang yang tidak yakin sedang membicarakan baris yang sama.
 *
 * Ini MURNI tampilan - tidak ada keputusan pembayaran di sini. Yang menentukan
 * berhak/tidaknya uang makan & potongan tetap di src/business-logic/.
 */

export const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Label yang dimengerti orang untuk nilai status_kehadiran yang tersimpan. */
export const LABEL_STATUS: Record<string, string> = {
  WFO: "WFO",
  HADIR: "Hadir (WFO)",
  TERLAMBAT: "Hadir (terlambat)",
  WFH: "WFH / WFA",
  WFA: "WFH / WFA",
  DINAS_LUAR: "Dinas Keluar",
  DIKLAT: "Diklat",
  LEMBUR: "Lembur",
  UPACARA: "Upacara Bendera",
  CUTI: "Cuti",
  IZIN: "Izin",
  SAKIT: "Sakit",
  TUGAS_BELAJAR: "Tugas Belajar",
  ALPHA: "Tidak hadir (alpha)",
  TIDAK_PRESENSI: "Tidak presensi",
  TIDAK_DIKENALI: "Status tidak dikenali",
};

/**
 * Status apa adanya kalau belum punya label - JANGAN dikosongkan.
 *
 * Nilai status baru bisa muncul dari e-Presensi kapan saja. Sel kosong terbaca
 * sebagai "tidak ada data" padahal datanya ada; menampilkan kodenya mentah
 * jelek tapi jujur, dan langsung memberi tahu label mana yang perlu ditambah.
 */
export function labelStatus(status: string): string {
  return LABEL_STATUS[status] ?? status;
}

/**
 * Jam:menit dari kolom waktu presensi.
 *
 * WAJIB getUTC*, BUKAN getHours(). Jam presensi disimpan sebagai waktu dinding
 * apa adanya di zona UTC (lihat menitKeWaktu di simpanRekapPresensi.ts) -
 * membacanya dengan getHours() akan menggesernya sesuai zona waktu server, dan
 * di server ber-WIB seluruh jam masuk bergeser 7 jam. Itu bukan salah tampil
 * biasa: menit keterlambatan ikut terbaca salah.
 */
export function jamTeks(waktu: Date | null): string {
  if (!waktu) return "-";
  const jam = String(waktu.getUTCHours()).padStart(2, "0");
  const menit = String(waktu.getUTCMinutes()).padStart(2, "0");
  return `${jam}:${menit}`;
}

/** Nama hari dari tanggal presensi - UTC, alasan yang sama dengan jamTeks. */
export function namaHari(tanggal: Date): string {
  return NAMA_HARI[tanggal.getUTCDay()];
}

/** Tanggal presensi sebagai "05 Agu 2026" - UTC, alasan yang sama. */
export function tanggalTeks(tanggal: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(tanggal);
}
