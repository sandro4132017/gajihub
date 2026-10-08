import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface DataSptjmLembur {
  nomorDokumen: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  namaPenandatangan: string;
  nipPenandatangan: string;
  jabatanPenandatangan: string;
  jumlahPegawai: number;
  totalJamLembur: number;
  totalUangLembur: number;
  tanggalDokumen?: string;
}

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatRupiah(val: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(val);
}

/**
 * Membuat draft PDF SPTJM Uang Lembur sederhana (standar format A4)
 * lengkap dengan tag koordinat visualisasi tanda tangan elektronik '#'
 * serta klausul standar TTE BSrE (Kriteria XI Integrasi BSrE).
 */
export async function generateDraftSptjmLembur(data: DataSptjmLembur): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4: 595 x 842 pt
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 54; // ~1.9 cm
  let curY = 780;

  // 1. KOP SURAT / JUDUL DOKUMEN
  page.drawText("KEMENTERIAN KETENAGAKERJAAN REPUBLIK INDONESIA", {
    x: marginX,
    y: curY,
    size: 11,
    font: fontBold,
  });
  curY -= 16;

  page.drawText(data.satuanKerja.toUpperCase(), {
    x: marginX,
    y: curY,
    size: 10,
    font: fontBold,
  });
  curY -= 20;

  // Garis Header
  page.drawLine({
    start: { x: marginX, y: curY },
    end: { x: 595.28 - marginX, y: curY },
    thickness: 1.5,
    color: rgb(0, 0, 0),
  });
  curY -= 30;

  // 2. JUDUL SPTJM
  const judul = "SURAT PERNYATAAN TANGGUNG JAWAB MUTLAK (SPTJM)";
  const widthJudul = fontBold.widthOfTextAtSize(judul, 12);
  page.drawText(judul, {
    x: (595.28 - widthJudul) / 2,
    y: curY,
    size: 12,
    font: fontBold,
  });
  curY -= 16;

  const noSurat = `Nomor: ${data.nomorDokumen}`;
  const widthNo = fontRegular.widthOfTextAtSize(noSurat, 10);
  page.drawText(noSurat, {
    x: (595.28 - widthNo) / 2,
    y: curY,
    size: 10,
    font: fontRegular,
  });
  curY -= 35;

  // 3. IDENTITAS PENANDATANGAN
  page.drawText("Yang bertanda tangan di bawah ini:", {
    x: marginX,
    y: curY,
    size: 10,
    font: fontRegular,
  });
  curY -= 20;

  const renderField = (label: string, value: string) => {
    page.drawText(label, { x: marginX + 15, y: curY, size: 10, font: fontRegular });
    page.drawText(":", { x: marginX + 130, y: curY, size: 10, font: fontRegular });
    page.drawText(value, { x: marginX + 145, y: curY, size: 10, font: fontBold });
    curY -= 18;
  };

  renderField("Nama", data.namaPenandatangan);
  renderField("NIP", data.nipPenandatangan);
  renderField("Jabatan", data.jabatanPenandatangan);
  renderField("Satuan Kerja", data.satuanKerja);
  curY -= 15;

  // 4. PERNYATAAN
  const periodeStr = `${NAMA_BULAN[data.periodeBulan - 1]} ${data.periodeTahun}`;
  const paragraf1 =
    `Menyatakan dengan sesungguhnya bahwa perhitungan pelaksanaan lembur bagi pegawai pada ` +
    `lingkungan ${data.satuanKerja} untuk periode ${periodeStr} dengan rincian sebagai berikut:`;

  page.drawText(paragraf1, {
    x: marginX,
    y: curY,
    size: 10,
    font: fontRegular,
    maxWidth: 595.28 - marginX * 2,
    lineHeight: 14,
  });
  curY -= 40;

  // Rincian angka
  renderField("Jumlah Pegawai Lembur", `${data.jumlahPegawai} orang`);
  renderField("Total Jam Lembur", `${data.totalJamLembur.toFixed(1)} jam`);
  renderField("Total Pembayaran Lembur", formatRupiah(data.totalUangLembur));
  curY -= 15;

  const paragraf2 =
    `Telah dilakukan pemeriksaan, diverifikasi keabsahannya berdasarkan catatan presensi dan surat ` +
    `perintah kerja lembur, serta benar-benar dilaksanakan sesuai dengan ketentuan perundang-undangan ` +
    `yang berlaku. Apabila di kemudian hari terdapat kelebihan atas pembayaran lembur tersebut, ` +
    `kami bersedia bertanggung jawab sepenuhnya dan menyetorkan kelebihan tersebut ke Kas Negara.`;

  page.drawText(paragraf2, {
    x: marginX,
    y: curY,
    size: 10,
    font: fontRegular,
    maxWidth: 595.28 - marginX * 2,
    lineHeight: 15,
  });
  curY -= 80;

  // 5. TANGGAL & TANDA TANGAN
  const tgl = data.tanggalDokumen || `Jakarta, ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`;
  const posXSign = 350;

  page.drawText(tgl, {
    x: posXSign,
    y: curY,
    size: 10,
    font: fontRegular,
  });
  curY -= 16;

  page.drawText(data.jabatanPenandatangan, {
    x: posXSign,
    y: curY,
    size: 10,
    font: fontBold,
    maxWidth: 190,
  });
  curY -= 20;

  // TAG KOORDINAT UNTUK TTE BSrE (Karakter '#' transparan / kecil di area tanda tangan)
  // Posisi ini yang nanti digantikan oleh visualisasi QR Code BSrE
  page.drawText("#", {
    x: posXSign + 20,
    y: curY - 30,
    size: 10,
    font: fontRegular,
  });
  curY -= 75;

  page.drawText(data.namaPenandatangan, {
    x: posXSign,
    y: curY,
    size: 10,
    font: fontBold,
  });
  curY -= 14;

  page.drawText(`NIP. ${data.nipPenandatangan}`, {
    x: posXSign,
    y: curY,
    size: 9,
    font: fontRegular,
  });

  // 6. FOOTER RESMI BSRE (Kriteria XI Integrasi BSrE)
  const footerText1 = "Dokumen ini telah ditandatangani secara elektronik menggunakan sertifikat elektronik";
  const footerText2 = "yang diterbitkan oleh Balai Sertifikasi Elektronik (BSrE), Badan Siber dan Sandi Negara.";

  page.drawLine({
    start: { x: marginX, y: 50 },
    end: { x: 595.28 - marginX, y: 50 },
    thickness: 0.5,
    color: rgb(0.6, 0.6, 0.6),
  });

  page.drawText(footerText1, {
    x: marginX,
    y: 38,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });
  page.drawText(footerText2, {
    x: marginX,
    y: 28,
    size: 7.5,
    font: fontRegular,
    color: rgb(0.3, 0.3, 0.3),
  });

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

