// ============================================================================
// RANGKUMAN PER SATUAN KERJA untuk tabel monitoring PPABP.
//
// PURE, nol I/O. Barisnya dikirim pemanggil; modul ini cuma mengelompokkan.
//
// SATUANNYA UNIT x PERIODE, bukan unit. Begitu filter "semua bulan" dipakai,
// satu satuan kerja punya keadaan pengiriman yang BERBEDA di tiap bulan -
// Agustus sudah terkirim, September belum. Menggabungkannya jadi satu baris
// memaksa memilih salah satu statusnya, dan status mana pun yang dipilih akan
// salah untuk periode yang lain.
//
// UNIT YANG BELUM PUNYA KALKULASI TETAP MUNCUL, dengan nilai nol. Mereka
// justru yang paling perlu ditagih: unit yang tidak tampil di layar tidak
// pernah ditanyakan, dan yang menagih tidak punya cara lain mengetahuinya
// selain menyisir daftar 84 satuan kerja di kepalanya sendiri.
//
// RUPIAH LEMBUR TETAP DIHITUNG DI SINI, dan penampilnya yang memutuskan ia
// boleh muncul - lihat `nilaiKalkulasiTampil`. Modul murni tidak membaca
// saklar tampilan; kalau ia ikut menyembunyikan, angkanya hilang juga dari
// tempat yang berhak melihatnya.
// ============================================================================

export type StatusKirimSatker = "TERKIRIM" | "DIKEMBALIKAN" | "BELUM_KIRIM";

/** Satu baris kalkulasi apa pun jenisnya, sudah diringkas ke yang dipakai. */
export interface BarisNilai {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  nilai: number;
}

export interface MasukanMonitoring {
  tukin: readonly BarisNilai[];
  uangMakan: readonly BarisNilai[];
  uangLembur: readonly BarisNilai[];
  /** Kunci `satker|bulan|tahun` -> status PengirimanUnit apa adanya. */
  petaKirim: ReadonlyMap<string, string>;
  /** Unit yang wajib muncul walau belum punya kalkulasi sama sekali. */
  unitCakupan: readonly string[];
  /** Periode yang wajib muncul untuk tiap unit di atas. */
  periodeCakupan: readonly { bulan: number; tahun: number }[];
}

export interface BarisMonitoringSatker {
  /** `satker|bulan|tahun` - dipakai sebagai key React, sudah unik. */
  kunci: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  status: StatusKirimSatker;
  jumlahPegawaiTukin: number;
  nilaiTukin: number;
  jumlahPegawaiUangMakan: number;
  nilaiUangMakan: number;
  jumlahPegawaiUangLembur: number;
  nilaiUangLembur: number;
}

/**
 * Urutan tampil: yang paling butuh ditindaklanjuti di atas.
 *
 * DIKEMBALIKAN lebih dulu dari BELUM_KIRIM karena bolanya ada di unit DAN
 * sudah pernah ditolak sekali - itu pekerjaan yang tertahan, bukan pekerjaan
 * yang belum dimulai. TERKIRIM paling bawah: tidak ada yang perlu dikerjakan
 * padanya.
 */
const URUTAN_STATUS: Record<StatusKirimSatker, number> = {
  DIKEMBALIKAN: 0,
  BELUM_KIRIM: 1,
  TERKIRIM: 2,
};

function bacaStatus(nilai: string | undefined): StatusKirimSatker {
  if (nilai === "TERKIRIM") return "TERKIRIM";
  if (nilai === "DIKEMBALIKAN") return "DIKEMBALIKAN";
  // Kunci yang TIDAK ada di peta berarti belum dikirim - itu keadaan normal,
  // bukan data hilang. Status di luar dua nilai di atas juga jatuh ke sini:
  // apa pun yang bukan bukti terkirim tidak boleh terbaca sebagai terkirim.
  return "BELUM_KIRIM";
}

export function kunciMonitoring(satuanKerja: string, bulan: number, tahun: number): string {
  return `${satuanKerja}|${bulan}|${tahun}`;
}

export function rangkumMonitoringSatker(m: MasukanMonitoring): BarisMonitoringSatker[] {
  const peta = new Map<string, BarisMonitoringSatker>();

  const ambil = (satuanKerja: string, bulan: number, tahun: number): BarisMonitoringSatker => {
    const kunci = kunciMonitoring(satuanKerja, bulan, tahun);
    let baris = peta.get(kunci);
    if (!baris) {
      baris = {
        kunci,
        satuanKerja,
        periodeBulan: bulan,
        periodeTahun: tahun,
        status: bacaStatus(m.petaKirim.get(kunci)),
        jumlahPegawaiTukin: 0,
        nilaiTukin: 0,
        jumlahPegawaiUangMakan: 0,
        nilaiUangMakan: 0,
        jumlahPegawaiUangLembur: 0,
        nilaiUangLembur: 0,
      };
      peta.set(kunci, baris);
    }
    return baris;
  };

  // Benih dulu, isi kemudian - supaya unit tanpa kalkulasi tetap punya baris.
  for (const unit of m.unitCakupan) {
    for (const p of m.periodeCakupan) ambil(unit, p.bulan, p.tahun);
  }

  for (const r of m.tukin) {
    const b = ambil(r.satuanKerja, r.periodeBulan, r.periodeTahun);
    b.jumlahPegawaiTukin++;
    b.nilaiTukin += r.nilai;
  }
  for (const r of m.uangMakan) {
    const b = ambil(r.satuanKerja, r.periodeBulan, r.periodeTahun);
    b.jumlahPegawaiUangMakan++;
    b.nilaiUangMakan += r.nilai;
  }
  for (const r of m.uangLembur) {
    const b = ambil(r.satuanKerja, r.periodeBulan, r.periodeTahun);
    b.jumlahPegawaiUangLembur++;
    b.nilaiUangLembur += r.nilai;
  }

  return [...peta.values()].sort(
    (a, b) =>
      URUTAN_STATUS[a.status] - URUTAN_STATUS[b.status] ||
      b.periodeTahun - a.periodeTahun ||
      b.periodeBulan - a.periodeBulan ||
      a.satuanKerja.localeCompare(b.satuanKerja, "id")
  );
}

/**
 * Nilai kalkulasi yang BOLEH ditampilkan.
 *
 * Saklarnya dioper sebagai parameter, bukan diimpor: modul ini murni, dan
 * fungsi yang diam-diam membaca keadaan global tidak bisa diuji pada dua
 * keadaan sekaligus - padahal justru dua keadaan itu yang perlu dijamin.
 */
export function nilaiKalkulasiTampil(
  baris: Pick<BarisMonitoringSatker, "nilaiTukin" | "nilaiUangMakan" | "nilaiUangLembur">,
  tampilkanLembur: boolean
): number {
  return baris.nilaiTukin + baris.nilaiUangMakan + (tampilkanLembur ? baris.nilaiUangLembur : 0);
}

/** Penyaring tabel: cocok kalau nama unitnya memuat kata yang dicari. */
export function saringMonitoring(
  baris: readonly BarisMonitoringSatker[],
  cari: string | undefined,
  status: string | undefined
): BarisMonitoringSatker[] {
  const kata = (cari ?? "").trim().toLowerCase();
  const statusSah = status === "TERKIRIM" || status === "DIKEMBALIKAN" || status === "BELUM_KIRIM";
  return baris.filter((b) => {
    if (kata && !b.satuanKerja.toLowerCase().includes(kata)) return false;
    // Status di luar tiga nilai sah DIABAIKAN, bukan menolak semua baris -
    // `?status=ngawur` yang mengosongkan tabel terbaca seperti tidak ada data.
    if (statusSah && b.status !== status) return false;
    return true;
  });
}
