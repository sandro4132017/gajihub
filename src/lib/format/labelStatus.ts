// Label tampilan untuk nilai status/enum mentah. Murni, tanpa I/O.
// Nilai yang tidak dikenal dikembalikan apa adanya supaya tidak ada data yang
// disembunyikan diam-diam. (`labelStatus` sudah dipakai presensiTampilan.ts.)

const STATUS_PEGAWAI: Record<string, string> = {
  AKTIF: "Aktif",
  PENSIUN: "Pensiun",
  BERHENTI: "Berhenti",
  USULAN_CPNS: "Usulan CPNS",
  NONAKTIF: "Tidak aktif",
  CUTI: "Cuti",
  MUTASI: "Mutasi",
};

const JENIS_PEMBAYARAN: Record<string, string> = {
  TUKIN: "Tunjangan Kinerja",
  GAJI: "Gaji",
};

const STATUS_SK_KGB: Record<string, string> = {
  DIAJUKAN: "Menunggu persetujuan",
  DISETUJUI: "Disetujui",
  DITOLAK: "Ditolak",
};

export function labelStatusPegawai(status: string): string {
  return STATUS_PEGAWAI[status] ?? status;
}

/** Sumber data pegawai berawalan "SIAP" ditampilkan sebagai "SIAP". */
export function labelSumberDataPegawai(sumber: string): string {
  return sumber.startsWith("SIAP") ? "SIAP" : sumber;
}

export function labelJenisPembayaran(jenis: string): string {
  return JENIS_PEMBAYARAN[jenis] ?? jenis;
}

export function labelStatusSkKgb(status: string): string {
  return STATUS_SK_KGB[status] ?? status;
}
