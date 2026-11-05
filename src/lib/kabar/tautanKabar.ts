import {
  canAjukanKalkulasiTukinMassalUnit,
  canBukaHalamanPredikatKinerja,
  canGenerateAdk,
  canKelolaAssignmentRole,
  canKelolaDataPegawai,
  canKelolaGajiInduk,
  canKelolaHariLibur,
  canKelolaKendalaEpresensi,
  canKonfigurasiAdapter,
  canLihatTembusanBanding,
  canMonitorKesehatanSistem,
} from "../../auth/permissions";
import type { AuthUser } from "../../auth/permissions";
import type { PeriodeAktivitas } from "./kalimatAudit";

/**
 * Tautan tujuan tiap baris aktivitas. MURNI - hanya MEMBACA permissions.ts.
 *
 * Tautan dibuat hanya bila guard halaman tujuan meloloskan pemakai ini; baris
 * yang tujuannya tidak bisa dibuka dirender tanpa tautan, bukan sebagai pintu
 * ke layar "akses ditolak". Tidak ada NIP di href.
 */

function periodeQuery(p: PeriodeAktivitas | undefined): string {
  return p ? `bulan=${p.bulan}&tahun=${p.tahun}` : "";
}

function gabungQuery(...bagian: string[]): string {
  const isi = bagian.filter((b) => b !== "");
  return isi.length ? `?${isi.join("&")}` : "";
}

export function hrefAktivitas(
  user: AuthUser,
  entitas: string,
  periode: PeriodeAktivitas | undefined,
  satuanKerja: string | null,
  aksi?: string
): string | null {
  if (aksi === "SYNC") return null;

  switch (entitas) {
    case "PengirimanUnit":
    case "verifikasi_tabel_unit":
    case "pengecualian_pegawai":
    case "dokumen_tte":
    case "tukin_calculation":
    case "koreksi_presensi_harian": {
      if (!periode) {
        return entitas === "koreksi_presensi_harian" && canBukaHalamanPredikatKinerja(user)
          ? "/tukin/presensi"
          : null;
      }
      const satker = satuanKerja ? `satker=${encodeURIComponent(satuanKerja)}` : "";
      if (satuanKerja && canAjukanKalkulasiTukinMassalUnit(user, satuanKerja)) {
        return `/kasubag/kalkulasi${gabungQuery(periodeQuery(periode), satker)}`;
      }
      if (entitas === "PengirimanUnit" && canGenerateAdk(user)) {
        return `/ppabp/adk${gabungQuery(periodeQuery(periode), satker)}`;
      }
      if (entitas === "koreksi_presensi_harian" && canBukaHalamanPredikatKinerja(user)) {
        return "/tukin/presensi";
      }
      return null;
    }

    case "export_adk":
      return canGenerateAdk(user) ? `/ppabp/adk${gabungQuery(periodeQuery(periode))}` : null;

    case "predikat_kinerja":
      return canBukaHalamanPredikatKinerja(user) ? "/tukin/predikat-kinerja" : null;

    case "kendala_epresensi":
      return canKelolaKendalaEpresensi(user) ? "/tukin/presensi/kendala" : null;

    case "hari_libur_nasional":
      return canKelolaHariLibur(user) ? "/tukin/presensi/hari-libur" : null;

    case "gaji_induk":
      return canKelolaGajiInduk(user) ? "/ppabp/gaji-induk" : null;

    case "rekening_pegawai":
      return canKelolaGajiInduk(user) ? "/ppabp/rekening" : null;

    case "identitas_web_gaji":
      return canKelolaGajiInduk(user) ? "/ppabp/basis-data-gaji" : null;

    case "reconciliation_status":
      return canLihatTembusanBanding(user) ? "/ppabp/banding" : null;

    case "app_user":
      return canKelolaAssignmentRole(user) ? "/admin/role-assignment" : null;

    case "mode_jaringan":
      return canKelolaAssignmentRole(user) ? "/admin" : null;

    case "sinkronisasi_pegawai":
      return canMonitorKesehatanSistem(user) && canKonfigurasiAdapter(user) ? "/admin/sistem" : null;

    case "pegawai":
    case "sk_grade":
      return canKelolaDataPegawai(user) ? "/pegawai" : null;

    default:
      return null;
  }
}
