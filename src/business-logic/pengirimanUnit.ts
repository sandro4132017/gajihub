// ============================================================================
// PENGIRIMAN REKAP UNIT - keadaan satu unit pada satu periode.
//
// PURE - nol I/O. Pemanggilnya yang membaca baris PengirimanUnit dari
// database lalu menyerahkannya ke sini.
//
// MENGGANTIKAN APPROVAL BERJENJANG (keputusan user 2026-09-02). Yang lama:
// tiap kalkulasi disetujui satu per satu, Kasubag TU jenjang 1 lalu PPABP
// jenjang final, dan kalkulasi ulang MERESET seluruh siklus itu ke DRAFT.
// Untuk unit berisi ratusan pegawai, satu kali hitung ulang membatalkan
// ratusan persetujuan yang isinya sama - di Biro Keuangan periode 7/2026
// tercatat 278 baris ApprovalLog untuk 47 pegawai, siklusnya terulang tiga
// kali.
//
// Yang baru: SATU keputusan per unit per periode. Kasubag TU menekan Kirim
// ketika dia yakin, dan sejak itu angkanya terkunci.
// ============================================================================

/** Bentuk minimal baris PengirimanUnit yang dibutuhkan modul ini. */
export interface BarisPengiriman {
  status: string;
  dikirimPada: Date;
  alasanKembali: string | null;
}

export type KeadaanPengiriman = "BELUM_KIRIM" | "TERKIRIM" | "DIKEMBALIKAN";

export interface StatusUnit {
  keadaan: KeadaanPengiriman;
  /**
   * Terkunci = kalkulasi periode ini tidak boleh dihitung ulang, disunting,
   * atau dihapus. Ini satu-satunya sumber kebenaran soal kunci - jangan
   * membandingkan string status di tempat lain.
   */
  terkunci: boolean;
  /** Kalau DIKEMBALIKAN, apa yang diminta PPABP untuk diperbaiki. */
  alasanKembali: string | null;
}

/**
 * `null` berarti unit ini belum pernah mengirim untuk periode tersebut -
 * memang tidak ada barisnya. Sengaja begitu, bukan baris berstatus "DRAFT":
 * "belum pernah kirim" dan "sudah kirim lalu dikembalikan" adalah dua
 * keadaan yang berbeda dan berbeda pula tindak lanjutnya.
 */
export function statusUnit(baris: BarisPengiriman | null): StatusUnit {
  if (baris === null) {
    return { keadaan: "BELUM_KIRIM", terkunci: false, alasanKembali: null };
  }
  if (baris.status === "TERKIRIM") {
    return { keadaan: "TERKIRIM", terkunci: true, alasanKembali: null };
  }
  return { keadaan: "DIKEMBALIKAN", terkunci: false, alasanKembali: baris.alasanKembali };
}

export interface KesiapanKirim {
  totalPegawai: number;
  jumlahKalkulasi: number;
  /**
   * Kalkulasi yang sumbernya sudah berubah atau DIHAPUS setelah angkanya
   * dibekukan. Opsional supaya pemanggil lama tidak berubah perilakunya;
   * tidak diisi berarti "tidak ada yang basi".
   */
  jumlahBasi?: number;
}

export interface HasilCekKirim {
  boleh: boolean;
  /** Diisi HANYA kalau `boleh` false - kalimat yang ditampilkan apa adanya. */
  alasan: string | null;
}

/**
 * Apakah unit ini boleh menekan Kirim sekarang.
 *
 * SYARATNYA CUMA SATU DAN SENGAJA KERAS: setiap pegawai aktif di unit itu
 * harus sudah punya kalkulasi. Mengirim rekap yang sebagian orangnya belum
 * terhitung berarti mengirim daftar yang orangnya hilang - dan karena
 * kirimannya TERKUNCI, orang yang hilang itu baru bisa ditambahkan setelah
 * PPABP mengembalikan seluruh kiriman. Menahannya di sini jauh lebih murah.
 *
 * TIDAK ada syarat "tidak boleh ada anomali". Anomali adalah hal yang
 * memang dinilai manusia - itulah gunanya tombol Kirim dipegang Kasubag TU
 * dan bukan dijalankan otomatis.
 */
export function cekBolehKirim(k: KesiapanKirim, status: StatusUnit): HasilCekKirim {
  if (status.terkunci) {
    return { boleh: false, alasan: "Rekap periode ini sudah dikirim dan sedang dikunci di PPABP." };
  }
  if (k.totalPegawai <= 0) {
    return { boleh: false, alasan: "Tidak ada pegawai aktif di unit ini pada periode tersebut." };
  }
  if (k.jumlahKalkulasi < k.totalPegawai) {
    const kurang = k.totalPegawai - k.jumlahKalkulasi;
    return {
      boleh: false,
      alasan: `${kurang} dari ${k.totalPegawai} pegawai belum punya hasil kalkulasi. Jalankan kalkulasi dulu - kiriman yang sudah terkunci tidak bisa ditambahi.`,
    };
  }
  // PUNYA BARIS TUKIN TIDAK SAMA DENGAN SIAP KIRIM.
  //
  // Baris yang presensi atau predikatnya berubah - atau DIHAPUS - setelah
  // angkanya dibekukan tetap berdiri dengan nilai lama. Tanpa penjagaan ini
  // ia ikut terkirim, terkunci, lalu masuk ADK dan dibayar: angka yang
  // dihitung dari data yang sudah tidak ada.
  if ((k.jumlahBasi ?? 0) > 0) {
    return {
      boleh: false,
      alasan: `${k.jumlahBasi} pegawai angkanya sudah basi - sumbernya berubah atau dihapus setelah Tukin dihitung. Tekan Hitung sekarang dulu; kiriman yang terkunci tidak bisa diperbaiki sendiri.`,
    };
  }
  return { boleh: true, alasan: null };
}

/**
 * Ringkasan progres seluruh unit, untuk papan di dashboard PPABP & Kasubag TU.
 *
 * Unit yang TIDAK punya baris pengiriman tetap dihitung sebagai "belum
 * kirim" - justru merekalah yang perlu dilihat PPABP. Karena itu daftar
 * unitnya datang dari luar (`semuaUnit`), bukan disimpulkan dari baris
 * pengiriman yang ada.
 */
export interface ProgresUnit {
  satuanKerja: string;
  keadaan: KeadaanPengiriman;
  dikirimPada: Date | null;
  alasanKembali: string | null;
}

export function rangkumProgres(
  semuaUnit: readonly string[],
  pengiriman: ReadonlyMap<string, BarisPengiriman>
): ProgresUnit[] {
  return [...semuaUnit]
    .sort((a, b) => a.localeCompare(b, "id-ID"))
    .map((satuanKerja) => {
      const baris = pengiriman.get(satuanKerja) ?? null;
      const st = statusUnit(baris);
      return {
        satuanKerja,
        keadaan: st.keadaan,
        dikirimPada: baris?.dikirimPada ?? null,
        alasanKembali: st.alasanKembali,
      };
    });
}

/** Cacah per keadaan, buat kalimat "12 dari 20 unit sudah mengirim". */
export function cacahProgres(progres: readonly ProgresUnit[]): Record<KeadaanPengiriman, number> {
  const hasil: Record<KeadaanPengiriman, number> = {
    BELUM_KIRIM: 0,
    TERKIRIM: 0,
    DIKEMBALIKAN: 0,
  };
  for (const p of progres) hasil[p.keadaan]++;
  return hasil;
}
