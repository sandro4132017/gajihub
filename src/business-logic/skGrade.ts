/**
 * SK GRADING - surat keputusan yang menetapkan KELAS JABATAN seseorang.
 *
 * KENAPA DICATAT MANUAL, dan ini bukan pilihan. Diukur ke SIAP 2026-09-14:
 * nomor SK grading TIDAK ADA di sana. Tabel yang seharusnya memuatnya -
 * `MANJAB_PENERBITAN_JABATAN`, `_MAPJABATAN`, `_SATKER`, masing-masing
 * berkolom NOSK/TGL_TERBIT - ketiganya NOL BARIS, dan `PEGAWAI.JOBGRADE`
 * terisi 0 dari 5.073 pegawai aktif. Kelas jabatan yang dipakai Gajihub
 * datang dari tabel acuan per JABATAN (`MASTERFUNGSIONAL.JOBGRADE` /
 * `SATKER.JOBGRADE`), yang tidak membawa nomor SK sama sekali.
 *
 * Yang ADA di SIAP cuma SK JABATAN (`RIWAYATJABATAN.NOSK`, 99,9% terisi).
 * Itu SK yang mengangkat orangnya ke jabatan; grade-nya mengikuti sebagai
 * akibat, tapi nomornya bukan nomor SK grading - memakainya berarti mengirim
 * SK yang salah jenis ke Web Gaji, dan salahnya baru ketahuan waktu ditanya.
 *
 * KENAPA RIWAYAT, BUKAN SATU KOLOM DI `Pegawai`. Berkas ADK bisa dibuat jauh
 * setelah periodenya lewat - Tukin Januari boleh saja baru dikerjakan Agustus
 * (aturan user 2026-09-14). Kalau SK grading orang itu berganti di bulan Mei,
 * berkas Januari WAJIB memuat SK yang berlaku pada Januari, bukan yang
 * terbaru. Satu kolom tidak bisa menjawab itu; ia cuma tahu keadaan hari ini.
 */

export interface SkGradeRingkas {
  nomorSk: string;
  tanggalSk: Date;
  /** Terhitung mulai tanggal SK ini berlaku - INI yang menentukan, bukan tanggalSk. */
  tmtBerlaku: Date;
  kelasJabatan: number;
}

/**
 * SK grading yang BERLAKU pada satu periode penggajian.
 *
 * Yang dipilih: `tmtBerlaku` paling akhir yang MASIH di dalam atau sebelum
 * periode itu. SK yang mulai berlaku SESUDAH periodenya diabaikan - itu masa
 * depan bagi berkas yang sedang dibuat.
 *
 * AMBANGNYA AKHIR BULAN, BUKAN AWAL BULAN. SK yang berlaku 20 Januari tetap
 * dipakai untuk periode Januari; memakai awal bulan akan membuang SK yang
 * terbit di tengah periode dan mengirim SK lama untuk bulan yang sudah
 * berganti kelas.
 *
 * PENYETARA kalau ada dua SK ber-TMT sama: tanggal SK yang lebih baru menang,
 * lalu nomornya diurutkan. Bukan supaya rapi - tanpa urutan yang pasti, dua
 * ekspor untuk periode yang sama bisa memuat nomor SK berbeda.
 */
export function skGradeBerlaku(
  daftar: readonly SkGradeRingkas[],
  periodeBulan: number,
  periodeTahun: number
): SkGradeRingkas | null {
  // Awal bulan BERIKUTNYA - batas eksklusif, jadi seluruh hari di bulan itu ikut.
  const batas = Date.UTC(periodeTahun, periodeBulan, 1);

  const layak = daftar.filter((s) => s.tmtBerlaku.getTime() < batas);
  if (layak.length === 0) return null;

  return layak.reduce((terpilih, kandidat) => {
    const selisihTmt = kandidat.tmtBerlaku.getTime() - terpilih.tmtBerlaku.getTime();
    if (selisihTmt !== 0) return selisihTmt > 0 ? kandidat : terpilih;

    const selisihTanggal = kandidat.tanggalSk.getTime() - terpilih.tanggalSk.getTime();
    if (selisihTanggal !== 0) return selisihTanggal > 0 ? kandidat : terpilih;

    return kandidat.nomorSk > terpilih.nomorSk ? kandidat : terpilih;
  });
}
