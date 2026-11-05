import { pingSiap, type HasilPingSiap } from "@/adapters/pingSiap";
import {
  buatPemeriksaKoneksi,
  type HasilKoneksi,
  type KetergantunganPemeriksa,
  type KlasifikasiKoneksi,
} from "@/lib/koneksi/statusKoneksi";
import { sebabDariKodeMssql } from "@/lib/koneksi/galatSumber";

export function klasifikasiKoneksiSiap(hasil: HasilPingSiap): KlasifikasiKoneksi {
  if (hasil.jenis === "ok") return { keadaan: "TERHUBUNG" };
  if (hasil.jenis === "jawaban_aneh") return { keadaan: "TIDAK_DIKETAHUI" };
  if (hasil.jenis === "belum_diatur") return { keadaan: "GANGGUAN", sebab: "KONFIGURASI" };
  if (hasil.batasWaktu) return { keadaan: "GANGGUAN", sebab: "BATAS_WAKTU" };
  return { keadaan: "GANGGUAN", sebab: sebabDariKodeMssql(hasil.kode) ?? "GALAT_SERVER" };
}

const pemeriksa = buatPemeriksaKoneksi<HasilPingSiap>({
  label: "SIAP",
  ping: pingSiap,
  klasifikasi: klasifikasiKoneksiSiap,
});

/** Hanya untuk test. */
export function kosongkanCacheKoneksiSiap(): void {
  pemeriksa.kosongkanCache();
}

/** Keadaan koneksi SIAP lewat cache 60 detik. TIDAK PERNAH MELEMPAR. */
export function periksaKoneksiSiap(
  opsi: { paksa?: boolean } = {},
  ketergantungan: KetergantunganPemeriksa<HasilPingSiap> = {}
): Promise<HasilKoneksi> {
  return pemeriksa.periksa(opsi, ketergantungan);
}
