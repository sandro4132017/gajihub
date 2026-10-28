// ============================================================================
// JENIS KEPEGAWAIAN - dari SIAP, PEGAWAI.STATUSPEGAWAIID.
//
// PURE (tidak ada I/O).
//
// Data kepegawaian diambil dari SIAP (keputusan user 2026-10-27), termasuk
// jenis PNS/PPPK. Kodenya sama dengan filter "pegawai aktif" di
// src/jobs/sinkronPegawaiSiap.ts (STATUS_AKTIF): '1' CPNS, '2' PNS, '23' PPPK.
// Kode lain (pensiun, pemberhentian, tak dikenal) bukan jenis kepegawaian,
// jadi hasilnya null - tidak ditebak dari format golongan.
// ============================================================================

export type JenisPegawai = "CPNS" | "PNS" | "PPPK";

const KODE_SIAP: Record<string, JenisPegawai> = {
  "1": "CPNS",
  "2": "PNS",
  "23": "PPPK",
};

export function jenisPegawaiDariKodeSiap(kode: string | null | undefined): JenisPegawai | null {
  if (kode === null || kode === undefined) return null;
  return KODE_SIAP[kode.trim()] ?? null;
}
