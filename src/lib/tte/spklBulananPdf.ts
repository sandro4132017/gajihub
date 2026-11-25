// PDF SPKL BULANAN, mengikuti template "SPKL_Bulan Oktober 2026": judul +
// nomor, Menimbang, Dasar, MEMERINTAHKAN, Kepada, Untuk, Pembiayaan,
// "Ditetapkan di Jakarta", tanda tangan, lalu lampiran (NO, NAMA/NIP, GOL,
// TANGGAL, KETERANGAN) berorientasi lanskap.
//
// Disusun dari input murni: daftar anggota + tanggal + uraian. Rekap dari
// perintah harian dimuat di luar modul ini.
//
// TODO(confirm): penanda tangan sementara = Kasubag TU unit; template
// aslinya ditandatangani Kepala Biro.

import { siapkanKertasBerkop } from "./sptjmPdf";
import { NAMA_BULAN } from "./sptjmTypes";
import {
  AKUN_PLACEHOLDER,
  DASAR_LEMBUR,
  MARGIN_KIRI,
  NOMOR_DIPA_PLACEHOLDER,
  gambarBaris,
  gambarBlokTtd,
  gambarFooterBsreSemuaHalaman,
  gambarParagraf,
  gambarTabel,
  hariDalamBulan,
  tanggalPanjangId,
  tulis,
  tulisTengah,
  type KolomTabel,
  type KonteksTulis,
} from "./pdfLemburBersama";
import type { PenandatanganDokumen } from "./suratTugasLemburPdf";

export interface EntriSpkl {
  /** Tanggal dalam bulan (1-31). */
  tanggal: number;
  uraian: string;
}

export interface AnggotaSpkl {
  nip: string;
  nama: string;
  golongan: string;
  entri: readonly EntriSpkl[];
}

export interface DataSpklBulanan {
  nomorDokumen: string;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  /** Sementara Kasubag TU unit. */
  penandatangan: PenandatanganDokumen;
  anggota: readonly AnggotaSpkl[];
  /** Tanggal penetapan, mis. "30 September 2026"; bawaan hari ini. */
  tanggalDokumen?: string;
  previewTte?: boolean;
}

/** Satu baris lampiran per anggota: tanggal unik terurut, uraian unik digabung. */
export function susunBarisLampiranSpkl(anggota: readonly AnggotaSpkl[]): string[][] {
  return anggota.map((a, i) => {
    const tanggal = [...new Set(a.entri.map((e) => e.tanggal))].sort((x, y) => x - y);
    const uraian: string[] = [];
    for (const e of a.entri) {
      const u = e.uraian.trim();
      if (u && !uraian.includes(u)) uraian.push(u);
    }
    return [
      String(i + 1),
      `${a.nama}\n${a.nip}`,
      a.golongan,
      tanggal.join(","),
      uraian.map((u) => `- ${u}`).join("\n"),
    ];
  });
}

const UKURAN_COBA = [11, 10.5, 10, 9.5, 9, 8.5];
const Y_NAMA_MINIMAL = 95;

async function bangun(data: DataSpklBulanan, ukuran: number) {
  const { doc, page, fontRegular, fontBold } = await siapkanKertasBerkop();
  const k: KonteksTulis = { page, font: fontRegular, fontBold, ukuran, jarakBaris: ukuran * 1.4 };
  const namaBulan = NAMA_BULAN[Math.max(0, Math.min(11, data.periodeBulan - 1))];
  const akhir = hariDalamBulan(data.periodeBulan, data.periodeTahun);
  const tanggalDok = data.tanggalDokumen || tanggalPanjangId(new Date());

  tulisTengah(k, "SURAT PERINTAH KERJA LEMBUR", 297.66, 692.38, { tebal: true, ukuran: 14.04 });
  const noSurat = data.nomorDokumen.toUpperCase().startsWith("NOMOR")
    ? data.nomorDokumen
    : `NOMOR ${data.nomorDokumen}`;
  tulisTengah(k, noSurat, 297.66, 675.7, { tebal: true });

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
  );
  y -= k.jarakBaris * 0.3;
  y = gambarBaris(
    k,
    "Dasar",
    DASAR_LEMBUR.map((teks, i) => ({ no: `${i + 1}.`, teks })),
    y,
  );
  y -= k.jarakBaris * 0.3;
  tulisTengah(k, "MEMERINTAHKAN", 297.66, y, { tebal: true });
  y -= k.jarakBaris * 1.4;
  y = gambarBaris(
    k,
    "Kepada",
    [{ teks: "Para Pejabat/Pegawai yang namanya tercantum dalam lampiran Surat Perintah Kerja ini." }],
    y,
  );
  y -= k.jarakBaris * 0.3;
  y = gambarBaris(
    k,
    "Untuk",
    [
      { no: "1.", teks: `Melaksanakan kegiatan setelah jam kerja dan di hari libur di ${data.satuanKerja};` },
      { no: "2.", teks: `Kegiatan dilaksanakan pada tanggal 01 s/d ${String(akhir).padStart(2, "0")} ${namaBulan} ${data.periodeTahun}.` },
    ],
    y,
  );
  y -= k.jarakBaris * 0.3;
  // TODO(confirm): nomor DIPA dan kode akun belum dikonfirmasi; dicetak sebagai penanda.
  y = gambarBaris(
    k,
    "Pembiayaan",
    [
      {
        teks: `Biaya yang timbul sebagai akibat ditetapkannya Surat Perintah Kerja ini dibebankan pada Daftar Isian Pelaksanaan Anggaran (DIPA) Sekretariat Jenderal Kementerian Ketenagakerjaan Tahun ${data.periodeTahun} Nomor : ${NOMOR_DIPA_PLACEHOLDER}; Akun : ${AKUN_PLACEHOLDER}`,
      },
    ],
    y,
  );
  y -= k.jarakBaris * 0.3;
  y = gambarParagraf(k, "Demikian Perintah Kerja ini dibuat untuk dilaksanakan dengan penuh tanggung jawab.", MARGIN_KIRI, y);

  y -= k.jarakBaris * 0.8;
  const { yNama } = gambarBlokTtd(k, doc, {
    yAtas: y,
    barisAtas: ["Ditetapkan di Jakarta", `Pada tanggal ${tanggalDok}`, `${data.penandatangan.jabatan},`],
    nama: data.penandatangan.nama,
    nip: data.penandatangan.nip,
    previewTte: data.previewTte,
  });

  // ---- Lampiran lanskap ----
  const lampiran = doc.addPage([841.92, 595.32]);
  const kl: KonteksTulis = { ...k, page: lampiran, ukuran: 10, jarakBaris: 14 };
  tulis(kl, "Lampiran Surat Perintah Kerja Lembur", 40, 555, { tebal: true });
  tulis(kl, `Nomor   : ${data.nomorDokumen.replace(/^NOMOR\s+/i, "")}`, 40, 541);
  tulis(kl, `Periode : ${namaBulan} ${data.periodeTahun} - ${data.satuanKerja}`, 40, 527);

  const kolom: KolomTabel[] = [
    { judul: "NO", lebar: 30, rata: "tengah" },
    { judul: "NAMA/NIP", lebar: 190 },
    { judul: "GOL", lebar: 50, rata: "tengah" },
    { judul: `TANGGAL (${namaBulan})`, lebar: 170, rata: "tengah" },
    { judul: "KETERANGAN", lebar: 321 },
  ];
  gambarTabel(doc, fontRegular, fontBold, {
    halaman: lampiran,
    yAwal: 510,
    kiri: 40,
    kolom,
    baris: susunBarisLampiranSpkl(data.anggota),
    ukuran: 9,
    ukuranHalaman: [841.92, 595.32],
  });

  gambarFooterBsreSemuaHalaman(doc, fontRegular, data.previewTte === true);
  return { doc, yNama };
}

export async function generateSpklBulananPdf(data: DataSpklBulanan): Promise<Buffer> {
  let hasil = await bangun(data, UKURAN_COBA[0]);
  for (let i = 1; i < UKURAN_COBA.length && hasil.yNama < Y_NAMA_MINIMAL; i++) {
    hasil = await bangun(data, UKURAN_COBA[i]);
  }
  const namaBulan = NAMA_BULAN[Math.max(0, Math.min(11, data.periodeBulan - 1))];
  hasil.doc.setTitle(`SPKL - ${namaBulan} ${data.periodeTahun} ${data.satuanKerja}`);
  return Buffer.from(await hasil.doc.save());
}
