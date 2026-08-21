// ============================================================================
// PARSER PDF "LAPORAN DETAIL PRESENSI HARIAN" (export e-Presensi)
//
// PURE. Masukannya item teks + KOORDINAT hasil ekstraksi PDF (src/lib/pdfTeks.ts
// yang membungkus pdfjs); turunan ke rekap bulanan di presensiPdfKeRekap.ts.
//
// KENAPA BUTUH KOORDINAT, tidak cukup teks polos: sel KOSONG tidak
// menghasilkan teks apa pun. Contoh nyata di file uji - pegawai presensi masuk
// 06:05 tapi TIDAK presensi pulang, jadi kolom "Jam Keluar" kosong. Kalau
// baris dibaca sebagai deretan teks, "06:05" bergeser jadi jam keluar dan
// pelanggaran Pasal 13 ayat (2) hilang tanpa jejak.
//
// BATAS KOLOM DIBACA ULANG TIAP HALAMAN, tidak di-hardcode - header yang sama
// muncul di x berbeda antar file.
//
// Bentuk file: halaman pertama tiap pegawai memuat blok "Informasi Pegawai" +
// "Summary Presensi"; halaman berikutnya hanya lanjutan tabel. Satu file bisa
// memuat banyak pegawai (hasil merge) - pegawai baru ditandai munculnya lagi
// blok "Informasi Pegawai". Kolom tabel: No. | Hari, Tanggal | Jam Masuk |
// Jam Keluar | Lokasi Keluar | Status | Potongan | Aktivitas
//
// KOLOM "POTONGAN" TIDAK DIPAKAI MENGHITUNG UANG - skemanya tidak sesuai
// Permenaker 15/2024. Teksnya tetap dibawa karena memuat FAKTA yang tidak ada
// di kolom lain (penanda "lupa presensi"); persentase/rupiahnya tidak pernah
// dibaca sebagai angka.
// ============================================================================

/** Satu potongan teks hasil ekstraksi PDF, lengkap dengan posisinya. */
export interface ItemTeksPdf {
  teks: string;
  /** Titik kiri teks (PDF point, origin kiri-bawah). */
  x: number;
  /** Garis dasar teks (PDF point, makin besar makin ke ATAS halaman). */
  y: number;
  lebar: number;
}

export interface HalamanPdf {
  nomor: number;
  items: ItemTeksPdf[];
}

export interface BarisPresensiPdf {
  /** Nomor urut di kolom "No." - dipakai buat mendeteksi baris yang terlewat. */
  nomor: number | null;
  halaman: number;
  /** Apa adanya dari kolom "Hari, Tanggal", mis. "Senin, 22-06-2026". */
  tanggalTeks: string;
  /** Nama hari dari file (bukan hasil hitung sendiri), mis. "Senin". */
  namaHari: string | null;
  tanggal: number | null;
  bulan: number | null;
  tahun: number | null;
  /** Menit sejak 00:00. null = sel kosong ATAU 00:00 (penanda tidak presensi). */
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
  jamMasukTeks: string | null;
  jamKeluarTeks: string | null;
  lokasiKeluar: string | null;
  /** Apa adanya, mis. "WFO", "Dinas Keluar", "Cuti - Cuti Tahunan". */
  statusTeks: string;
  /** Apa adanya. TIDAK pernah dipakai sebagai nominal - lihat catatan di atas. */
  potonganTeks: string;
  aktivitas: string | null;
  /**
   * Menit kerja hari itu menurut SUMBERNYA (kolom `presensi.menit_kerja` di
   * database e-Presensi). null = sumbernya tidak punya angka ini.
   *
   * SELALU null untuk jalur PDF - kolom ini tidak ada di "Laporan Detail
   * Presensi Harian". Yang mengisinya cuma tarikan langsung dari database.
   *
   * Dipakai sebagai penanda Pasal 13 ayat (2): e-Presensi menolkan kolom ini
   * ketika tap pulang tidak ada (jam keluar terisi 23:59), dan itu FAKTA
   * "tidak melakukan presensi kepulangan" yang tidak bisa disimpulkan dari
   * jamnya saja. Lihat pemakaiannya di presensiPdfKeRekap.ts.
   */
  menitKerja?: number | null;
}

export interface RingkasanSumberPdf {
  tidakHadir: number | null;
  izin: number | null;
  tugasBelajar: number | null;
  lembur: number | null;
  tidakPresensi: number | null;
  cuti: number | null;
  upacaraBendera: number | null;
  dinasKeluar: number | null;
  wfo: number | null;
  diklat: number | null;
  wfh: number | null;
  wfa: number | null;
  kewajibanJamKerja: number | null;
  kekuranganJamKerja: number | null;
}

export interface LaporanPresensiPdf {
  nip: string | null;
  nama: string | null;
  jabatan: string | null;
  periodeBulan: number | null;
  periodeTahun: number | null;
  ringkasanSumber: RingkasanSumberPdf;
  baris: BarisPresensiPdf[];
  /** Halaman pertama laporan ini (buat pesan error yang bisa ditelusuri). */
  halamanMulai: number;
  /** Masalah struktur yang ketemu waktu parsing - ditampilkan ke user. */
  peringatan: string[];
}

export interface HasilParsePdfPresensi {
  error?: string;
  laporan: LaporanPresensiPdf[];
}

// --- Konstanta geometri -----------------------------------------------------
// Semua dalam PDF point. Angkanya diturunkan dari file asli: tinggi baris
// teks ~10pt, jarak antar baris tabel ~27pt.

/** Dua item dianggap satu baris teks kalau selisih y-nya di bawah ini. */
const TOLERANSI_BARIS = 2.5;
/** Jarak vertikal minimal yang memisahkan dua BARIS TABEL (bukan antar teks). */
const JARAK_ANTAR_BARIS_TABEL = 16;
/** Batas pencarian sambungan label/nilai yang jatuh ke baris sebelah. */
const TOLERANSI_SAMBUNGAN = 7;
/** Sambungan hanya diakui kalau posisinya benar-benar menempel ke titik dua. */
const JARAK_MAKS_SAMBUNGAN = 90;

const JUDUL_KOLOM = [
  "No.",
  "Hari, Tanggal",
  "Jam Masuk",
  "Jam Keluar",
  "Lokasi Keluar",
  "Status",
  "Potongan",
  "Aktivitas",
] as const;

type JudulKolom = (typeof JUDUL_KOLOM)[number];

const NAMA_BULAN_ID = [
  "januari",
  "februari",
  "maret",
  "april",
  "mei",
  "juni",
  "juli",
  "agustus",
  "september",
  "oktober",
  "november",
  "desember",
];

function rapikan(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function normalKunci(s: string): string {
  return rapikan(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Kelompokkan item jadi baris teks berdasarkan y, urut atas -> bawah. */
function kelompokkanBaris(items: ItemTeksPdf[]): ItemTeksPdf[][] {
  const urut = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const baris: ItemTeksPdf[][] = [];
  for (const item of urut) {
    const terakhir = baris[baris.length - 1];
    if (terakhir && Math.abs(terakhir[0].y - item.y) <= TOLERANSI_BARIS) {
      terakhir.push(item);
    } else {
      baris.push([item]);
    }
  }
  for (const b of baris) b.sort((a, c) => a.x - c.x);
  return baris;
}

// --- Blok "label : nilai" di kepala laporan ---------------------------------

/**
 * Baca pasangan "label : nilai" dari area kepala laporan.
 *
 * Titik dua dipakai sebagai pemisah, TAPI tidak bisa sekadar memotong string
 * per baris karena tiga hal:
 * (1) satu baris y bisa memuat DUA pasangan sekaligus (blok kiri "Tunjangan
 *     Kotor : Rp..." dan blok kanan "Kewajiban Jam Kerja : 150" sejajar),
 * (2) label maupun nilai bisa TURUN ke baris berikutnya - "Kekurangan Jam
 *     Kerja" labelnya dua baris, "Jabatan" nilainya dua baris, dan
 * (3) jarak label ke titik dua BESAR (label rata kiri, titik dua rata kolom),
 *     jadi pengelompokan berdasarkan kerapatan horizontal tidak bisa dipakai.
 *
 * Jadi: potong per baris di tiap item yang memuat ":", lalu sisi yang kosong
 * dicari sambungannya ke baris tetangga yang menempel.
 */
function bacaLabelNilai(items: ItemTeksPdf[]): Map<string, string> {
  const baris = kelompokkanBaris(items);
  const hasil = new Map<string, string>();

  const punyaTitikDua = (b: ItemTeksPdf[]) => b.some((i) => i.teks.includes(":"));
  const gabungTeks = (b: ItemTeksPdf[]) => rapikan(b.map((i) => i.teks).join(" "));

  baris.forEach((isiBaris, idxBaris) => {
    const idxTitikDua = isiBaris
      .map((item, idx) => (item.teks.includes(":") ? idx : -1))
      .filter((idx) => idx >= 0);

    for (let n = 0; n < idxTitikDua.length; n++) {
      const idx = idxTitikDua[n];
      const item = isiBaris[idx];
      const awal = n === 0 ? 0 : idxTitikDua[n - 1] + 1;
      const akhir = n === idxTitikDua.length - 1 ? isiBaris.length : idxTitikDua[n + 1];
      const posisi = item.teks.indexOf(":");

      let label = rapikan([gabungTeks(isiBaris.slice(awal, idx)), item.teks.slice(0, posisi)].join(" "));
      let nilai = rapikan([item.teks.slice(posisi + 1), gabungTeks(isiBaris.slice(idx + 1, akhir))].join(" "));

      const xTitikDua = item.x;

      // Sambungan hanya dicari dari baris tetangga LANGSUNG yang menempel
      // secara vertikal dan tidak punya pasangan label:nilai-nya sendiri.
      const tetangga = [baris[idxBaris - 1], baris[idxBaris + 1]].filter(
        (kandidat): kandidat is ItemTeksPdf[] =>
          Boolean(kandidat) &&
          Math.abs(kandidat![0].y - isiBaris[0].y) <= TOLERANSI_SAMBUNGAN &&
          !punyaTitikDua(kandidat!)
      );

      // Label yang turun baris ("Kekurangan Jam" / "Kerja"): seluruh isinya
      // berada di kiri titik dua dan berhenti tepat sebelum kolomnya.
      if (label === "") {
        const potongan = tetangga
          .filter((kandidat) => {
            const kanan = kandidat[kandidat.length - 1];
            return (
              kanan.x + kanan.lebar <= xTitikDua &&
              xTitikDua - (kanan.x + kanan.lebar) <= JARAK_MAKS_SAMBUNGAN
            );
          })
          .sort((a, c) => c[0].y - a[0].y);
        label = rapikan(potongan.map(gabungTeks).join(" "));
      }

      // Nilai yang turun baris ("Analis Pengelolaan Keuangan APBN" / "Ahli
      // Pertama"): seluruh isinya di kanan titik dua, sejajar kolom nilai.
      if (nilai === "") {
        const potongan = tetangga
          .filter(
            (kandidat) =>
              kandidat[0].x >= xTitikDua && kandidat[0].x - xTitikDua <= JARAK_MAKS_SAMBUNGAN
          )
          .sort((a, c) => c[0].y - a[0].y);
        nilai = rapikan(potongan.map(gabungTeks).join(" "));
      }

      if (label === "") continue;
      const kunci = normalKunci(label);
      // Kemunculan PERTAMA yang menang - kepala laporan dibaca dari atas ke
      // bawah, jadi label yang lebih dekat ke atas adalah yang asli.
      if (!hasil.has(kunci)) hasil.set(kunci, nilai);
    }
  });

  return hasil;
}

function angkaDari(nilai: string | undefined): number | null {
  if (nilai === undefined) return null;
  const bersih = nilai.replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  if (bersih === "" || bersih === "-") return null;
  const n = Number(bersih);
  return Number.isFinite(n) ? n : null;
}

// --- Tabel detail -----------------------------------------------------------

interface KolomTabel {
  judul: JudulKolom;
  tengah: number;
}

/** Cari header tabel di satu halaman. null kalau halaman itu tidak punya tabel. */
function cariHeaderTabel(items: ItemTeksPdf[]): { y: number; kolom: KolomTabel[] } | null {
  const penanda = items.find((i) => normalKunci(i.teks) === "hari tanggal");
  if (!penanda) return null;

  const sebaris = items.filter((i) => Math.abs(i.y - penanda.y) <= TOLERANSI_BARIS);
  const kolom: KolomTabel[] = [];
  for (const judul of JUDUL_KOLOM) {
    const cocok = sebaris.find((i) => normalKunci(i.teks) === normalKunci(judul));
    if (cocok) kolom.push({ judul, tengah: cocok.x + cocok.lebar / 2 });
  }
  // Minimal tanggal + status; tanpa keduanya barisnya tidak ada artinya.
  const punya = (j: JudulKolom) => kolom.some((k) => k.judul === j);
  if (!punya("Hari, Tanggal") || !punya("Status")) return null;

  kolom.sort((a, b) => a.tengah - b.tengah);
  return { y: penanda.y, kolom };
}

/** Tentukan kolom sebuah item dari titik tengahnya. */
function kolomUntuk(item: ItemTeksPdf, kolom: KolomTabel[]): JudulKolom {
  const tengah = item.x + item.lebar / 2;
  let terdekat = kolom[0];
  let jarak = Math.abs(tengah - kolom[0].tengah);
  for (const k of kolom) {
    const d = Math.abs(tengah - k.tengah);
    if (d < jarak) {
      jarak = d;
      terdekat = k;
    }
  }
  return terdekat.judul;
}

const RE_TANGGAL = /(\d{1,2})\s*-\s*(\d{1,2})\s*-\s*(\d{4})/;
const RE_JAM = /^(\d{1,2}):(\d{2})$/;

function parseJam(teks: string | null): { menit: number | null; teks: string | null } {
  if (!teks) return { menit: null, teks: null };
  const bersih = rapikan(teks);
  const m = RE_JAM.exec(bersih);
  if (!m) return { menit: null, teks: bersih === "" ? null : bersih };
  const jam = Number(m[1]);
  const menit = Number(m[2]);
  if (jam > 23 || menit > 59) return { menit: null, teks: bersih };
  const total = jam * 60 + menit;
  // 00:00 adalah penanda "tidak ada presensi" di export ini (dipakai di baris
  // Cuti / Tidak Hadir), BUKAN presensi tengah malam. Dibedakan dari sel
  // kosong lewat jamMasukTeks yang tetap diisi.
  return { menit: total === 0 ? null : total, teks: bersih };
}

/** Pecah item-item di bawah header jadi baris tabel, berdasarkan jarak vertikal. */
function pecahBarisTabel(itemsData: ItemTeksPdf[], kolomNo: KolomTabel | undefined): ItemTeksPdf[][] {
  const barisTeks = kelompokkanBaris(itemsData);
  const kelompok: ItemTeksPdf[][] = [];
  let sedang: ItemTeksPdf[] = [];
  let yTerakhir: number | null = null;

  for (const bt of barisTeks) {
    const y = bt[0].y;
    if (yTerakhir !== null && yTerakhir - y >= JARAK_ANTAR_BARIS_TABEL && sedang.length > 0) {
      kelompok.push(sedang);
      sedang = [];
    }
    sedang.push(...bt);
    yTerakhir = y;
  }
  if (sedang.length > 0) kelompok.push(sedang);

  if (!kolomNo) return kelompok;

  // Pengaman: satu kelompok harus memuat TEPAT satu nomor urut. Kalau ada dua
  // (baris terlalu rapat sampai jaraknya di bawah ambang), pecah lagi di
  // tengah-tengah antar nomor - jangan sampai dua hari tergabung jadi satu.
  const hasil: ItemTeksPdf[][] = [];
  for (const k of kelompok) {
    const nomor = k
      .filter((i) => Math.abs(i.x + i.lebar / 2 - kolomNo.tengah) < 20 && /^\d{1,3}$/.test(rapikan(i.teks)))
      .sort((a, b) => b.y - a.y);
    if (nomor.length <= 1) {
      hasil.push(k);
      continue;
    }
    const batas: number[] = [];
    for (let i = 0; i < nomor.length - 1; i++) batas.push((nomor[i].y + nomor[i + 1].y) / 2);
    const pecahan: ItemTeksPdf[][] = Array.from({ length: nomor.length }, () => []);
    for (const item of k) {
      let idx = 0;
      while (idx < batas.length && item.y < batas[idx]) idx++;
      pecahan[idx].push(item);
    }
    for (const p of pecahan) if (p.length > 0) hasil.push(p);
  }
  return hasil;
}

function bacaBarisTabel(
  halaman: HalamanPdf,
  header: { y: number; kolom: KolomTabel[] }
): BarisPresensiPdf[] {
  const itemsData = halaman.items.filter(
    (i) => i.y < header.y - TOLERANSI_BARIS && rapikan(i.teks) !== ""
  );
  const kolomNo = header.kolom.find((k) => k.judul === "No.");
  const kelompok = pecahBarisTabel(itemsData, kolomNo);

  const hasil: BarisPresensiPdf[] = [];
  for (const kel of kelompok) {
    const perKolom = new Map<JudulKolom, ItemTeksPdf[]>();
    for (const item of kel) {
      const judul = kolomUntuk(item, header.kolom);
      if (!perKolom.has(judul)) perKolom.set(judul, []);
      perKolom.get(judul)!.push(item);
    }
    const teksKolom = (judul: JudulKolom): string | null => {
      const isi = perKolom.get(judul);
      if (!isi) return null;
      const gabung = rapikan(
        [...isi].sort((a, b) => b.y - a.y || a.x - b.x).map((i) => i.teks).join(" ")
      );
      return gabung === "" ? null : gabung;
    };

    const tanggalTeks = teksKolom("Hari, Tanggal");
    const statusTeks = teksKolom("Status");
    // Baris tanpa tanggal DAN tanpa status bukan baris data (bisa sisa footer).
    if (!tanggalTeks && !statusTeks) continue;

    const nomorTeks = teksKolom("No.");
    const nomor = nomorTeks && /^\d{1,3}$/.test(nomorTeks) ? Number(nomorTeks) : null;

    let namaHari: string | null = null;
    let tanggal: number | null = null;
    let bulan: number | null = null;
    let tahun: number | null = null;
    if (tanggalTeks) {
      const m = RE_TANGGAL.exec(tanggalTeks.replace(/\s+/g, ""));
      if (m) {
        tanggal = Number(m[1]);
        bulan = Number(m[2]);
        tahun = Number(m[3]);
      }
      const hari = /^([A-Za-z]+)\s*,/.exec(tanggalTeks);
      if (hari) namaHari = hari[1];
    }

    const masuk = parseJam(teksKolom("Jam Masuk"));
    const keluar = parseJam(teksKolom("Jam Keluar"));

    hasil.push({
      nomor,
      halaman: halaman.nomor,
      tanggalTeks: tanggalTeks ?? "",
      namaHari,
      tanggal,
      bulan,
      tahun,
      jamMasukMenit: masuk.menit,
      jamKeluarMenit: keluar.menit,
      jamMasukTeks: masuk.teks,
      jamKeluarTeks: keluar.teks,
      lokasiKeluar: teksKolom("Lokasi Keluar"),
      statusTeks: statusTeks ?? "",
      potonganTeks: teksKolom("Potongan") ?? "",
      aktivitas: teksKolom("Aktivitas"),
    });
  }

  // Urutkan menurun sesuai tampilan (tanggal terbaru di atas) - tetap
  // dipertahankan apa adanya; yang penting stabil per halaman.
  return hasil;
}

// --- Kepala laporan ---------------------------------------------------------

function bacaPeriode(items: ItemTeksPdf[]): { bulan: number | null; tahun: number | null } {
  // Judul periode ada tepat di bawah "LAPORAN DETAIL PRESENSI HARIAN".
  for (const baris of kelompokkanBaris(items).slice(0, 6)) {
    const teks = normalKunci(baris.map((i) => i.teks).join(" "));
    const m = /\b([a-z]+)\s+(\d{4})\b/.exec(teks);
    if (!m) continue;
    const idx = NAMA_BULAN_ID.indexOf(m[1]);
    if (idx >= 0) return { bulan: idx + 1, tahun: Number(m[2]) };
  }
  return { bulan: null, tahun: null };
}

const PETA_RINGKASAN: { field: keyof RingkasanSumberPdf; kunci: string }[] = [
  { field: "tidakHadir", kunci: "tidak hadir" },
  { field: "izin", kunci: "izin" },
  { field: "tugasBelajar", kunci: "tugas belajar" },
  { field: "lembur", kunci: "lembur" },
  { field: "tidakPresensi", kunci: "tidak presensi" },
  { field: "cuti", kunci: "cuti" },
  { field: "upacaraBendera", kunci: "upacara bendera" },
  { field: "dinasKeluar", kunci: "dinas keluar" },
  { field: "wfo", kunci: "wfo" },
  { field: "diklat", kunci: "diklat" },
  { field: "wfh", kunci: "wfh" },
  { field: "wfa", kunci: "wfa" },
  { field: "kewajibanJamKerja", kunci: "kewajiban jam kerja" },
  { field: "kekuranganJamKerja", kunci: "kekurangan jam kerja" },
];

function bacaKepala(halaman: HalamanPdf, batasY: number | null): {
  nip: string | null;
  nama: string | null;
  jabatan: string | null;
  ringkasan: RingkasanSumberPdf;
} {
  const items = batasY === null ? halaman.items : halaman.items.filter((i) => i.y > batasY);
  const peta = bacaLabelNilai(items);

  const ringkasan = {} as RingkasanSumberPdf;
  for (const { field, kunci } of PETA_RINGKASAN) {
    ringkasan[field] = angkaDari(peta.get(kunci) ?? undefined);
  }

  const nipMentah = peta.get("nip") ?? null;
  return {
    nip: nipMentah ? nipMentah.replace(/\s+/g, "") : null,
    nama: peta.get("nama pegawai") ?? null,
    jabatan: peta.get("jabatan") ?? null,
    ringkasan,
  };
}

function halamanKepala(items: ItemTeksPdf[]): boolean {
  return items.some((i) => normalKunci(i.teks) === "informasi pegawai");
}

// --- Entry point ------------------------------------------------------------

/**
 * Parse satu file PDF (bisa memuat banyak pegawai) jadi daftar laporan.
 *
 * Halaman yang memuat "Informasi Pegawai" memulai laporan baru; halaman
 * sesudahnya dianggap lanjutan tabel pegawai yang sama.
 */
export function parsePdfPresensi(halaman: HalamanPdf[]): HasilParsePdfPresensi {
  const laporan: LaporanPresensiPdf[] = [];
  let sedang: LaporanPresensiPdf | null = null;

  for (const h of halaman) {
    const items = h.items.filter((i) => rapikan(i.teks) !== "");
    if (items.length === 0) continue;

    const header = cariHeaderTabel(items);
    const mulaiBaru = halamanKepala(items);

    if (mulaiBaru) {
      const periode = bacaPeriode(items);
      const kepala = bacaKepala({ nomor: h.nomor, items }, header ? header.y : null);
      sedang = {
        nip: kepala.nip,
        nama: kepala.nama,
        jabatan: kepala.jabatan,
        periodeBulan: periode.bulan,
        periodeTahun: periode.tahun,
        ringkasanSumber: kepala.ringkasan,
        baris: [],
        halamanMulai: h.nomor,
        peringatan: [],
      };
      laporan.push(sedang);
    }

    if (!header) continue;
    if (!sedang) {
      // Tabel muncul sebelum ada blok "Informasi Pegawai" - file terpotong
      // atau bukan format yang diharapkan. Jangan diam-diam dibuang.
      return {
        laporan,
        error: `Halaman ${h.nomor} memuat tabel presensi tapi belum ada blok "Informasi Pegawai" - file kemungkinan terpotong atau bukan hasil export "Laporan Detail Presensi Harian".`,
      };
    }
    sedang.baris.push(...bacaBarisTabel({ nomor: h.nomor, items }, header));
  }

  if (laporan.length === 0) {
    return {
      laporan: [],
      error:
        'Tidak ada blok "Informasi Pegawai" yang ditemukan - pastikan file ini hasil export "Laporan Detail Presensi Harian" dari e-Presensi (PDF berbasis teks, bukan hasil scan).',
    };
  }

  for (const l of laporan) {
    if (!l.nip) l.peringatan.push("NIP tidak terbaca di kepala laporan.");
    if (l.periodeBulan === null || l.periodeTahun === null) {
      l.peringatan.push("Periode (bulan & tahun) tidak terbaca di judul laporan.");
    }
    if (l.baris.length === 0) l.peringatan.push("Tidak ada satu pun baris presensi harian yang terbaca.");

    // Nomor urut harus rapat 1..n. Kalau ada yang bolong, ada baris yang gagal
    // dibaca - lebih baik diberitahu daripada diam-diam kurang satu hari.
    const nomor = l.baris.map((b) => b.nomor).filter((n): n is number => n !== null);
    if (nomor.length > 0) {
      const maks = Math.max(...nomor);
      const hilang: number[] = [];
      for (let i = 1; i <= maks; i++) if (!nomor.includes(i)) hilang.push(i);
      if (hilang.length > 0) {
        l.peringatan.push(`Nomor baris ${hilang.join(", ")} tidak terbaca dari ${maks} baris di file.`);
      }
    }
    for (const b of l.baris) {
      if (b.tanggal === null) {
        l.peringatan.push(`Baris ${b.nomor ?? "?"} (halaman ${b.halaman}): tanggal tidak terbaca ("${b.tanggalTeks}").`);
      }
    }
  }

  return { laporan };
}
