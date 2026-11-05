// Label tampilan untuk status sertifikat elektronik dari Esign Client BSrE.
// Murni; hanya untuk tampilan, perbandingan status di kode tetap memakai kode mentah.

const LABEL: Record<string, string> = {
  ISSUE: "Aktif, siap dipakai",
  NOT_REGISTERED: "NIK belum terdaftar di BSrE",
  BELUM_TERDAFTAR: "NIK belum terdaftar di BSrE",
  NO_CERTIFICATE: "Belum punya sertifikat elektronik",
  NOT_FOUND: "Layanan BSrE sedang bermasalah",
  ERROR: "Layanan BSrE sedang bermasalah",
  UNKNOWN: "Status sertifikat tidak dikenali",
  SERVER_ERROR: "Layanan BSrE sedang bermasalah",
  NETWORK_ERROR: "Server BSrE tidak terjangkau",
  OFFLINE: "Server BSrE tidak terjangkau",
  INPUT: "Menunggu NIK",
  REVOKED: "Sertifikat dicabut",
  EXPIRED: "Sertifikat kedaluwarsa",
};

export function labelStatusSertifikat(status: string): string {
  return LABEL[status] ?? status;
}
