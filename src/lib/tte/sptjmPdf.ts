import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";
import {
  type JenisSptjm,
  type DataSptjmUniversal,
  type DataSptjmLembur,
  BULAN_ROMAWI,
  NAMA_BULAN,
  generateNomorSptjmDefault,
} from "./sptjmTypes";

export type { JenisSptjm, DataSptjmUniversal, DataSptjmLembur };
export { BULAN_ROMAWI, NAMA_BULAN, generateNomorSptjmDefault };

/**
 * Memeriksa apakah ada berkas logo atau kop surat di public/images atau public/sptjm
 */
function cariAsetGambarKop(): { tipe: "kop" | "logo"; buffer: Buffer } | null {
  const root = process.cwd();
  const kandidatKop = [
    path.join(root, "public", "images", "kop-kemnaker.png"),
    path.join(root, "public", "images", "kop-sptjm.png"),
    path.join(root, "public", "images", "kop-kemnaker.jpg"),
    path.join(root, "public", "sptjm", "kop-kemnaker.png"),
    path.join(root, "public", "sptjm", "kop-sptjm.png"),
  ];

  for (const p of kandidatKop) {
    if (fs.existsSync(p)) {
      try {
        return { tipe: "kop", buffer: fs.readFileSync(p) };
      } catch {}
    }
  }

  const kandidatLogo = [
    path.join(root, "public", "images", "logo-kemnaker.png"),
    path.join(root, "public", "images", "logo-garuda.png"),
    path.join(root, "public", "sptjm", "logo-kemnaker.png"),
    path.join(root, "public", "sptjm", "logo-garuda.png"),
  ];

  for (const p of kandidatLogo) {
    if (fs.existsSync(p)) {
      try {
        return { tipe: "logo", buffer: fs.readFileSync(p) };
      } catch {}
    }
  }

  return null;
}

/**
 * Generator Draft PDF SPTJM PPK Resmi (A4) sesuai persis template Kemnaker
 * Mencakup SPTJM Tunjangan Kinerja, SPTJM Uang Makan, dan SPTJM Uang Lembur
 */
export async function generateDraftSptjm(data: DataSptjmUniversal): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.32, 841.92]); // Ukuran standar A4 persis dari template (595.32 x 841.92 pt)
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const namaPenandatangan = data.namaPenandatangan || "Alpha Sandro Adithyaswara, S.Sos., M.M.";
  const nipPenandatangan = data.nipPenandatangan || "19870323 201503 1 002";
  const jabatanPenandatangan = data.jabatanPenandatangan || "Kepala Subbagian Tata Usaha";
  const satuanKerja = data.satuanKerja || "Biro Keuangan dan BMN";
  const unitEselon1 = data.unitEselon1 || "Sekretariat Jenderal";
  const namaBulan = NAMA_BULAN[Math.max(0, Math.min(11, data.periodeBulan - 1))] || "September";

  const marginX = 54;
  let curY = 804;

  // 1. KOP SURAT
  const asetGambar = cariAsetGambarKop();
  if (asetGambar && asetGambar.tipe === "kop") {
    try {
      const img = await doc.embedPng(asetGambar.buffer).catch(() => doc.embedJpg(asetGambar.buffer));
      const imgWidth = 595.32 - marginX * 2;
      const imgHeight = (img.height / img.width) * imgWidth;
      page.drawImage(img, {
        x: marginX,
        y: curY - imgHeight + 15,
        width: imgWidth,
        height: imgHeight,
      });
      curY = curY - imgHeight - 10;
    } catch {
      curY = renderKopTeksDefault(page, fontBold, fontRegular, marginX, curY);
    }
  } else if (asetGambar && asetGambar.tipe === "logo") {
    try {
      const logo = await doc.embedPng(asetGambar.buffer).catch(() => doc.embedJpg(asetGambar.buffer));
      const logoSize = 58;
      page.drawImage(logo, {
        x: marginX,
        y: curY - logoSize + 4,
        width: logoSize,
        height: logoSize,
      });
      curY = renderKopTeksDenganLogo(page, fontBold, fontRegular, marginX + 68, curY);
    } catch {
      curY = renderKopTeksDefault(page, fontBold, fontRegular, marginX, curY);
    }
  } else {
    curY = renderKopTeksDefault(page, fontBold, fontRegular, marginX, curY);
  }

  // Garis Pembatas Kop Surat (Garis Ganda Khas Naskah Dinas Kementerian)
  page.drawLine({
    start: { x: marginX, y: curY },
    end: { x: 595.32 - marginX, y: curY },
    thickness: 1.8,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: marginX, y: curY - 2.5 },
    end: { x: 595.32 - marginX, y: curY - 2.5 },
    thickness: 0.6,
    color: rgb(0, 0, 0),
  });
  curY -= 35;

  // 2. JUDUL DOKUMEN & NOMOR
  const judul = "SURAT PERNYATAAN TANGGUNGJAWAB MUTLAK";
  const widthJudul = fontBold.widthOfTextAtSize(judul, 11);
  page.drawText(judul, {
    x: (595.32 - widthJudul) / 2,
    y: curY,
    size: 11,
    font: fontBold,
  });
  curY -= 16;

  const noSurat = data.nomorDokumen.toUpperCase().startsWith("NOMOR")
    ? data.nomorDokumen.toUpperCase()
    : `NOMOR ${data.nomorDokumen}`;
  const widthNo = fontBold.widthOfTextAtSize(noSurat, 10);
  page.drawText(noSurat, {
    x: (595.32 - widthNo) / 2,
    y: curY,
    size: 10,
    font: fontBold,
  });
  curY -= 32;

  // 3. PEMBUKA
  page.drawText("Yang Bertandatangan di bawah ini:", {
    x: marginX,
    y: curY,
    size: 9.5,
    font: fontRegular,
  });
  curY -= 20;

  // 4. IDENTITAS PENANDATANGAN (6 Poin Identik dengan Template)
  const renderIdentitas = (nomor: string, label: string, nilai: string) => {
    page.drawText(nomor, { x: marginX + 10, y: curY, size: 9.5, font: fontRegular });
    page.drawText(label, { x: marginX + 26, y: curY, size: 9.5, font: fontRegular });
    page.drawText(":", { x: marginX + 175, y: curY, size: 9.5, font: fontRegular });
    page.drawText(nilai, { x: marginX + 190, y: curY, size: 9.5, font: fontRegular });
    curY -= 17;
  };

  renderIdentitas("1.", "Nama", namaPenandatangan);
  renderIdentitas("2.", "NIP", nipPenandatangan);
  renderIdentitas("3.", "Jabatan", jabatanPenandatangan);
  renderIdentitas("4.", "Satuan Kerja", satuanKerja);
  renderIdentitas("5.", "Unit Eselon I", unitEselon1);
  renderIdentitas("6.", "Kementerian/Lembaga", "Kementerian Ketenagakerjaan");
  curY -= 16;

  // 5. PERNYATAAN MUTLAK
  page.drawText("Menyatakan dengan sesungguhnya bahwa:", {
    x: marginX,
    y: curY,
    size: 9.5,
    font: fontRegular,
  });
  curY -= 20;

  // Poin 1: Redaksi Spesifik per Jenis Pembayaran
  let teksPoin1 = "";
  if (data.jenis === "SPTJM_LEMBUR") {
    teksPoin1 = `Perhitungan yang terdapat dalam daftar nominatif dan/atau Pembayaran Uang Lembur Pegawai ${satuanKerja} ${unitEselon1} Kementerian Ketenagakerjaan bulan ${namaBulan} tahun ${data.periodeTahun} telah dihitung dengan benar.`;
  } else if (data.jenis === "SPTJM_TUKIN") {
    teksPoin1 = `Perhitungan yang terdapat dalam daftar nominatif dan/atau Pembayaran Tunjangan Kinerja Susulan Bulan ${namaBulan} Tahun ${data.periodeTahun} untuk Pegawai ${satuanKerja} ${unitEselon1} Kementerian Ketenagakerjaan telah dihitung dengan benar.`;
  } else {
    // SPTJM_UANG_MAKAN
    teksPoin1 = `Perhitungan yang terdapat dalam daftar nominatif dan/atau pembayaran uang makan Pegawai ${satuanKerja} bulan ${namaBulan} tahun ${data.periodeTahun} telah dihitung dengan benar.`;
  }

  page.drawText("1.", { x: marginX + 10, y: curY, size: 9.5, font: fontRegular });
  page.drawText(teksPoin1, {
    x: marginX + 26,
    y: curY,
    size: 9.5,
    font: fontRegular,
    maxWidth: 595.32 - marginX * 2 - 26,
    lineHeight: 14,
  });
  curY -= 45;

  // Poin 2: Klausul Pertanggungjawaban Mutlak & Penyetoran ke Kas Negara
  const teksPoin2 = `Apabila dikemudian hari terbukti pernyataan ini tidak benar, menimbulkan kerugian negara, dan/atau menimbulkan permasalahan hukum, maka saya bersedia bertanggung jawab secara mutlak untuk menyetor kerugian negara tersebut ke Kas Negara sesuai dengan ketentuan peraturan perundang-undangan.`;

  page.drawText("2.", { x: marginX + 10, y: curY, size: 9.5, font: fontRegular });
  page.drawText(teksPoin2, {
    x: marginX + 26,
    y: curY,
    size: 9.5,
    font: fontRegular,
    maxWidth: 595.32 - marginX * 2 - 26,
    lineHeight: 14,
  });
  curY -= 55;

  // 6. PENUTUP
  page.drawText("Demikian pernyataan ini kami buat dengan sesungguhnya.", {
    x: marginX,
    y: curY,
    size: 9.5,
    font: fontRegular,
  });
  curY -= 40;

  // 7. TEMPAT TANGGAL & TANDA TANGAN (Kanan Bawah)
  const tglFormatted =
    data.tanggalDokumen ||
    `Jakarta, ${new Date().toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`;
  const posXSign = 330;

  page.drawText(tglFormatted, {
    x: posXSign,
    y: curY,
    size: 9.5,
    font: fontRegular,
  });
  curY -= 15;

  page.drawText("Pejabat Pembuat Komitmen", {
    x: posXSign,
    y: curY,
    size: 9.5,
    font: fontRegular,
  });
  curY -= 14;

  page.drawText(`${satuanKerja} ${unitEselon1} Kemnaker. RI,`, {
    x: posXSign,
    y: curY,
    size: 9.5,
    font: fontRegular,
    maxWidth: 210,
  });

  // TAG KOORDINAT TTE BSrE ('#' kecil transparan / penanda letak QR Code BSrE)
  page.drawText("#", {
    x: posXSign + 25,
    y: curY - 32,
    size: 9,
    font: fontRegular,
  });
  curY -= 75;

  // Nama Penandatangan di Tanda Tangan
  const namaSigner = namaPenandatangan.replace(/, M\.M\./, ""); // Sesuai format template di ttd
  page.drawText(namaSigner, {
    x: posXSign,
    y: curY,
    size: 9.5,
    font: fontBold,
  });
  curY -= 14;

  page.drawText(`NIP ${nipPenandatangan}`, {
    x: posXSign,
    y: curY,
    size: 9,
    font: fontRegular,
  });

  // 8. FOOTER RESMI BSRE BSSN (Kriteria XI Integrasi BSrE)
  page.drawLine({
    start: { x: marginX, y: 46 },
    end: { x: 595.32 - marginX, y: 46 },
    thickness: 0.5,
    color: rgb(0.65, 0.65, 0.65),
  });

  page.drawText(
    "Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik yang diterbitkan oleh",
    {
      x: marginX,
      y: 35,
      size: 7,
      font: fontRegular,
      color: rgb(0.35, 0.35, 0.35),
    }
  );
  page.drawText("Balai Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara.", {
    x: marginX,
    y: 26,
    size: 7,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

// Fungsi pembantu render kop teks standar jika tanpa logo gambar
function renderKopTeksDefault(
  page: any,
  fontBold: any,
  fontRegular: any,
  marginX: number,
  curY: number
): number {
  page.drawText("KEMENTERIAN KETENAGAKERJAAN REPUBLIK INDONESIA", {
    x: marginX,
    y: curY,
    size: 11,
    font: fontBold,
  });
  curY -= 15;

  page.drawText("SEKRETARIAT JENDERAL", {
    x: marginX,
    y: curY,
    size: 10,
    font: fontBold,
  });
  curY -= 14;

  page.drawText(
    "Jalan Jenderal Gatot Subroto Kaveling 51, Kelurahan Kuningan Timur, Kecamatan Setiabudi, Kota Jakarta Selatan, DKI Jakarta 12950",
    {
      x: marginX,
      y: curY,
      size: 7.5,
      font: fontRegular,
    }
  );
  curY -= 12;

  page.drawText("www.kemnaker.go.id  |  persuratan@kemnaker.go.id  |  Call Center 1500630", {
    x: marginX,
    y: curY,
    size: 7.5,
    font: fontRegular,
  });
  curY -= 14;

  return curY;
}

// Fungsi pembantu render kop teks berdampingan dengan logo gambar
function renderKopTeksDenganLogo(
  page: any,
  fontBold: any,
  fontRegular: any,
  textX: number,
  curY: number
): number {
  page.drawText("KEMENTERIAN KETENAGAKERJAAN REPUBLIK INDONESIA", {
    x: textX,
    y: curY,
    size: 10.5,
    font: fontBold,
  });
  curY -= 15;

  page.drawText("SEKRETARIAT JENDERAL", {
    x: textX,
    y: curY,
    size: 9.5,
    font: fontBold,
  });
  curY -= 13;

  page.drawText(
    "Jalan Jenderal Gatot Subroto Kaveling 51, Kel. Kuningan Timur, Kec. Setiabudi, Jakarta Selatan 12950",
    {
      x: textX,
      y: curY,
      size: 7,
      font: fontRegular,
    }
  );
  curY -= 11;

  page.drawText("www.kemnaker.go.id  |  persuratan@kemnaker.go.id  |  1500630", {
    x: textX,
    y: curY,
    size: 7,
    font: fontRegular,
  });
  curY -= 18;

  return curY;
}

/**
 * Membubuhkan stempel digital TTE BSrE (Simulasi Offline / Fallback saat intranet/VPN BSrE belum terhubung)
 */
export async function terapkanStempelTteSimulasi(
  pdfBuffer: Buffer,
  options: {
    namaPenandatangan: string;
    nipPenandatangan: string;
    idDokumenBsre: string;
    verifyUrl: string;
  }
): Promise<Buffer> {
  const doc = await PDFDocument.load(pdfBuffer);
  const page = doc.getPages()[0];
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  const posX = 330;
  const posY = 175;

  // Gambar kotak visual TTE
  page.drawRectangle({
    x: posX,
    y: posY - 45,
    width: 200,
    height: 48,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.25, 0.45, 0.7),
    borderWidth: 0.8,
  });

  // Teks Informasi TTE
  page.drawText("DITANDATANGANI SECARA ELEKTRONIK", {
    x: posX + 6,
    y: posY - 10,
    size: 6.5,
    font: fontBold,
    color: rgb(0.15, 0.35, 0.65),
  });

  page.drawText(options.namaPenandatangan, {
    x: posX + 6,
    y: posY - 20,
    size: 7,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  page.drawText(`NIP. ${options.nipPenandatangan}`, {
    x: posX + 6,
    y: posY - 29,
    size: 6,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2),
  });

  page.drawText(`BSrE BSSN | ID: ${options.idDokumenBsre.slice(0, 16)}...`, {
    x: posX + 6,
    y: posY - 39,
    size: 5.5,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const signedBytes = await doc.save();
  return Buffer.from(signedBytes);
}

/**
 * Fungsi pembantu lama untuk kompatibilitas
 */
export async function generateDraftSptjmLembur(data: DataSptjmLembur): Promise<Buffer> {
  return generateDraftSptjm({
    jenis: "SPTJM_LEMBUR",
    nomorDokumen: data.nomorDokumen,
    satuanKerja: data.satuanKerja,
    periodeBulan: data.periodeBulan,
    periodeTahun: data.periodeTahun,
    namaPenandatangan: data.namaPenandatangan,
    nipPenandatangan: data.nipPenandatangan,
    jabatanPenandatangan: data.jabatanPenandatangan,
    tanggalDokumen: data.tanggalDokumen,
    jumlahPegawai: data.jumlahPegawai,
    totalNominal: data.totalUangLembur,
  });
}
