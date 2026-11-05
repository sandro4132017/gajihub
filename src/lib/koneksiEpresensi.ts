import { pingEpresensi, type HasilPingEpresensi } from "@/adapters/pingEpresensi";
import {
  buatPemeriksaKoneksi,
  type HasilKoneksi,
  type KetergantunganPemeriksa,
  type KlasifikasiKoneksi,
} from "@/lib/koneksi/statusKoneksi";
import { sebabDariKodePg } from "@/lib/koneksi/galatSumber";

export function klasifikasiKoneksiEpresensi(hasil: HasilPingEpresensi): KlasifikasiKoneksi {
  if (hasil.jenis === "ok") return { keadaan: "TERHUBUNG" };
  if (hasil.jenis === "jawaban_aneh") return { keadaan: "TIDAK_DIKETAHUI" };
  if (hasil.jenis === "belum_diatur") return { keadaan: "GANGGUAN", sebab: "KONFIGURASI" };
  if (hasil.batasWaktu) return { keadaan: "GANGGUAN", sebab: "BATAS_WAKTU" };
  return { keadaan: "GANGGUAN", sebab: sebabDariKodePg(hasil.kode) ?? "GALAT_SERVER" };
}

const pemeriksa = buatPemeriksaKoneksi<HasilPingEpresensi>({
  label: "e-Presensi",
  ping: pingEpresensi,
  klasifikasi: klasifikasiKoneksiEpresensi,
});

/** Hanya untuk test. */
export function kosongkanCacheKoneksiEpresensi(): void {
  pemeriksa.kosongkanCache();
}

/** Keadaan koneksi e-Presensi lewat cache 60 detik. TIDAK PERNAH MELEMPAR. */
export function periksaKoneksiEpresensi(
  opsi: { paksa?: boolean } = {},
  ketergantungan: KetergantunganPemeriksa<HasilPingEpresensi> = {}
): Promise<HasilKoneksi> {
  return pemeriksa.periksa(opsi, ketergantungan);
}
