// ============================================================================
// PEMERIKSA STATUS KONEKSI GENERIK (BSrE, e-Presensi, ...).
//
// Satu pabrik, satu perilaku: cache 60 detik, "paksa" hanya menembus cache
// bila umurnya > 15 detik (tombol "Periksa ulang" yang ditekan berulang tidak
// membanjiri layanan luar), permintaan bersamaan menumpang satu ping, dan
// TIDAK PERNAH melempar. Hasilnya hanya keadaan, sebab, dan waktu periksa -
// tidak pernah alamat server, NIK, kredensial, maupun pesan galat mentah.
// ============================================================================

export type KeadaanKoneksi = "TERHUBUNG" | "GANGGUAN" | "TIDAK_DIKETAHUI";
export type SebabGangguan =
  | "GALAT_SERVER"
  | "KONFIGURASI"
  | "SIBUK"
  | "BATAS_WAKTU"
  | "TIDAK_TERJANGKAU";

export interface KlasifikasiKoneksi {
  keadaan: KeadaanKoneksi;
  sebab?: SebabGangguan;
}

export interface HasilKoneksi extends KlasifikasiKoneksi {
  /** ISO string. */
  diperiksaPada: string;
}

export interface KetergantunganPemeriksa<H> {
  sekarang?: () => number;
  ping?: () => Promise<H>;
}

const TTL_MS = 60_000;
const UMUR_MIN_PAKSA_MS = 15_000;

export function buatPemeriksaKoneksi<H>(opsi: {
  /** Nama untuk log saat keadaan berganti; bukan alamat apa pun. */
  label: string;
  ping: () => Promise<H>;
  klasifikasi: (hasil: H) => KlasifikasiKoneksi;
}): {
  periksa: (
    opsiPeriksa?: { paksa?: boolean },
    ketergantungan?: KetergantunganPemeriksa<H>
  ) => Promise<HasilKoneksi>;
  kosongkanCache: () => void;
} {
  let cache: { hasil: HasilKoneksi; dibuatPada: number } | null = null;
  let sedangBerjalan: Promise<HasilKoneksi> | null = null;
  let keadaanTerakhir: KeadaanKoneksi | null = null;

  function kosongkanCache(): void {
    cache = null;
    sedangBerjalan = null;
    keadaanTerakhir = null;
  }

  async function periksa(
    { paksa = false }: { paksa?: boolean } = {},
    ketergantungan: KetergantunganPemeriksa<H> = {}
  ): Promise<HasilKoneksi> {
    const sekarang = ketergantungan.sekarang ?? (() => Date.now());
    const ping = ketergantungan.ping ?? opsi.ping;

    if (cache) {
      const umur = sekarang() - cache.dibuatPada;
      const segar = paksa ? umur <= UMUR_MIN_PAKSA_MS : umur < TTL_MS;
      if (segar) return cache.hasil;
    }

    if (sedangBerjalan) return sedangBerjalan;

    const janji = (async (): Promise<HasilKoneksi> => {
      let klas: KlasifikasiKoneksi;
      try {
        klas = opsi.klasifikasi(await ping());
      } catch {
        klas = { keadaan: "TIDAK_DIKETAHUI" };
      }
      const waktu = sekarang();
      const hasil: HasilKoneksi = {
        keadaan: klas.keadaan,
        ...(klas.sebab ? { sebab: klas.sebab } : {}),
        diperiksaPada: new Date(waktu).toISOString(),
      };
      cache = { hasil, dibuatPada: waktu };
      if (keadaanTerakhir !== null && keadaanTerakhir !== hasil.keadaan) {
        console.warn(`[koneksi] ${opsi.label} berubah: ${keadaanTerakhir} -> ${hasil.keadaan}`);
      }
      keadaanTerakhir = hasil.keadaan;
      return hasil;
    })().finally(() => {
      sedangBerjalan = null;
    });
    sedangBerjalan = janji;
    return janji;
  }

  return { periksa, kosongkanCache };
}
