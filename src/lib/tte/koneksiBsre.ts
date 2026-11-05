import {
  buatPemeriksaKoneksi,
  type HasilKoneksi,
  type KeadaanKoneksi,
  type KetergantunganPemeriksa,
  type SebabGangguan,
} from "@/lib/koneksi/statusKoneksi";
import { pingLayananBsre, type HasilPingBsre } from "./esignClient";

// ============================================================================
// STATUS KONEKSI LAYANAN BSrE untuk indikator di layar.
//
// Hasilnya HANYA keadaan, sebab, dan waktu periksa - tidak pernah URL/IP
// server, NIK, maupun pesan galat mentah (alamat Esign Client ada di jaringan
// internal dan tidak untuk ditampilkan).
//
// "TERHUBUNG" berarti BSrE MENJAWAB dengan bentuk jawaban yang dikenal, bukan
// bahwa penandatanganan pasti berhasil. Jawaban yang tak dikenali tidak
// dihitung terhubung.
// ============================================================================

export type KeadaanKoneksiBsre = KeadaanKoneksi;
export type SebabGangguanBsre = SebabGangguan;
export type HasilKoneksiBsre = HasilKoneksi;

export function klasifikasiKoneksiBsre(hasil: HasilPingBsre): {
  keadaan: KeadaanKoneksiBsre;
  sebab?: SebabGangguanBsre;
} {
  if (hasil.jenis === "galat") {
    return {
      keadaan: "GANGGUAN",
      sebab: hasil.batasWaktu ? "BATAS_WAKTU" : "TIDAK_TERJANGKAU",
    };
  }
  const { status, punyaStatusCode } = hasil;
  if (status >= 500) return { keadaan: "GANGGUAN", sebab: "GALAT_SERVER" };
  // Jawaban berbentuk status BSrE (termasuk 4xx seperti "NIK tidak terdaftar")
  // membuktikan layanannya hidup dan memahami permintaan.
  if (punyaStatusCode) return { keadaan: "TERHUBUNG" };
  if (status === 401 || status === 403 || status === 404) {
    return { keadaan: "GANGGUAN", sebab: "KONFIGURASI" };
  }
  if (status === 408 || status === 429) return { keadaan: "GANGGUAN", sebab: "SIBUK" };
  return { keadaan: "TIDAK_DIKETAHUI" };
}

const NIK_PROBE_BAWAAN = "0000000000000000"; // sensitive-ok

const pemeriksa = buatPemeriksaKoneksi<HasilPingBsre>({
  label: "BSrE",
  ping: () => pingLayananBsre((process.env.ESIGN_PROBE_NIK || "").trim() || NIK_PROBE_BAWAAN),
  klasifikasi: klasifikasiKoneksiBsre,
});

/** Hanya untuk test. */
export function kosongkanCacheKoneksiBsre(): void {
  pemeriksa.kosongkanCache();
}

/**
 * Keadaan koneksi BSrE lewat cache 60 detik (lihat `buatPemeriksaKoneksi`).
 * TIDAK PERNAH MELEMPAR.
 */
export function periksaKoneksiBsre(
  opsi: { paksa?: boolean } = {},
  ketergantungan: KetergantunganPemeriksa<HasilPingBsre> = {}
): Promise<HasilKoneksiBsre> {
  return pemeriksa.periksa(opsi, ketergantungan);
}
