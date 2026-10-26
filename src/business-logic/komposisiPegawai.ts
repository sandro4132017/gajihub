// ============================================================================
// KOMPOSISI PEGAWAI AKTIF - bahan panel keterangan di dashboard lintas unit.
//
// PURE, nol I/O. Barisnya dikirim pemanggil; modul ini cuma mencacah.
//
// TIGA KEPUTUSAN YANG MENENTUKAN ANGKANYA, dan semuanya sengaja TIDAK
// diputuskan di sini melainkan diambil dari tempat yang sudah memutuskannya:
//
// 1. PNS vs P3K diambil dari `IdentitasWebGaji.jenisPegawai` (lewat
//    `kelompokDariNilaiData` di src/app/ppabp/adk/jenisPegawaiAdk.ts), BUKAN
//    dari format golongan. Berkas ADK dipisah dengan dasar itu, jadi kalau
//    panel ini memakai dasar lain, dashboard dan berkas yang dikirim akan
//    menyebut dua angka berbeda untuk pertanyaan yang sama. Diukur
//    2026-10-22 pada 5.062 pegawai aktif: dasar golongan keliru pada 13 orang
//    (identitas Web Gaji menyebut PPPK, golongannya berformat PNS).
//
// 2. Ruang golongan PNS dibaca `golonganRomawi()` dan jenjang PPPK dibaca dari
//    `PADANAN_GOLONGAN_PPPK` - dua-duanya milik tarifSbm.ts, yang sudah
//    menanggung aturan "sufiks huruf wajib" yang membedakan "III/a" milik PNS
//    dari "III" milik PPPK. Menulis pembacanya lagi di sini berarti dua
//    pembaca yang bisa berbeda, dan yang satu menentukan uang makan.
//
// 3. "PTKP tidak bisa ditentukan" = `hitungPtkp()` mengembalikan null. Dengan
//    begitu angka di panel tidak pernah bergeser dari mesin PTKP-nya sendiri
//    kalau aturan status kawin yang sah suatu saat berubah.
//
// YANG TIDAK DIKETAHUI PUNYA WADAHNYA SENDIRI, tidak dibagi rata ke kelompok
// terdekat. Pegawai tanpa identitas Web Gaji bukan "PNS yang datanya kurang" -
// dia pegawai yang KELUAR dari berkas ADK begitu penyaringan jenis dipakai,
// dan itu justru yang perlu terlihat sebelum berkasnya dikirim.
// ============================================================================

import { golonganRomawi, PADANAN_GOLONGAN_PPPK } from "./tarifSbm";
import { hitungPtkp } from "./ptkp";

/** Kelompok berkas ADK, sama kode dengan `JenisPegawaiAdk`. */
export type KelompokAdk = "PNS" | "P3K";

export interface BarisKomposisi {
  /**
   * Jenis menurut identitas Web Gaji, SUDAH dipetakan ke kelompok berkas ADK
   * oleh pemanggil. `null` berarti belum punya identitas Web Gaji, atau
   * jenisnya di luar daftar yang dikenali - dua-duanya berakibat sama
   * (keluar dari berkas), jadi tidak dipisah.
   */
  kelompok: KelompokAdk | null;
  golongan: string | null;
  /** "L" / "P" apa adanya dari SIAP. */
  jenisKelamin: string | null;
  kelasJabatan: number | null;
  /** "K" / "B" / "C" / "J" / "D" apa adanya dari SIAP. */
  statusKawin: string | null;
  /** Satuan kerja apa adanya dari SIAP - bahan pengelompokan pusat/UPT. */
  satuanKerja: string;
}

export interface PotonganKomposisi {
  /** Nilai apa adanya, mis. "III" - dipakai sebagai key React. */
  kode: string;
  /** Teks yang dibaca orang, mis. "Golongan III" atau "Jenjang IX". */
  label: string;
  jumlah: number;
}

export interface KomposisiPegawai {
  total: number;

  /** Jumlah per kelompok berkas ADK. Ketiganya SALING LEPAS dan berjumlah `total`. */
  pns: number;
  p3k: number;
  tanpaIdentitasWebGaji: number;

  /** Ketiganya SALING LEPAS dan berjumlah `total`. */
  lelaki: number;
  perempuan: number;
  jenisKelaminTidakTercatat: number;

  /** Ruang golongan PNS (I-IV), urut skala, yang nol dibuang. */
  ruangPns: PotonganKomposisi[];
  /** Jenjang PPPK (I-XVII), urut skala, yang nol dibuang. */
  jenjangPppk: PotonganKomposisi[];
  /** Golongannya kosong atau di luar kedua skala - tarif SBM tidak bisa ditentukan. */
  golonganTidakTerbaca: number;

  /**
   * Pegawai yang identitas Web Gaji-nya berkata lain dari format golongannya.
   *
   * ADA SEBAGAI ANGKA DI LAYAR, bukan cuma catatan kode: tanpa ini, orang
   * yang menjumlahkan `ruangPns` lalu membandingkannya dengan `pns` akan
   * menemukan dua angka berbeda dan wajar menyimpulkan panelnya rusak.
   */
  bedaIdentitasDenganGolongan: number;

  /** Ketiganya SALING LEPAS dan berjumlah `total` - lihat kelompokInstansi(). */
  kantorPusat: number;
  uptDaerah: number;
  instansiTidakDiketahui: number;

  /** Tarif Tunjangan Kinerja tidak bisa ditentukan tanpa ini. */
  tanpaKelasJabatan: number;
  /** `hitungPtkp()` mengembalikan null - status kawinnya tidak sah/kosong. */
  ptkpTidakBisaDitentukan: number;
}

const RUANG_PNS = ["I", "II", "III", "IV"] as const;

export type KelompokInstansi = "PUSAT" | "UPT" | "TIDAK_DIKETAHUI";

/**
 * Satuan kerja yang BUKAN unit sungguhan dan karena itu tidak boleh
 * dikelompokkan ke mana pun. Diukur 2026-10-22: "Unit Sementara" memuat 3
 * pegawai aktif - penampung data, bukan kantor.
 */
const SATKER_PENAMPUNG = new Set(["unit sementara"]);

/**
 * Kantor pusat atau UPT daerah, dari NAMA satuan kerjanya.
 *
 * KENAPA DARI NAMA. SIAP SEBENARNYA PUNYA KOLOMNYA, TAPI KOSONG - diukur
 * read-only 2026-10-22 pada 73 satker Eselon II yang berpegawai:
 * `SATKER.TIPEKANTOR` kosong 73/73, `SATKER.TIPOLOGI` kosong 73/73,
 * `SATKER.PROPINSIID` kosong 72/73. Gajihub sendiri tidak menyimpan
 * kewenangan satker (KP/KD) dari DIPA, dan IdentitasWebGaji cuma memuat kode
 * satker. Kalau suatu saat kolom SIAP itu diisi, pakai kolomnya - bukan nama.
 *
 * ATURANNYA: satuan kerja yang namanya diawali "Balai" adalah UPT, sisanya
 * kantor pusat.
 *
 * SUDAH DIADU ke kolom yang TERISI, `SATKER.ESELON` (eselon pimpinan unit),
 * dan sepakat 100%: ke-43 satker "pusat" semuanya Eselon II.a (21), ke-29 UPT
 * semuanya II.b (22), III.a (31), atau III.b (32). Nol yang tidak sepakat.
 *
 * Yang diukur adalah KEDUDUKAN ORGANISASI, bukan letak gedung: Balai Besar K3
 * Jakarta (57 pegawai) tetap UPT walau berada di Jakarta - dan eselonnya
 * (II.b) setuju.
 *
 * TODO(confirm): Politeknik Ketenagakerjaan (65 pegawai) masuk PUSAT karena
 * namanya tidak diawali "Balai", dan SATU-SATUNYA satker yang tidak bisa diadu:
 * eselonnya kosong di SIAP. Ia dibayar lewat satker Web Gaji sendiri (352632)
 * seperti UPT - tapi itu bukan pembeda, karena Pusat Pengembangan SDM yang
 * jelas kantor pusat juga punya satker sendiri (450990). Pastikan ke Biro
 * Organisasi dan SDMA; kalau ternyata UPT, tambahkan namanya di sini sebagai
 * pengecualian - jangan ubah aturan "Balai"-nya.
 */
export function kelompokInstansi(satuanKerja: string | null | undefined): KelompokInstansi {
  const nama = (satuanKerja ?? "").trim().toLowerCase();
  if (!nama || SATKER_PENAMPUNG.has(nama)) return "TIDAK_DIKETAHUI";
  // "balai " dengan spasi: kata utuh, bukan awalan kata lain.
  return nama.startsWith("balai ") ? "UPT" : "PUSAT";
}

/**
 * Urutan jenjang PPPK diambil dari urutan kunci `PADANAN_GOLONGAN_PPPK`, yang
 * di sana memang ditulis berurutan I-XVII. Sengaja tidak menyalin daftarnya:
 * salinan kedua pasti tertinggal waktu skalanya berubah.
 */
const SKALA_PPPK = Object.keys(PADANAN_GOLONGAN_PPPK);

/** Jenjang PPPK dari golongan telanjang ("IX"), null kalau berformat PNS. */
function jenjangPppk(golongan: string | null): string | null {
  if (!golongan) return null;
  const bersih = golongan.trim().toUpperCase();
  if (bersih.includes("/")) return null;
  return bersih in PADANAN_GOLONGAN_PPPK ? bersih : null;
}

export function hitungKomposisiPegawai(baris: readonly BarisKomposisi[]): KomposisiPegawai {
  const cacahRuang = new Map<string, number>();
  const cacahJenjang = new Map<string, number>();

  const k: KomposisiPegawai = {
    total: baris.length,
    pns: 0,
    p3k: 0,
    tanpaIdentitasWebGaji: 0,
    lelaki: 0,
    perempuan: 0,
    jenisKelaminTidakTercatat: 0,
    ruangPns: [],
    jenjangPppk: [],
    golonganTidakTerbaca: 0,
    bedaIdentitasDenganGolongan: 0,
    kantorPusat: 0,
    uptDaerah: 0,
    instansiTidakDiketahui: 0,
    tanpaKelasJabatan: 0,
    ptkpTidakBisaDitentukan: 0,
  };

  for (const b of baris) {
    if (b.kelompok === "PNS") k.pns++;
    else if (b.kelompok === "P3K") k.p3k++;
    else k.tanpaIdentitasWebGaji++;

    const jk = (b.jenisKelamin ?? "").trim().toUpperCase();
    if (jk === "L") k.lelaki++;
    else if (jk === "P") k.perempuan++;
    else k.jenisKelaminTidakTercatat++;

    const ruang = golonganRomawi(b.golongan);
    const jenjang = ruang ? null : jenjangPppk(b.golongan);
    if (ruang) cacahRuang.set(ruang, (cacahRuang.get(ruang) ?? 0) + 1);
    else if (jenjang) cacahJenjang.set(jenjang, (cacahJenjang.get(jenjang) ?? 0) + 1);
    else k.golonganTidakTerbaca++;

    // Dibandingkan hanya kalau KEDUANYA terbaca. Golongan yang tidak terbaca
    // sudah punya angkanya sendiri di atas, dan menghitungnya dua kali
    // membuat satu kekurangan data terlihat seperti dua masalah.
    if (b.kelompok === "PNS" && jenjang) k.bedaIdentitasDenganGolongan++;
    if (b.kelompok === "P3K" && ruang) k.bedaIdentitasDenganGolongan++;

    const instansi = kelompokInstansi(b.satuanKerja);
    if (instansi === "PUSAT") k.kantorPusat++;
    else if (instansi === "UPT") k.uptDaerah++;
    else k.instansiTidakDiketahui++;

    if (b.kelasJabatan === null || b.kelasJabatan === undefined) k.tanpaKelasJabatan++;

    const ptkp = hitungPtkp({
      statusKawin: b.statusKawin,
      jenisKelamin: b.jenisKelamin,
      // Tanggungan TIDAK ikut ditanyakan: yang membuat hitungPtkp
      // mengembalikan null cuma status kawin yang tidak sah, dan jumlah
      // tanggungan tidak pernah mengubah null jadi bukan-null. Menariknya
      // ke sini berarti satu kolom lagi yang harus di-select tanpa menambah
      // satu pun angka yang berbeda.
      jumlahTanggungan: null,
    });
    if (ptkp === null) k.ptkpTidakBisaDitentukan++;
  }

  k.ruangPns = RUANG_PNS.filter((r) => cacahRuang.has(r)).map((r) => ({
    kode: r,
    label: `Golongan ${r}`,
    jumlah: cacahRuang.get(r) ?? 0,
  }));

  k.jenjangPppk = SKALA_PPPK.filter((j) => cacahJenjang.has(j)).map((j) => ({
    kode: j,
    label: `Jenjang ${j}`,
    jumlah: cacahJenjang.get(j) ?? 0,
  }));

  return k;
}

/** Persen bulat, 0 kalau pembaginya nol - dipakai lebar batang & label. */
export function persenKomposisi(bagian: number, total: number): number {
  return total > 0 ? Math.round((bagian / total) * 100) : 0;
}

/** Pecahan 0..1 - dipakai sudut donat & tinggi batang, TANPA dibulatkan. */
export function pecahanKomposisi(bagian: number, total: number): number {
  return total > 0 ? bagian / total : 0;
}

/** Satu potongan pie, belum berwarna - warnanya urusan penampil. */
export interface PotonganPie {
  /** Kunci tetap per entitas - penampil memilih warna dari sini. */
  kode: string;
  label: string;
  jumlah: number;
  keterangan?: string;
}

/**
 * Potongan pie golongan: ruang PNS I-IV satu per satu, seluruh jenjang PPPK
 * DIGABUNG jadi satu potongan, lalu "tidak terbaca" kalau ada.
 *
 * KENAPA JENJANG PPPK DIGABUNG. Datanya memuat sampai sepuluh nilai golongan
 * dengan sebaran sangat timpang - Gol III 3.097 orang, Gol I satu orang. Pie
 * berisi sepuluh potong tidak bisa dibaca, dan warna kategori yang saling
 * bisa dibedakan habis jauh sebelum potongan kesepuluh. Rinciannya TIDAK
 * hilang: ia ditulis di `keterangan` potongan PPPK, jadi tampil di legenda.
 *
 * Potongannya SALING LEPAS dan berjumlah `total` - satu pegawai jatuh di
 * tepat satu potongan, sama seperti di hitungKomposisiPegawai.
 */
export function potonganGolonganPie(k: KomposisiPegawai): PotonganPie[] {
  const fmt = (n: number) => new Intl.NumberFormat("id-ID").format(n);

  const hasil: PotonganPie[] = k.ruangPns.map((p) => ({
    kode: `pns-${p.kode}`,
    label: `Gol ${p.kode} PNS`,
    jumlah: p.jumlah,
  }));

  const totalPppk = k.jenjangPppk.reduce((a, p) => a + p.jumlah, 0);
  if (totalPppk > 0) {
    hasil.push({
      kode: "pppk",
      label: "Jenjang PPPK",
      jumlah: totalPppk,
      keterangan: k.jenjangPppk.map((p) => `${p.kode}: ${fmt(p.jumlah)}`).join(" · "),
    });
  }

  if (k.golonganTidakTerbaca > 0) {
    hasil.push({ kode: "tidak-terbaca", label: "Tidak terbaca", jumlah: k.golonganTidakTerbaca });
  }

  return hasil;
}
