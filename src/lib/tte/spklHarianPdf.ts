// PDF SPKL HARIAN: satu dokumen per (satker, tanggal) yang memuat semua
// perintah lembur TERKIRIM hari itu dari semua pemberi perintah. Mengikuti
// template "SPKL_Bulan Oktober 2026" (docs/lembur): halaman 1 portrait (kertas Legal) berisi
// judul + nomor, Menimbang, Dasar, MEMERINTAHKAN, Kepada, Untuk, Pembiayaan,
// "Ditetapkan di Jakarta"; lalu lampiran portrait berkolom NO, NAMA/NIP, GOL,
// TANGGAL, KETERANGAN (tanpa jam) dengan blok tanda tangan di akhirnya.
//
// Sementara TANPA TTE (src/lib/lembur/sakelarTteLembur.ts): opsi `tanpaTte`
// mematikan footer BSrE, penanda koordinat QR, dan SIGN_Y, lalu memakai blok
// tanda tangan Kepala Biro (nama dari `kepalaBiro`, garis titik-titik bila
// kosong), tanpa catatan tambahan (keputusan user 2026-11-20). Tanpa `tanpaTte` dokumen berperilaku
// seperti SPKL ber-TTE (footer BSrE + penanda '#').
//
// Dokumen yang dibuka sebelum 15.00 WIB TIDAK diberi cap apa pun (keputusan
// user 2026-11-23); status Sementara/Selesai cukup ditampilkan di halaman.

import { siapkanKertasBerkop } from "./sptjmPdf";
import { anggaranUntukTahun } from "../lembur/anggaranLembur";
import {
  DASAR_LEMBUR,
  bungkusTeks,
  gambarBaris,
  gambarBlokTtd,
  gambarFooterBsreSemuaHalaman,
  gambarParagraf,
  gambarTabel,
  hariTanggalId,
  tulis,
  tulisTengah,
  type KolomTabel,
  type KonteksTulis,
  type TataLetakBaris,
} from "./pdfLemburBersama";
import type { PenandatanganDokumen } from "./suratTugasLemburPdf";

/** Satu baris lampiran: satu pegawai pada hari itu (uraian dari semua perintahnya digabung). */
export interface BarisSpklHarian {
  nip: string;
  nama: string;
  golongan: string;
  /** Jam yang diperintahkan; tidak dicetak di lampiran. */
  jam: number;
  uraian: string[];
}

export interface DataSpklHarian {
  nomorDokumen: string;
  /** Tanggal lembur ISO YYYY-MM-DD. */
  tanggalIso: string;
  satuanKerja: string;
  /** Nama pendek untuk kalimat (mis. "Biro Keuangan dan BMN"); bawaan = satuanKerja. */
  namaSingkat?: string;
  /** Jabatan di blok tanda tangan tanpa TTE; bawaan JABATAN_TTD_TANPA_TTE. */
  jabatanPenandatangan?: string;
  baris: readonly BarisSpklHarian[];
  /** Wajib bila `tanpaTte` tidak diset (jalur TTE). */
  penandatangan?: PenandatanganDokumen;
  /** Kepala Biro untuk jalur tanpa TTE; null/kosong = garis titik-titik. */
  kepalaBiro?: { nama: string; nip: string } | null;
  /** Dokumen dibentuk otomatis tanpa tanda tangan elektronik. */
  tanpaTte?: boolean;
  previewTte?: boolean;
}

/**
 * Jabatan bawaan di blok tanda tangan tanpa TTE.
 * TODO(confirm): template aslinya ditandatangani Kepala Biro; bentuk tanda
 * tangan basah/elektronik menunggu konfirmasi.
 */
export const JABATAN_TTD_TANPA_TTE = "Kepala Biro";



const TITIK_NAMA = "..............................................";
const NAMA_BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/** Butir 3 sesuai template SPKL harian ("Satuan Kerja Unit Pelaksanaan Teknis"); jalur TTE tetap memakai DASAR_LEMBUR. */
export const DASAR_KEPMEN_195_SPKL_HARIAN =
  "Keputusan Menteri Ketenagakerjaan Republik Indonesia Nomor 195 Tahun 2021 tentang Pengangkatan Pejabat Perbendaharaan Negara pada Satuan Kerja Pusat dan Satuan Kerja Unit Pelaksanaan Teknis Pusat Kementerian Ketenagakerjaan;";

/**
 * Butir "Dasar" mengikuti template; butir 5 (DIPA) dan 6 (POK) mengikuti tahun
 * lembur. Penanda "[belum dikonfirmasi]" bila anggaran tahun itu belum
 * terdaftar (lib/lembur/anggaranLembur.ts).
 * TODO(confirm): butir 4 (SK KPA) masih memakai teks 2026 untuk tahun lain.
 */
export function susunDasarSpklHarian(tahun: number): string[] {
  const a = anggaranUntukTahun(tahun);
  return [
    ...DASAR_LEMBUR.slice(0, 2),
    DASAR_KEPMEN_195_SPKL_HARIAN,
    DASAR_LEMBUR[3],
    `Daftar Isian Pelaksanaan Anggaran (DIPA) Sekretariat Jenderal Kementerian Ketenagakerjaan Tahun ${tahun} Nomor : SP ${a.nomorDipa} tanggal ${a.tanggalDipa};`,
    `Petunjuk Operasional Kegiatan (POK) Sekretariat Jenderal Kementerian Ketenagakerjaan Tahun Anggaran ${tahun}.`,
  ];
}

/**
 * Satu baris lampiran per pegawai: NO, NAMA/NIP, GOL, TANGGAL (angka hari),
 * KETERANGAN ("-uraian" per baris). Tanpa jam dan tanpa nama pemberi perintah.
 */
export function susunBarisLampiranSpklHarian(baris: readonly BarisSpklHarian[], tanggalIso: string): string[][] {
  const hari = String(Number(tanggalIso.slice(8, 10)) || "");
  return baris.map((b, i) => [
    String(i + 1),
    `${b.nama}\n${b.nip}`,
    b.golongan,
    hari,
    b.uraian
      .map((u) => u.trim())
      .filter(Boolean)
      .map((u) => `-${u}`)
      .join("\n"),
  ]);
}

// ---- Tata letak halaman 1 (kertas Legal, mengikuti berkas Word asli) ----
// Satuan docx: 1 twip = 1/20 pt. Semua jarak tab diukur dari margin kiri.
const LEBAR_LEGAL = 612;
const TINGGI_LEGAL = 1008;
const M_KIRI = 56.7;
const M_KANAN = 562.4;
/** Titik tengah blok tanda tangan: tengah rentang [M_KIRI + 290.6, M_KANAN]. */
export const TENGAH_TTD_SPKL_HARIAN = (M_KIRI + 290.6 + M_KANAN) / 2;
const TATA_HAL1: TataLetakBaris = {
  kiri: M_KIRI,
  xTitikDua: M_KIRI + 66,
  xNo: M_KIRI + 76,
  xIsi: M_KIRI + 99.25,
  xIsiButir: M_KIRI + 99.25,
  kanan: M_KANAN,
};
const TATA_PEMBIAYAAN: TataLetakBaris = { ...TATA_HAL1, xIsi: M_KIRI + 85, xIsiButir: M_KIRI + 85 };

/**
 * Percobaan (ukuran font, skala baris kosong), dari yang paling mirip aslinya.
 * Baris kosong dikecilkan lebih dulu, baru ukuran font.
 */
const PERCOBAAN: ReadonlyArray<readonly [number, number]> = [
  [12, 1],
  [12, 0.6],
  [12, 0.3],
  [11.5, 0.3],
  [11, 0.3],
  [10.5, 0.3],
  [10, 0.3],
  [9.5, 0.3],
  [9, 0.3],
];
const Y_NAMA_MINIMAL = 70;

// ---- Tata letak lampiran (A4 portrait, mengikuti xlsx asli) ----
const LEBAR_A4 = 595.32;
const TINGGI_A4 = 841.92;
const M_LAMPIRAN = 50.4;
const M_ATAS_LAMPIRAN = 54;
const LEBAR_TABEL = LEBAR_A4 - 2 * M_LAMPIRAN;
const PERSEN_KOLOM = { no: 0.03, nama: 0.32, gol: 0.05, tanggal: 0.1, keterangan: 0.5 };
const UKURAN_TABEL = 9;
const UKURAN_KEPALA_LAMPIRAN = 9.5;
const UKURAN_TTD_LAMPIRAN = 10;
const TATA_LAMPIRAN: TataLetakBaris = {
  kiri: M_LAMPIRAN,
  xTitikDua: M_LAMPIRAN + 44,
  xNo: M_LAMPIRAN + 52,
  xIsi: M_LAMPIRAN + 52,
  xIsiButir: M_LAMPIRAN + 52,
  kanan: LEBAR_A4 - M_LAMPIRAN,
};

async function bangun(data: DataSpklHarian, ukuran: number, skalaKosong: number) {
  const { doc, page, fontRegular, fontBold } = await siapkanKertasBerkop({ ukuran: [LEBAR_LEGAL, TINGGI_LEGAL] });
  const jarak = ukuran * 1.15;
  const kosong = (n: number) => n * jarak * skalaKosong;
  const k: KonteksTulis = { page, font: fontRegular, fontBold, ukuran, jarakBaris: jarak };
  const hariTanggal = hariTanggalId(data.tanggalIso);
  // "Rabu, 14 Oktober 2026" -> "14 Oktober 2026" untuk kalimat dan "Pada tanggal".
  const tanggalTeks = hariTanggal.includes(", ") ? hariTanggal.split(", ")[1] : hariTanggal;
  const tahun = Number(data.tanggalIso.slice(0, 4));
  const bulan = Number(data.tanggalIso.slice(5, 7));
  const anggaran = anggaranUntukTahun(tahun);
  const namaSingkat = data.namaSingkat ?? data.satuanKerja;
  const jabatanTtd = data.jabatanPenandatangan ?? JABATAN_TTD_TANPA_TTE;
  const nomorTanpaAwalan = data.nomorDokumen.replace(/^NOMOR\s+/i, "");
  const tengahIsi = (M_KIRI + M_KANAN) / 2;

  // Kop menempel di tepi atas: judul 149.54 pt di bawah tepi atas (sama dengan A4 sebelumnya).
  const yJudul = TINGGI_LEGAL - 149.54;
  tulisTengah(k, "SURAT PERINTAH KERJA LEMBUR", tengahIsi, yJudul, { ukuran: 13 });
  tulisTengah(k, `NOMOR ${nomorTanpaAwalan}`, tengahIsi, yJudul - 16.7, { ukuran: 13 });

  let y = yJudul - 16.7 - 22;
  y = gambarBaris(
    k,
    "Menimbang",
    [
      {
        teks: "Bahwa dalam rangka penelitian dan penyelesaian pekerjaannya yang mendesak maka perlu tambahan waktu yang dilaksanakan setelah jam kerja dan di hari libur (di luar jam kerja).",
      },
    ],
    y,
    true,
    TATA_HAL1,
  );
  y -= kosong(1);
  y = gambarBaris(
    k,
    "Dasar",
    susunDasarSpklHarian(tahun).map((teks, i) => ({ no: `${i + 1}.`, teks })),
    y,
    true,
    TATA_HAL1,
  );
  y -= kosong(2);
  tulisTengah(k, "MEMERINTAHKAN", tengahIsi, y);
  y -= jarak + kosong(1);
  y = gambarBaris(
    k,
    "Kepada",
    [{ teks: "Para Pejabat/Pegawai yang namanya tercantum dalam lampiran Surat Perintah Kerja ini." }],
    y,
    true,
    TATA_HAL1,
  );
  y = gambarBaris(
    k,
    "Untuk",
    [
      { no: "1.", teks: `Melaksanakan kegiatan setelah jam kerja dan di hari libur di ${namaSingkat};` },
      { no: "2.", teks: `Kegiatan dilaksanakan pada tanggal ${tanggalTeks}.` },
    ],
    y,
    true,
    TATA_HAL1,
  );
  y -= kosong(3);
  y = gambarBaris(
    k,
    "Pembiayaan",
    [
      {
        teks: `Biaya yang timbul sebagai akibat ditetapkannya Surat Perintah Kerja ini dibebankan pada Daftar Isian Pelaksanaan Anggaran (DIPA) Sekretariat Jenderal Kementerian Ketenagakerjaan Tahun ${tahun} ${anggaran.nomorDipa} tanggal ${anggaran.tanggalDipa};`,
      },
    ],
    y,
    true,
    TATA_PEMBIAYAAN,
  );
  tulis(k, `Akun : ${anggaran.akun}`, TATA_PEMBIAYAAN.xIsi, y, { tebal: true });
  y -= jarak + kosong(1);
  y = gambarParagraf(k, "Demikian Perintah Kerja ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.", M_KIRI, y, true, M_KANAN);
  y -= kosong(2);

  // Blok tanda tangan: dua baris pertama rata kiri di margin + 276.45, jabatan
  // dan nama rata tengah di TENGAH_TTD_SPKL_HARIAN, 5 baris kosong di antaranya.
  const xKiriTtd = M_KIRI + 276.45;
  const jarakTtd = 15.9 * (ukuran / 12);
  const lebarJabatan = M_KANAN - (M_KIRI + 290.6);
  let yNama: number;
  if (data.tanpaTte) {
    // Tanpa penanda '#', tanpa SIGN_Y: dokumen ini tidak pernah dikirim ke BSrE.
    let yy = y;
    tulis(k, "Ditetapkan di Jakarta", xKiriTtd, yy);
    yy -= jarakTtd;
    tulis(k, `Pada tanggal ${tanggalTeks}`, xKiriTtd, yy);
    yy -= jarakTtd;
    for (const l of bungkusTeks(fontRegular, jabatanTtd, ukuran, lebarJabatan)) {
      tulisTengah(k, l, TENGAH_TTD_SPKL_HARIAN, yy);
      yy -= jarakTtd;
    }
    // 5 baris kosong, lalu nama Kepala Biro atau garis titik-titik. Halaman 1 tanpa NIP.
    yNama = yy - 5 * jarakTtd;
    tulisTengah(k, data.kepalaBiro?.nama || TITIK_NAMA, TENGAH_TTD_SPKL_HARIAN, yNama);
  } else {
    if (!data.penandatangan) throw new Error("Penandatangan wajib untuk SPKL harian ber-TTE.");
    ({ yNama } = gambarBlokTtd(k, doc, {
      yAtas: y,
      barisAtas: ["Ditetapkan di Jakarta", `Pada tanggal ${tanggalTeks}`, `${data.penandatangan.jabatan},`],
      nama: data.penandatangan.nama,
      nip: data.penandatangan.nip,
      previewTte: data.previewTte,
      tata: { tengahX: TENGAH_TTD_SPKL_HARIAN, xKiriAtas: xKiriTtd, jarak: jarakTtd, barisKosong: 5, lebarJabatan },
    }));
  }

  // ---- Lampiran portrait A4 ----
  const lampiran = doc.addPage([LEBAR_A4, TINGGI_A4]);
  const ukL = UKURAN_KEPALA_LAMPIRAN;
  const kl: KonteksTulis = { ...k, page: lampiran, ukuran: ukL, jarakBaris: ukL * 1.3 };
  let yl = TINGGI_A4 - M_ATAS_LAMPIRAN - ukL;
  yl = gambarBaris(
    kl,
    "Lampiran",
    [
      {
        teks: `Surat Perintah Kerja Lembur Pejabat Pembuat Komitmen ${namaSingkat}, ${namaSingkat} Sekretariat Jenderal Kemnaker Tanggal ${tanggalTeks}`,
      },
    ],
    yl,
    false,
    TATA_LAMPIRAN,
  );
  yl = gambarBaris(kl, "Nomor", [{ teks: nomorTanpaAwalan }], yl, false, TATA_LAMPIRAN);
  yl = gambarBaris(kl, "Tanggal", [{ teks: tanggalTeks }], yl, false, TATA_LAMPIRAN);
  yl -= 8;
  tulisTengah(kl, "PEJABAT/PEGAWAI YANG MELAKSANAKAN PERINTAH KERJA LEMBUR", LEBAR_A4 / 2, yl, { tebal: true });
  yl -= 12;

  const lebar = (p: number) => LEBAR_TABEL * p;
  const kolom: KolomTabel[] = [
    { judul: "NO", lebar: lebar(PERSEN_KOLOM.no), rata: "tengah", tengahVertikal: true },
    { judul: "NAMA/NIP", lebar: lebar(PERSEN_KOLOM.nama), pemisahSel: true, tengahVertikal: true },
    { judul: "GOL", lebar: lebar(PERSEN_KOLOM.gol), rata: "tengah", tengahVertikal: true },
    {
      judul: `TANGGAL\n(${NAMA_BULAN_ID[Math.max(0, Math.min(11, bulan - 1))]})`,
      lebar: lebar(PERSEN_KOLOM.tanggal),
      rata: "tengah",
      tengahVertikal: true,
    },
    { judul: "KETERANGAN", lebar: lebar(PERSEN_KOLOM.keterangan), tengahVertikal: true, headerKiri: true },
  ];
  const akhir = gambarTabel(doc, fontRegular, fontBold, {
    halaman: lampiran,
    yAwal: yl,
    kiri: M_LAMPIRAN,
    kolom,
    baris: susunBarisLampiranSpklHarian(data.baris, data.tanggalIso),
    ukuran: UKURAN_TABEL,
    ukuranHalaman: [LEBAR_A4, TINGGI_A4],
    atasHalamanBaru: TINGGI_A4 - M_ATAS_LAMPIRAN,
    headerTengahVertikal: true,
    pad: 1.5,
    ukuranHeader: 7.5,
  });

  // Blok tanda tangan di akhir lampiran, rata tengah di atas kolom KETERANGAN;
  // pindah halaman bila tidak muat.
  const tengahKeterangan = M_LAMPIRAN + LEBAR_TABEL * (1 - PERSEN_KOLOM.keterangan / 2);
  const ukT = UKURAN_TTD_LAMPIRAN;
  const jarakT = ukT * 1.3;
  let halamanTtd = akhir.halaman;
  let yTtd = akhir.y - 24;
  if (yTtd < 8 * jarakT + 60) {
    halamanTtd = doc.addPage([LEBAR_A4, TINGGI_A4]);
    yTtd = TINGGI_A4 - M_ATAS_LAMPIRAN - ukT;
  }
  const kt: KonteksTulis = { ...kl, page: halamanTtd, ukuran: ukT, jarakBaris: jarakT };
  const jabatanLampiran = data.tanpaTte ? jabatanTtd : (data.penandatangan?.jabatan ?? jabatanTtd);
  // Jabatan dibungkus selebar kolom KETERANGAN supaya jabatan panjang tidak keluar tepi kanan A4.
  const barisJabatan = bungkusTeks(fontRegular, `${jabatanLampiran},`, ukT, LEBAR_TABEL * PERSEN_KOLOM.keterangan);
  barisJabatan.forEach((l, i) => tulisTengah(kt, l, tengahKeterangan, yTtd + (barisJabatan.length - 1 - i) * jarakT));
  tulisTengah(kt, "Setjen Kemnaker", tengahKeterangan, yTtd - jarakT);
  const nama = data.tanpaTte ? data.kepalaBiro?.nama : data.penandatangan?.nama;
  const nip = data.tanpaTte ? data.kepalaBiro?.nip : data.penandatangan?.nip;
  tulisTengah(kt, nama || TITIK_NAMA, tengahKeterangan, yTtd - 7 * jarakT);
  tulisTengah(kt, `NIP. ${nip || ".........................."}`, tengahKeterangan, yTtd - 8 * jarakT);

  if (!data.tanpaTte) gambarFooterBsreSemuaHalaman(doc, fontRegular, data.previewTte === true);
  return { doc, yNama };
}

export async function generateSpklHarianPdf(data: DataSpklHarian): Promise<Buffer> {
  let hasil = await bangun(data, PERCOBAAN[0][0], PERCOBAAN[0][1]);
  for (let i = 1; i < PERCOBAAN.length && hasil.yNama < Y_NAMA_MINIMAL; i++) {
    hasil = await bangun(data, PERCOBAAN[i][0], PERCOBAAN[i][1]);
  }
  if (hasil.yNama < Y_NAMA_MINIMAL) {
    // Percobaan terkecil pun tidak muat: jangan diam-diam menumpuk teks di atas footer.
    throw new Error("Halaman 1 SPKL harian tidak muat di kertas Legal (blok tanda tangan terlalu rendah).");
  }
  hasil.doc.setTitle(`SPKL Harian - ${data.tanggalIso} ${data.satuanKerja}`);
  return Buffer.from(await hasil.doc.save());
}
