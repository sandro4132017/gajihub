/**
 * Menentukan SATU langkah berikutnya untuk Kasubag TU pada satu periode.
 *
 * PURE - nol I/O. Pemanggilnya (dashboard `/kasubag`) yang menghitung
 * jumlah-jumlahnya dari database lalu merangkai tautannya.
 *
 * URUTANNYA MENGIKUTI KETERGANTUNGAN, BUKAN SELERA - dan ini bukan soal
 * kerapian tampilan:
 *
 *   presensi (30%)  ─┐
 *                     ├─> kalkulasi Tukin ─> approval
 *   predikat  (70%)  ─┘
 *
 * Menghitung sebelum kedua bahan lengkap menghasilkan angka yang nanti harus
 * dihitung ulang - dan menghitung ulang **mereset seluruh siklus approval unit
 * ke DRAFT** (lihat `evaluasiApproval`: log sebelum `calculatedAt` dianggap
 * basi). Di Biro Keuangan periode 7/2026 itu benar-benar terjadi: 278 baris
 * ApprovalLog untuk 47 pegawai, siklusnya terulang sekitar tiga kali.
 *
 * Karena itu fungsi ini TIDAK PERNAH menyarankan "hitung" selama masih ada
 * bahan yang kurang. Ia menyebut bahan yang kurang lebih dulu.
 */

export type JenisLangkah = "PRESENSI" | "PREDIKAT" | "HITUNG";

export interface LangkahTutupBulan {
  jenis: JenisLangkah;
  /** Berapa yang sudah ada, buat dirangkai jadi kalimat oleh pemanggil. */
  sudah: number;
  dari: number;
}

export interface KeadaanTutupBulan {
  /** Pegawai AKTIF di unit ini. Pembagi semua kelengkapan. */
  totalPegawai: number;
  /** Baris RekapPresensiPeriode untuk periode ini. */
  jumlahRekapPresensi: number;
  /** Baris PredikatKinerja untuk periode ini. */
  jumlahPredikat: number;
  /** Baris TukinCalculation untuk periode ini. */
  jumlahKalkulasi: number;
}

/**
 * `null` berarti tidak ada yang perlu disarankan - panelnya tidak dirender
 * sama sekali.
 *
 * SENGAJA tidak mengembalikan "semua beres" sebagai langkah: baris status yang
 * selalu tampil berubah jadi hiasan yang berhenti dibaca, dan begitu itu
 * terjadi, peringatan yang sungguhan ikut tidak terbaca.
 */
export function langkahTutupBulan(keadaan: KeadaanTutupBulan): LangkahTutupBulan | null {
  const { totalPegawai, jumlahRekapPresensi, jumlahPredikat, jumlahKalkulasi } = keadaan;

  // Unit tanpa pegawai aktif bukan "belum lengkap" - tidak ada yang bisa
  // disarankan, dan "0 dari 0 pegawai" cuma membingungkan.
  if (totalPegawai <= 0) return null;

  if (jumlahRekapPresensi < totalPegawai) {
    return { jenis: "PRESENSI", sudah: jumlahRekapPresensi, dari: totalPegawai };
  }
  if (jumlahPredikat < totalPegawai) {
    return { jenis: "PREDIKAT", sudah: jumlahPredikat, dari: totalPegawai };
  }
  if (jumlahKalkulasi < totalPegawai) {
    return { jenis: "HITUNG", sudah: jumlahKalkulasi, dari: totalPegawai };
  }
  return null;
}
