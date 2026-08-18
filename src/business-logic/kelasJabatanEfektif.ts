// ============================================================================
// KELAS JABATAN EFEKTIF - kelas yang benar-benar dipakai membayar Tunjangan
// Kinerja untuk SATU PERIODE, setelah memperhitungkan hukuman disiplin berupa
// penurunan jabatan (PP 94/2021).
//
// Modul ini PURE. Yang membaca database ada di pemanggilnya.
//
// KENAPA PERLU LAPISAN TERSENDIRI, bukan sekadar mengoreksi
// `Pegawai.kelasJabatan`:
//
//   1. Kolom itu MIRROR dari SIAP dan ditimpa ulang tiap sinkronisasi pegawai -
//      koreksi manual di sana hilang pada tarikan berikutnya.
//   2. SIAP tidak mencatat penurunan ini sama sekali. Dikonfirmasi lewat kasus
//      nyata: Galih Febian Azhar turun kelas 7 -> 6 selama satu tahun, SIAP
//      tetap menulis 7, dan selisih itu baru ketahuan waktu ADK Gajihub diadu
//      ke rincian manual Rokeu (bruto cocok 44 dari 46 - dua yang meleset
//      salah satunya justru kasus ini).
//   3. Penurunannya BERJANGKA. Setelah masa hukuman lewat kelasnya kembali,
//      TAPI periode-periode selama hukuman harus tetap dihitung dengan kelas
//      yang turun. Satu angka di tabel Pegawai tidak bisa menyimpan dua
//      kebenaran sekaligus.
//
// TIDAK ADA hubungannya dengan Pasal 15 Permenaker 15/2024 (potongan persentase
// karena hukuman disiplin), yang sampai sekarang memang belum diimplementasi
// karena besaran potongannya belum ada dokumennya. Ini mekanisme yang BERBEDA:
// bukan memotong hasil, tapi mengganti tarif dasarnya. Kalau nanti Pasal 15
// jadi diimplementasi, keduanya bisa berlaku bersamaan - dan itu perlu
// ditegaskan dulu ke Biro Hukum supaya tidak menghukum dua kali.
// TODO(confirm).
// ============================================================================

/** Subset SkHukumanDisiplin yang dipakai - sengaja bukan tipe Prisma. */
export interface SkPenurunanKelas {
  status: string;
  periodeMulaiBulan: number;
  periodeMulaiTahun: number;
  /** null = masih berlaku sampai dicabut. */
  periodeSelesaiBulan: number | null;
  periodeSelesaiTahun: number | null;
  /** null = hukumannya tidak menurunkan kelas jabatan. */
  kelasJabatanSelamaHukuman: number | null;
  /** null kalau SK-nya memang belum terbit - lihat `skBelumTerbit`. */
  nomorSk?: string | null;
  /**
   * Nomor SK belum ada karena keputusannya masih diproses pimpinan. TIDAK
   * menghalangi perhitungan (supaya alurnya bisa diuji utuh), tapi WAJIB ikut
   * ditampilkan di setiap layar yang menyebut SK ini - kalau tidak, potongan
   * berjalan atas dasar dokumen yang belum ada tanpa ada yang menyadarinya.
   */
  skBelumTerbit?: boolean;
}

/** Periode jadi satu bilangan yang bisa dibandingkan (2026-07 -> 24319). */
const urut = (bulan: number, tahun: number) => tahun * 12 + (bulan - 1);

/**
 * Apakah SK ini mencakup periode tertentu.
 *
 * Batas ATAS inklusif: periodeSelesai 6/2027 berarti Juni 2027 MASIH kena.
 * Hukuman "selama 1 tahun" mulai Juli 2026 berarti mulai 7/2026 selesai
 * 6/2027 - dua belas periode, bukan tiga belas.
 */
export function skMencakupPeriode(sk: SkPenurunanKelas, bulan: number, tahun: number): boolean {
  const p = urut(bulan, tahun);
  if (p < urut(sk.periodeMulaiBulan, sk.periodeMulaiTahun)) return false;
  if (sk.periodeSelesaiBulan === null || sk.periodeSelesaiTahun === null) return true;
  return p <= urut(sk.periodeSelesaiBulan, sk.periodeSelesaiTahun);
}

export interface HasilKelasEfektif {
  /** Kelas yang dipakai menghitung tarif. Sama dengan kelas dasar kalau tidak ada penurunan. */
  kelas: number | null;
  /** Kelas menurut data kepegawaian (SIAP), sebelum hukuman. */
  kelasDasar: number | null;
  /** SK yang menurunkannya - null kalau tidak ada. Dipakai UI buat menjelaskan. */
  sk: SkPenurunanKelas | null;
}

/**
 * Kelas jabatan yang berlaku untuk satu periode.
 *
 * HANYA SK berstatus **DISETUJUI** yang berpengaruh. SK yang masih "DIAJUKAN"
 * belum diputuskan OSDMA, dan memotong pembayaran atas dasar usulan yang belum
 * disetujui jelas keliru - lebih mudah membayar kekurangan nanti daripada
 * menarik kembali uang yang sudah dipotong tanpa dasar.
 *
 * Kalau ada LEBIH DARI SATU SK yang mencakup periode yang sama, dipakai kelas
 * TERENDAH. Situasi itu seharusnya tidak terjadi, tapi kalau terjadi, memilih
 * yang paling ringan berarti diam-diam mengabaikan salah satu putusan; memilih
 * yang terberat setidaknya tidak menghilangkan sanksi, dan `semuaSk` di bawah
 * memunculkan tumpangnya supaya bisa diperiksa manusia.
 */
export function kelasJabatanEfektif(
  kelasDasar: number | null,
  daftarSk: SkPenurunanKelas[],
  bulan: number,
  tahun: number
): HasilKelasEfektif {
  const berlaku = daftarSk.filter(
    (sk) =>
      sk.status === "DISETUJUI" &&
      sk.kelasJabatanSelamaHukuman !== null &&
      skMencakupPeriode(sk, bulan, tahun)
  );
  if (berlaku.length === 0) return { kelas: kelasDasar, kelasDasar, sk: null };

  const terpilih = berlaku.reduce((a, b) =>
    (b.kelasJabatanSelamaHukuman as number) < (a.kelasJabatanSelamaHukuman as number) ? b : a
  );
  return { kelas: terpilih.kelasJabatanSelamaHukuman, kelasDasar, sk: terpilih };
}

/**
 * Semua SK penurunan yang mencakup periode ini - dipakai UI buat memperingatkan
 * kalau ternyata lebih dari satu (lihat catatan di kelasJabatanEfektif).
 */
export function semuaSkPenurunanBerlaku(
  daftarSk: SkPenurunanKelas[],
  bulan: number,
  tahun: number
): SkPenurunanKelas[] {
  return daftarSk.filter(
    (sk) =>
      sk.status === "DISETUJUI" &&
      sk.kelasJabatanSelamaHukuman !== null &&
      skMencakupPeriode(sk, bulan, tahun)
  );
}
