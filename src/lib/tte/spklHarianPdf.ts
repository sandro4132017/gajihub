// PDF SPKL HARIAN: satu dokumen per (satker, tanggal) yang memuat semua
// perintah lembur TERKIRIM hari itu dari semua pemberi perintah. Mengikuti
// template "SPKL_Bulan Oktober 2026" (docs/lembur): halaman 1 portrait berisi
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
// Opsi `sementara`: dokumen dibuka sebelum batas 15.00 WIB sehingga isinya
// masih bisa bertambah; tiap halaman diberi cap.
//
// Disusun dari input murni; pemuat data ada di lib/lembur/rekapSpklHarian.ts.

import { siapkanKertasBerkop } from "./sptjmPdf";
import { anggaranUntukTahun } from "../lembur/anggaranLembur";
import {
  DASAR_LEMBUR,
  MARGIN_KIRI,
  TENGAH_TTD_X,
  gambarBaris,
  gambarBlokTtd,
  gambarCapSemuaHalaman,
  gambarFooterBsreSemuaHalaman,
  gambarParagraf,
  gambarTabel,
  hariTanggalId,
  tulis,
  tulisTengah,
  type KolomTabel,
  type KonteksTulis,
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
  /** Isi masih bisa bertambah (sebelum 15.00 WIB): cap di tiap halaman. */
  sementara?: boolean;
  previewTte?: boolean;
}

/**
 * Jabatan bawaan di blok tanda tangan tanpa TTE.
 * TODO(confirm): template aslinya ditandatangani Kepala Biro; bentuk tanda
 * tangan basah/elektronik menunggu konfirmasi.
 */
export const JABATAN_TTD_TANPA_TTE = "Kepala Biro";


/** Cap di kepala tiap halaman dokumen sementara. */
export const CAP_SEMENTARA = "SEMENTARA - masih bisa bertambah sampai 15.00 WIB";

/** Akhiran nama berkas dokumen sementara. */
export const AKHIRAN_NAMA_SEMENTARA = "-SEMENTARA";

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

const UKURAN_COBA = [11, 10.5, 10, 9.5, 9, 8.5];
const Y_NAMA_MINIMAL = 95;
const LEBAR_A4 = 595.32;
const TINGGI_A4 = 841.92;

async function bangun(data: DataSpklHarian, ukuran: number) {
  const { doc, page, fontRegular, fontBold } = await siapkanKertasBerkop();
  const k: KonteksTulis = { page, font: fontRegular, fontBold, ukuran, jarakBaris: ukuran * 1.4 };
  const hariTanggal = hariTanggalId(data.tanggalIso);
  // "Rabu, 14 Oktober 2026" -> "14 Oktober 2026" untuk kalimat dan "Pada tanggal".
  const tanggalTeks = hariTanggal.includes(", ") ? hariTanggal.split(", ")[1] : hariTanggal;
  const tahun = Number(data.tanggalIso.slice(0, 4));
  const bulan = Number(data.tanggalIso.slice(5, 7));
  const anggaran = anggaranUntukTahun(tahun);
  const namaSingkat = data.namaSingkat ?? data.satuanKerja;
  const jabatanTtd = data.jabatanPenandatangan ?? JABATAN_TTD_TANPA_TTE;
  const nomorTanpaAwalan = data.nomorDokumen.replace(/^NOMOR\s+/i, "");

  tulisTengah(k, "SURAT PERINTAH KERJA LEMBUR", 297.66, 692.38, { ukuran: 14.04 });
  tulisTengah(k, `NOMOR ${nomorTanpaAwalan}`, 297.66, 675.7);

  let y = 650;
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
  );
  y -= k.jarakBaris * 0.3;
  y = gambarBaris(
    k,
    "Dasar",
    susunDasarSpklHarian(tahun).map((teks, i) => ({ no: `${i + 1}.`, teks })),
    y,
    true,
  );
  y -= k.jarakBaris * 0.3;
  tulisTengah(k, "MEMERINTAHKAN", 297.66, y);
  y -= k.jarakBaris * 1.4;
  y = gambarBaris(
    k,
    "Kepada",
    [{ teks: "Para Pejabat/Pegawai yang namanya tercantum dalam lampiran Surat Perintah Kerja ini." }],
    y,
    true,
  );
  y -= k.jarakBaris * 0.3;
  y = gambarBaris(
    k,
    "Untuk",
    [
      { no: "1.", teks: `Melaksanakan kegiatan setelah jam kerja dan di hari libur di ${namaSingkat};` },
      { no: "2.", teks: `Kegiatan dilaksanakan pada tanggal ${tanggalTeks}.` },
    ],
    y,
    true,
  );
  y -= k.jarakBaris * 0.3;
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
  );
  tulis(k, `Akun : ${anggaran.akun}`, 138, y, { tebal: true });
  y -= k.jarakBaris * 1.3;
  y = gambarParagraf(k, "Demikian Perintah Kerja ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.", MARGIN_KIRI, y);

  y -= k.jarakBaris * 0.8;
  let yNama: number;
  if (data.tanpaTte) {
    // Tanpa penanda '#', tanpa SIGN_Y: dokumen ini tidak pernah dikirim ke BSrE.
    let yy = y;
    for (const teks of ["Ditetapkan di Jakarta", `Pada tanggal ${tanggalTeks}`, jabatanTtd]) {
      tulisTengah(k, teks, TENGAH_TTD_X, yy);
      yy -= 13.82;
    }
    // Ruang tanda tangan, lalu nama Kepala Biro atau garis titik-titik. Halaman 1 tanpa NIP.
    yNama = yy + 13.82 - 70;
    tulisTengah(k, data.kepalaBiro?.nama || TITIK_NAMA, TENGAH_TTD_X, yNama);
  } else {
    if (!data.penandatangan) throw new Error("Penandatangan wajib untuk SPKL harian ber-TTE.");
    ({ yNama } = gambarBlokTtd(k, doc, {
      yAtas: y,
      barisAtas: ["Ditetapkan di Jakarta", `Pada tanggal ${tanggalTeks}`, `${data.penandatangan.jabatan},`],
      nama: data.penandatangan.nama,
      nip: data.penandatangan.nip,
      previewTte: data.previewTte,
    }));
  }

  // ---- Lampiran portrait ----
  const lampiran = doc.addPage([LEBAR_A4, TINGGI_A4]);
  const kl: KonteksTulis = { ...k, page: lampiran, ukuran: 10, jarakBaris: 14 };
  let yl = 790;
  yl = gambarBaris(
    kl,
    "Lampiran",
    [
      {
        teks: `Surat Perintah Kerja Lembur Pejabat Pembuat Komitmen ${namaSingkat}, ${namaSingkat} Sekretariat Jenderal Kemnaker Tanggal ${tanggalTeks}`,
      },
    ],
    yl,
  );
  yl = gambarBaris(kl, "Nomor", [{ teks: nomorTanpaAwalan }], yl);
  yl = gambarBaris(kl, "Tanggal", [{ teks: tanggalTeks }], yl);
  yl -= 10;
  tulisTengah(kl, "PEJABAT/PEGAWAI YANG MELAKSANAKAN PERINTAH KERJA LEMBUR", LEBAR_A4 / 2, yl, { tebal: true });
  yl -= 14;

  const kolom: KolomTabel[] = [
    { judul: "NO", lebar: 28, rata: "tengah", tengahVertikal: true },
    { judul: "NAMA/NIP", lebar: 160, pemisahSel: true },
    { judul: "GOL", lebar: 40, rata: "tengah", tengahVertikal: true },
    { judul: `TANGGAL (${NAMA_BULAN_ID[Math.max(0, Math.min(11, bulan - 1))]})`, lebar: 70, rata: "tengah", tengahVertikal: true },
    { judul: "KETERANGAN", lebar: 157 },
  ];
  const akhir = gambarTabel(doc, fontRegular, fontBold, {
    halaman: lampiran,
    yAwal: yl,
    kiri: MARGIN_KIRI,
    kolom,
    baris: susunBarisLampiranSpklHarian(data.baris, data.tanggalIso),
    ukuran: 9,
    ukuranHalaman: [LEBAR_A4, TINGGI_A4],
  });

  // Blok tanda tangan di akhir lampiran; pindah halaman bila tidak muat.
  let halamanTtd = akhir.halaman;
  let yTtd = akhir.y - 24;
  if (yTtd < 150) {
    halamanTtd = doc.addPage([LEBAR_A4, TINGGI_A4]);
    yTtd = TINGGI_A4 - 70;
  }
  const kt: KonteksTulis = { ...kl, page: halamanTtd };
  const jabatanLampiran = data.tanpaTte ? jabatanTtd : (data.penandatangan?.jabatan ?? jabatanTtd);
  tulisTengah(kt, `${jabatanLampiran},`, TENGAH_TTD_X, yTtd);
  tulisTengah(kt, "Setjen Kemnaker", TENGAH_TTD_X, yTtd - 14);
  const nama = data.tanpaTte ? data.kepalaBiro?.nama : data.penandatangan?.nama;
  const nip = data.tanpaTte ? data.kepalaBiro?.nip : data.penandatangan?.nip;
  tulisTengah(kt, nama || TITIK_NAMA, TENGAH_TTD_X, yTtd - 70);
  tulisTengah(kt, `NIP. ${nip || ".........................."}`, TENGAH_TTD_X, yTtd - 84);

  if (!data.tanpaTte) gambarFooterBsreSemuaHalaman(doc, fontRegular, data.previewTte === true);
  if (data.sementara) gambarCapSemuaHalaman(doc, fontBold, CAP_SEMENTARA);
  return { doc, yNama };
}

export async function generateSpklHarianPdf(data: DataSpklHarian): Promise<Buffer> {
  let hasil = await bangun(data, UKURAN_COBA[0]);
  for (let i = 1; i < UKURAN_COBA.length && hasil.yNama < Y_NAMA_MINIMAL; i++) {
    hasil = await bangun(data, UKURAN_COBA[i]);
  }
  hasil.doc.setTitle(`SPKL Harian${data.sementara ? " (SEMENTARA)" : ""} - ${data.tanggalIso} ${data.satuanKerja}`);
  return Buffer.from(await hasil.doc.save());
}
