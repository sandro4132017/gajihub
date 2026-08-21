// ============================================================================
// ADK HARIAN - Uang Makan & Uang Lembur.
//
// BENTUKNYA BEDA dari ADK Tukin (adk.ts), dan itu beda isi bukan gaya:
//   ADK Tukin       : satu baris per PEGAWAI, berisi RUPIAH + rekening + kode
//                     bank, ada baris TOTAL.
//   ADK Makan/Lembur: satu baris per PEGAWAI PER HARI, TANPA rupiah, tanpa
//                     baris total, tanpa header.
// Web Gaji yang menghitung rupiahnya sendiri dari grade pegawai; file ini cuma
// menyetorkan FAKTA HARIAN. Karena tidak ada perintah bayar di dalamnya, file
// ini TIDAK perlu dipisah per bank (beda dari ADK Tukin).
//
// Dibuktikan dari isi 4 file template asli, bukan diasumsikan:
//   - Sheet "hasil" di .xlsm SAMA PERSIS dengan file .txt-nya (2.097/2.097 &
//     111/111 entri) - .txt adalah "save as text" dari sheet itu.
//   - Pemisah TAB, akhir baris CRLF, tanpa header, tanpa baris total.
//   - Tanggal ISO `YYYY-MM-DD`; jam lembur BILANGAN BULAT (nol pecahan di 111
//     baris); uang makan tanpa kolom ketiga (kehadiran itu ya/tidak).
//   - Dua kolom ringkasan sheet "depan" lembur = [jam hari KERJA, jam hari
//     LIBUR] - diuji cocok 35/35.
//   - LIBUR NASIONAL tidak perlu kalender: di tanggal merah e-Presensi tidak
//     punya satupun baris WFO/WFH, jadi harinya hilang sendiri. Terbukti: 20
//     tanggal di file asli = persis 20 hari kerja Juni.
//
// PURE. Yang membaca database & menulis response ada di app/ppabp/adk/*/route.ts.
// ============================================================================

/**
 * Nama bulan untuk judul di sheet "depan" (mis. "Uang_Lembur_Juni_2026",
 * persis pola di template). Sengaja dideklarasikan lokal, bukan di-import dari
 * `src/app/bulan.ts` - modul business-logic tidak boleh bergantung pada
 * lapisan aplikasi.
 */
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

/** Satu baris file ADK harian. `jam` cuma dipakai Uang Lembur. */
export interface BarisAdkHarian {
  nip: string;
  tanggalIso: string;
  jam?: number;
}

export interface PegawaiAdkHarian {
  nip: string;
  nama: string;
  /**
   * Uang makan  : tanggal-tanggal yang berhak, `jam` diabaikan.
   * Uang lembur : tanggal + jumlah jamnya.
   */
  hari: { tanggalIso: string; jam?: number }[];
}

/** Jumlah hari dalam satu bulan (bulan 1-12). */
export function hariDalamBulan(bulan: number, tahun: number): number {
  return new Date(Date.UTC(tahun, bulan, 0)).getUTCDate();
}

/** Sabtu / Minggu. Libur nasional TIDAK termasuk - lihat catatan di kepala file. */
export function akhirPekan(tanggalIso: string): boolean {
  const d = new Date(tanggalIso + "T00:00:00Z").getUTCDay();
  return d === 0 || d === 6;
}

/**
 * Urutkan & bakukan baris untuk file akhir.
 *
 * Urutannya: sesuai urutan pegawai yang diberikan pemanggil (di route: nama
 * A-Z), lalu tanggal menaik. Sama dengan file asli, dan yang lebih penting:
 * DETERMINISTIK, supaya dua unduhan untuk periode yang sama menghasilkan file
 * yang byte-nya identik dan bisa dibandingkan.
 *
 * NIP dirapikan dari spasi - file asli dari operator memang memuat 15 baris
 * ber-NIP berspasi di belakang, dan spasi itu bisa membuat pencocokan di sisi
 * penerima gagal tanpa pesan apa pun.
 */
export function susunBarisAdkHarian(
  pegawai: PegawaiAdkHarian[],
  opsi: { denganJam: boolean }
): BarisAdkHarian[] {
  const hasil: BarisAdkHarian[] = [];
  for (const p of pegawai) {
    const nip = p.nip.trim();
    const urut = [...p.hari].sort((a, b) => a.tanggalIso.localeCompare(b.tanggalIso));
    for (const h of urut) {
      if (!opsi.denganJam) {
        hasil.push({ nip, tanggalIso: h.tanggalIso });
        continue;
      }
      // Jam lembur dibulatkan ke bilangan bulat: SELURUH 111 baris file asli
      // bilangan bulat, sementara mesin Gajihub menghasilkan pecahan (mis.
      // 7,75 jam dari selisih jam presensi). Baris berjam NOL tidak
      // dimasukkan - di file asli tidak ada satupun.
      const jam = Math.round(h.jam ?? 0);
      if (jam > 0) hasil.push({ nip, tanggalIso: h.tanggalIso, jam });
    }
  }
  return hasil;
}

/**
 * Isi file .txt: tab-separated, CRLF, tanpa header, tanpa baris total.
 *
 * File asli diakhiri satu baris berisi tab kosong (`"\t\t\r\n"`) - sisa dari
 * "save as text" spreadsheet yang barisnya lebih panjang dari datanya. Itu
 * TIDAK ditiru: baris kosong bukan bagian format, dan penerima yang membaca
 * baris per baris bisa tersandung NIP kosong.
 */
export function rakitTeksAdkHarian(baris: BarisAdkHarian[]): string {
  if (baris.length === 0) return "";
  const garis = baris.map((b) =>
    b.jam === undefined ? `${b.nip}\t${b.tanggalIso}` : `${b.nip}\t${b.tanggalIso}\t${b.jam}`
  );
  return garis.join("\r\n") + "\r\n";
}

export type SelGrid = string | number;

/**
 * Sheet "depan" - tampilan grid seperti template operator: satu baris per
 * pegawai, satu kolom per tanggal, plus ringkasan di kanan.
 *
 * KENAPA IKUT DIBUAT padahal yang disetor cuma daftar panjangnya: bentuk
 * panjang tidak bisa diperiksa manusia. Operator yang selama ini memakai
 * template ini mengenali unitnya dari grid - berapa hari, di tanggal berapa,
 * siapa yang kosong. Kalau exportnya cuma daftar 2.000 baris, satu-satunya
 * cara memeriksanya adalah membuka Excel dan membuat pivot sendiri.
 *
 * Ringkasan di kanan mengikuti template: uang makan satu kolom (jumlah hari),
 * uang lembur DUA kolom (jam hari kerja | jam hari libur) - pemisahan yang
 * sudah diuji cocok 35/35 terhadap file asli.
 *
 * BATAS YANG HARUS DISADARI: pemisahan kerja/libur di sini cuma mengenali
 * SABTU & MINGGU. Libur nasional yang jatuh di hari kerja akan masuk kolom
 * "hari kerja" padahal tarifnya 2x. Ini konsisten dengan seluruh sistem
 * (`hariLibur` di presensiPdfKeRekap.ts juga akhir-pekan-saja, dan sudah
 * memberi catatan per tanggalnya) - BUKAN kelalaian baru di sini. Kedua kolom
 * ini juga cuma INFORMASI buat pemeriksaan manusia; yang benar-benar disetor
 * ke Web Gaji adalah daftar per tanggal, dan di situ tarif ditentukan oleh
 * Web Gaji sendiri berdasarkan tanggalnya. Jadi salah klasifikasi di sini
 * tidak mengubah apa yang dibayarkan.
 */
export function susunGridAdkHarian(
  pegawai: PegawaiAdkHarian[],
  periodeBulan: number,
  periodeTahun: number,
  opsi: { denganJam: boolean }
): SelGrid[][] {
  const jumlahHari = hariDalamBulan(periodeBulan, periodeTahun);
  const hariKolom = Array.from({ length: jumlahHari }, (_, i) => i + 1);

  const judul = opsi.denganJam ? "Lembur" : "Makan";
  const namaBulan = NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan);
  const petunjuk = opsi.denganJam
    ? "Isikan kolom tanggal dengan jumlah jam untuk hari lembur"
    : "Isikan kolom tanggal dengan angka 1 pada hari kehadiran";

  const kepala: SelGrid[][] = [
    ["Jenis", judul, petunjuk],
    ["Tahun", periodeTahun, `${opsi.denganJam ? "Uang_Lembur" : "Uang_Makan"}_${namaBulan}_${periodeTahun}`],
    ["Bulan", periodeBulan],
    ["Batas", jumlahHari],
    [
      "No",
      "NIP",
      "Nama",
      ...hariKolom.map((h) => h),
      ...(opsi.denganJam ? ["Jam hari kerja", "Jam hari libur"] : ["Jumlah hari"]),
    ],
  ];

  const isi: SelGrid[][] = pegawai.map((p, i) => {
    const perTanggal = new Map<number, number>();
    let kerja = 0;
    let libur = 0;
    for (const h of p.hari) {
      const tgl = Number(h.tanggalIso.slice(8, 10));
      if (opsi.denganJam) {
        const jam = Math.round(h.jam ?? 0);
        if (jam <= 0) continue;
        perTanggal.set(tgl, (perTanggal.get(tgl) ?? 0) + jam);
        if (akhirPekan(h.tanggalIso)) libur += jam;
        else kerja += jam;
      } else {
        perTanggal.set(tgl, 1);
        kerja += 1;
      }
    }
    return [
      i + 1,
      p.nip.trim(),
      p.nama,
      ...hariKolom.map((h) => perTanggal.get(h) ?? ""),
      ...(opsi.denganJam ? [kerja, libur] : [kerja]),
    ];
  });

  return [...kepala, ...isi];
}
