// PDF Surat Tugas perintah lembur HARIAN, mengikuti susunan template
// "Surat Tugas Pegawai Biro Keuangan dan BMN": kop, judul + nomor, Dasar,
// MENUGASKAN, Kepada (nama-nama terlampir), Untuk, penutup, tanda tangan,
// lalu lampiran daftar pegawai. Penanda tangan = Kepala Tim pemberi perintah.
//
// Input bertipe murni - data sudah dimuat di luar. Penyimpanan, penomoran,
// dan penandatanganan BSrE ada di tandatanganiDokumen.ts.

import { siapkanKertasBerkop } from "./sptjmPdf";
import {
  DASAR_LEMBUR,
  MARGIN_KIRI,
  gambarBaris,
  gambarBlokTtd,
  gambarFooterBsreSemuaHalaman,
  gambarParagraf,
  gambarTabel,
  hariTanggalId,
  tanggalPanjangId,
  tulis,
  tulisTengah,
  type KonteksTulis,
  type KolomTabel,
} from "./pdfLemburBersama";

export interface PenandatanganDokumen {
  nama: string;
  nip: string;
  jabatan: string;
}

export interface PesertaSuratTugasLembur {
  nip: string;
  nama: string;
  jabatan: string;
  /** Teks jam lembur siap cetak, mis. "17.00 - 20.00". */
  jamLembur: string;
}

export interface DataSuratTugasLembur {
  nomorDokumen: string;
  /** Tanggal lembur, YYYY-MM-DD. */
  tanggalLembur: string;
  uraianTugas: string;
  satuanKerja: string;
  /** Kepala Tim pemberi perintah. */
  penandatangan: PenandatanganDokumen;
  peserta: readonly PesertaSuratTugasLembur[];
  /** Tanggal surat, mis. "19 November 2026"; bawaan hari ini. */
  tanggalDokumen?: string;
  previewTte?: boolean;
}

const UKURAN_COBA = [11, 10.5, 10, 9.5, 9, 8.5];
const Y_NAMA_MINIMAL = 95; // di bawah ini NIP & footer BSrE saling menempel

async function bangun(data: DataSuratTugasLembur, ukuran: number) {
  const { doc, page, fontRegular, fontBold } = await siapkanKertasBerkop();
  const k: KonteksTulis = { page, font: fontRegular, fontBold, ukuran, jarakBaris: ukuran * 1.4 };
  const tanggalDok = data.tanggalDokumen || tanggalPanjangId(new Date());

  tulisTengah(k, "SURAT TUGAS", 297.66, 692.38, { tebal: true, ukuran: 14.04 });
  const noSurat = data.nomorDokumen.toUpperCase().startsWith("NOMOR")
    ? data.nomorDokumen
    : `NOMOR ${data.nomorDokumen}`;
  tulisTengah(k, noSurat, 297.66, 675.7);

  let y = 650;
  y = gambarBaris(
    k,
    "Dasar",
    DASAR_LEMBUR.map((teks, i) => ({ no: `${i + 1}.`, teks })),
    y,
  );
  y -= k.jarakBaris * 0.4;
  tulisTengah(k, "MENUGASKAN", 297.66, y, { tebal: true });
  y -= k.jarakBaris * 1.4;
  y = gambarBaris(k, "Kepada", [{ teks: "Nama-nama terlampir" }], y);
  y -= k.jarakBaris * 0.4;
  y = gambarBaris(
    k,
    "Untuk",
    [
      {
        no: "1.",
        teks: `Melaksanakan kerja lembur di luar jam kerja pada ${hariTanggalId(data.tanggalLembur)} sesuai uraian tugas: ${data.uraianTugas.trim()}`,
      },
      {
        no: "2.",
        teks: "Melaksanakan tugas dengan penuh tanggung jawab dan melaporkan hasil kepada pimpinan.",
      },
    ],
    y,
  );
  y -= k.jarakBaris * 0.4;
  y = gambarParagraf(k, "Demikian Surat Tugas ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.", MARGIN_KIRI, y);

  y -= k.jarakBaris * 0.8;
  const { yNama } = gambarBlokTtd(k, doc, {
    yAtas: y,
    barisAtas: [`Jakarta, ${tanggalDok}`, `${data.penandatangan.jabatan},`],
    nama: data.penandatangan.nama,
    nip: data.penandatangan.nip,
    previewTte: data.previewTte,
  });

  // ---- Lampiran ----
  const lampiran = doc.addPage([595.32, 841.92]);
  const kl: KonteksTulis = { ...k, page: lampiran, ukuran: 10, jarakBaris: 14 };
  tulis(kl, "Lampiran Surat Tugas", 50, 790, { tebal: true });
  tulis(kl, `Nomor    : ${data.nomorDokumen.replace(/^NOMOR\s+/i, "")}`, 50, 776);
  tulis(kl, `Tanggal  : ${tanggalDok}`, 50, 762);
  tulisTengah(kl, "DAFTAR PEJABAT/PEGAWAI YANG DIBERI TUGAS KERJA LEMBUR", 297.66, 735, { tebal: true });
  tulisTengah(kl, `TANGGAL ${hariTanggalId(data.tanggalLembur).toUpperCase()}`, 297.66, 721, { tebal: true });

  const kolom: KolomTabel[] = [
    { judul: "NO", lebar: 28, rata: "tengah" },
    { judul: "NIP", lebar: 112 },
    { judul: "NAMA", lebar: 125 },
    { judul: "JABATAN", lebar: 143 },
    { judul: "JAM LEMBUR", lebar: 87, rata: "tengah" },
  ];
  gambarTabel(doc, fontRegular, fontBold, {
    halaman: lampiran,
    yAwal: 705,
    kiri: 50,
    kolom,
    baris: data.peserta.map((p, i) => [String(i + 1), p.nip, p.nama, p.jabatan, p.jamLembur]),
    ukuran: 9,
    ukuranHalaman: [595.32, 841.92],
  });

  gambarFooterBsreSemuaHalaman(doc, fontRegular, data.previewTte === true);
  return { doc, yNama };
}

export async function generateSuratTugasLemburPdf(data: DataSuratTugasLembur): Promise<Buffer> {
  let hasil = await bangun(data, UKURAN_COBA[0]);
  for (let i = 1; i < UKURAN_COBA.length && hasil.yNama < Y_NAMA_MINIMAL; i++) {
    hasil = await bangun(data, UKURAN_COBA[i]);
  }
  hasil.doc.setTitle(`Surat Tugas Lembur ${data.tanggalLembur} ${data.satuanKerja}`);
  return Buffer.from(await hasil.doc.save());
}
