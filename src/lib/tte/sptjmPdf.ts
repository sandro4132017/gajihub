import { PDFDocument, PDFDict, PDFName, PDFRawStream, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import { buatSpesimenQr, ambilTemplateSpesimen } from "./spesimenTte";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import {
  type JenisSptjm,
  type DataSptjmUniversal,
  type DataSptjmLembur,
  BULAN_ROMAWI,
  NAMA_BULAN,
  generateNomorSptjmDefault,
  generateNamaFileSptjm,
} from "./sptjmTypes";

export type { JenisSptjm, DataSptjmUniversal, DataSptjmLembur };
export { BULAN_ROMAWI, NAMA_BULAN, generateNomorSptjmDefault, generateNamaFileSptjm };

const PAGE_WIDTH = 595.32;
const PAGE_HEIGHT = 841.92;

/**
 * Mencari PDF referensi asli yang memiliki Kop Surat vektor + font Arial Narrow tertanam
 */
function cariTemplateKopPdfAsli(): Buffer | null {
  const root = process.cwd();
  const kandidatPdf = [
    path.join(root, "docs", "sptjm", "SPTJM - Lembur Agustus 2026 rokeu.pdf"),
    path.join(root, "docs", "sptjm", "SPTJM - TUNKIN SEPTEMBER 2026 rokeu.pdf"),
    path.join(root, "docs", "sptjm", "SPTJM - UM September 2026.pdf"),
    path.join(root, "public", "sptjm", "template-kop-sptjm.pdf"),
  ];

  for (const p of kandidatPdf) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p);
      } catch {}
    }
  }
  return null;
}

/**
 * Memeriksa apakah ada berkas gambar kop surat atau logo sebagai cadangan
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
 * Memecah paragraf menjadi baris-baris sesuai lebar maksimum `maxWidth`
 * dan merender dengan perataan kiri-kanan (Justify) untuk semua baris kecuali baris terakhir.
 */
function renderParagrafJustify(
  page: PDFPage,
  text: string,
  font: PDFFont,
  fontSize: number,
  startX: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): number {
  const normalizedText = text.replace(/perundang-undangan/g, "perundang- undangan");
  const rawWords = normalizedText.split(/\s+/).filter(Boolean);
  const spaceWidth = font.widthOfTextAtSize(" ", fontSize);

  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentWidth = 0;

  for (const word of rawWords) {
    const wordWidth = font.widthOfTextAtSize(word, fontSize);
    const additionalWidth = currentLine.length === 0 ? wordWidth : spaceWidth + wordWidth;

    if (currentLine.length > 0 && currentWidth + additionalWidth > maxWidth + 1.5) {
      lines.push(currentLine);
      currentLine = [word];
      currentWidth = wordWidth;
    } else {
      currentLine.push(word);
      currentWidth += additionalWidth;
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  let curY = startY;
  for (let i = 0; i < lines.length; i++) {
    const lineWords = lines[i];
    const isLastLine = i === lines.length - 1;

    if (isLastLine || lineWords.length === 1) {
      const joined = lineWords.join(" ").replace("perundang- undangan", "perundang-undangan");
      page.drawText(joined, {
        x: startX,
        y: curY,
        size: fontSize,
        font,
        color: rgb(0, 0, 0),
      });
    } else {
      const totalWordsWidth = lineWords.reduce(
        (acc, w) => acc + font.widthOfTextAtSize(w, fontSize),
        0
      );
      const gap = (maxWidth - totalWordsWidth) / (lineWords.length - 1);
      let curX = startX;
      for (const w of lineWords) {
        page.drawText(w, {
          x: curX,
          y: curY,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
        });
        curX += font.widthOfTextAtSize(w, fontSize) + gap;
      }
    }

    if (i < lines.length - 1) {
      curY -= lineHeight;
    }
  }

  return curY;
}

/**
 * Menggambar hanya QR Code TTE murni (tanpa kotak & tanpa teks di sampingnya)
 * tepat di tengah ruang tanda tangan antara baris jabatan PPK dan nama pejabat.
 */
async function gambarQrCodeTte(
  doc: PDFDocument,
  page: PDFPage,
  centerX: number,
  yNama: number,
  verifyUrl: string
) {
  // SENGAJA BERBEDA DARI SPESIMEN ASLI, dan ini bukan soal selera.
  //
  // Spesimen yang dibubuhkan BSrE berwarna navy dan berlogo Gajihub di
  // tengahnya. Stempel simulasi ini MERAH DAN TANPA LOGO, supaya dokumen yang
  // tidak pernah ditandatangani BSrE tidak bisa disangka asli hanya dari
  // melihat stempelnya. Tampilan yang meyakinkan pada dokumen yang tidak sah
  // adalah cetakan pemalsuan yang kita sediakan sendiri.
  const { png } = buatSpesimenQr(
    verifyUrl,
    ambilTemplateSpesimen({ warnaQr: [192, 73, 47], pakaiLogo: false })
  );
  const qrImg = await doc.embedPng(png);

  const qrSize = 58;
  const qrX = centerX - qrSize / 2;
  // Ruang bersih antara teks jabatan (atas: yNama + 85.5) dan puncak huruf nama (bawah: yNama + 9.5)
  // memiliki titik tengah vertikal tepat di yNama + 48 pt (rentang QR: yNama + 19 s.d. yNama + 77)
  const qrY = yNama + 48 - qrSize / 2;

  // Tutup tanda '#' di belakang QR dengan latar putih bersih
  page.drawRectangle({
    x: qrX - 1,
    y: qrY - 1,
    width: qrSize + 2,
    height: qrSize + 2,
    color: rgb(1, 1, 1),
  });

  page.drawImage(qrImg, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
  });
}

/**
 * Generator Draft PDF SPTJM Resmi (A4: 595.32 x 841.92 pt)
 * Mengikuti 100% spesifikasi tipografi, koordinat, font (ArialMT 12pt, Arial-BoldMT 14.04pt,
 * Kop Arial Narrow), justify isi pernyataan, serta posisi blok tanda tangan dokumen asli.
 */
export async function generateDraftSptjm(data: DataSptjmUniversal): Promise<Buffer> {
  let doc: PDFDocument;
  let page: PDFPage;

  // 1. KOP SURAT (Prioritas 1: Vektor + Font Arial Narrow asli dari PDF referensi)
  const tplKopBytes = cariTemplateKopPdfAsli();
  let kopBerhasilDariTemplate = false;

  if (tplKopBytes) {
    try {
      doc = await PDFDocument.load(tplKopBytes);
      page = doc.getPages()[0];
      const contentsRef = page.node.Contents();
      const stream = doc.context.lookup(contentsRef) as PDFRawStream;
      const decoded = zlib.inflateSync(stream.contents).toString("latin1");
      const cutIdx = decoded.indexOf("/Span <</MCID 3");
      if (cutIdx > 0) {
        const kopOnly = decoded.slice(0, cutIdx);
        (stream as unknown as { contents: Uint8Array }).contents = zlib.deflateSync(
          Buffer.from(kopOnly, "latin1")
        );
        page.node.delete(PDFName.of("StructParents"));
        kopBerhasilDariTemplate = true;
      }
    } catch {
      doc = await PDFDocument.create();
      page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    }
  } else {
    doc = await PDFDocument.create();
    page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  const fontRegular = await doc!.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc!.embedFont(StandardFonts.HelveticaBold);

  if (!kopBerhasilDariTemplate) {
    const asetGambar = cariAsetGambarKop();
    if (asetGambar && asetGambar.tipe === "kop") {
      try {
        const img = await doc!
          .embedPng(asetGambar.buffer)
          .catch(() => doc!.embedJpg(asetGambar.buffer));
        page!.drawImage(img, {
          x: 20,
          y: 726,
          width: 555,
          height: 108,
        });
      } catch {
        renderKopTeksFallback(page!, fontBold, fontRegular);
      }
    } else if (asetGambar && asetGambar.tipe === "logo") {
      try {
        const logo = await doc!
          .embedPng(asetGambar.buffer)
          .catch(() => doc!.embedJpg(asetGambar.buffer));
        page!.drawImage(logo, {
          x: 24,
          y: 756.22,
          width: 51.1,
          height: 64.55,
        });
        renderKopTeksFallback(page!, fontBold, fontRegular);
      } catch {
        renderKopTeksFallback(page!, fontBold, fontRegular);
      }
    } else {
      renderKopTeksFallback(page!, fontBold, fontRegular);
    }
  }

  // NILAI CADANGAN TIDAK BOLEH BERUPA ORANG SUNGGUHAN.
  //
  // Dulu ketiga baris ini jatuh ke satu nama, NIP, dan jabatan pejabat yang
  // nyata. Akibatnya dokumen dengan data kurang tetap TERCETAK RAPI atas nama
  // orang itu - pada surat yang isinya pernyataan tanggung jawab mutlak.
  // Sekarang kekurangannya TERLIHAT di dokumen, jadi tidak bisa lolos diam-diam.
  //
  // Pemanggilnya (signSptjmUnitAction) sudah menolak lebih dulu kalau data
  // pegawainya tidak lengkap, jadi penanda di bawah seharusnya tidak pernah
  // muncul - dan kalau muncul, itu memang perlu dilihat.
  const namaPenandatangan = data.namaPenandatangan || "(nama penanda tangan belum ada)";
  const nipPenandatangan = data.nipPenandatangan || "(NIP belum ada)";

  // JABATAN DIPAKAI APA ADANYA. Sebelumnya jabatan yang kosong ATAU yang
  // berbunyi "Pejabat Pembuat Komitmen" ditulis ulang diam-diam menjadi
  // "Kepala Subbagian Tata Usaha" - penimpaan yang dibuat ketika penanda
  // tangannya masih di-hardcode. Sejak jabatan diambil dari tabel Pegawai,
  // penimpaan itu justru bisa mengganti jabatan seseorang yang sebenarnya.
  const jabatanIdentitas = data.jabatanPenandatangan || "(jabatan belum diisi)";
  const satuanKerjaRaw = data.satuanKerja || "(satuan kerja belum ditentukan)";
  const satuanKerja =
    satuanKerjaRaw === "Biro Keuangan dan Barang Milik Negara"
      ? "Biro Keuangan dan BMN"
      : satuanKerjaRaw;
  const unitEselon1 = data.unitEselon1 || "Sekretariat Jenderal";
  const namaBulan = NAMA_BULAN[Math.max(0, Math.min(11, data.periodeBulan - 1))] || "September";

  // 2. JUDUL DOKUMEN (Arial Bold 14.04 pt, Rata Tengah, y = 692.38 pt)
  const judul = "SURAT PERNYATAAN TANGGUNGJAWAB MUTLAK";
  const sizeJudul = 14.04;
  const widthJudul = fontBold.widthOfTextAtSize(judul, sizeJudul);
  page!.drawText(judul, {
    x: (PAGE_WIDTH - widthJudul) / 2,
    y: 692.38,
    size: sizeJudul,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // 3. NOMOR SURAT (Arial Regular 12 pt, Rata Tengah, y = 675.70 pt)
  const noSurat = data.nomorDokumen.toUpperCase().startsWith("NOMOR")
    ? data.nomorDokumen.toUpperCase()
    : `NOMOR ${data.nomorDokumen}`;
  const sizeIsi = 12;
  const widthNo = fontRegular.widthOfTextAtSize(noSurat, sizeIsi);
  page!.drawText(noSurat, {
    x: (PAGE_WIDTH - widthNo) / 2,
    y: 675.7,
    size: sizeIsi,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // 4. PENGANTAR IDENTITAS (Arial 12 pt, y = 645.46 pt)
  const xPengantarIdentitas = data.jenis === "SPTJM_LEMBUR" ? 92.06 : 56.64;
  page!.drawText("Yang Bertandatangan di bawah ini:", {
    x: xPengantarIdentitas,
    y: 645.46,
    size: sizeIsi,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // 5. DAFTAR IDENTITAS PEJABAT (6 Baris, Arial 12 pt, jarak antarbaris 18.8 pt)
  const barisIdentitas: [string, string, string, number][] = [
    ["1.", "Nama", namaPenandatangan, 609.58],
    ["2.", "NIP", nipPenandatangan, 590.86],
    ["3.", "Jabatan", jabatanIdentitas, 572.02],
    ["4.", "Satuan Kerja", satuanKerja, 553.15],
    ["5.", "Unit Eselon I", unitEselon1, 534.43],
    ["6.", "Kementerian/Lembaga", "Kementerian Ketenagakerjaan", 515.59],
  ];

  for (const [nomor, label, nilai, yPos] of barisIdentitas) {
    page!.drawText(nomor, { x: 107.42, y: yPos, size: sizeIsi, font: fontRegular, color: rgb(0, 0, 0) });
    page!.drawText(label, { x: 125.42, y: yPos, size: sizeIsi, font: fontRegular, color: rgb(0, 0, 0) });
    page!.drawText(":", { x: 260.81, y: yPos, size: sizeIsi, font: fontRegular, color: rgb(0, 0, 0) });
    page!.drawText(nilai, { x: 276.89, y: yPos, size: sizeIsi, font: fontRegular, color: rgb(0, 0, 0) });
  }

  // 6. PENGANTAR PERNYATAAN (Arial 12 pt, x = 87.50 pt, y = 474.07 pt)
  page!.drawText("Menyatakan dengan sesungguhnya bahwa:", {
    x: 87.5,
    y: 474.07,
    size: sizeIsi,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // 7. ISI PERNYATAAN (Arial 12 pt, Justify, Nomor di x = 92.06, Teks di x = 113.30, Lebar = 423.02 pt, Line spacing = 20.71 pt)
  const xNomorButir = 92.06;
  const xTeksButir = 113.3;
  const lebarTeksButir = 423.02;
  const spasiBarisPernyataan = 20.71;

  let teksPoin1 = "";
  if (data.jenis === "SPTJM_LEMBUR") {
    teksPoin1 = `Perhitungan yang terdapat dalam daftar nominatif dan/atau Pembayaran Uang Lembur Pegawai ${satuanKerja} ${unitEselon1} Kementerian Ketenagakerjaan bulan ${namaBulan} tahun ${data.periodeTahun} telah dihitung dengan benar.`;
  } else if (data.jenis === "SPTJM_TUKIN") {
    teksPoin1 = `Perhitungan yang terdapat dalam daftar nominatif dan/atau Pembayaran Tunjangan Kinerja Susulan Bulan ${namaBulan} Tahun ${data.periodeTahun} untuk Pegawai ${satuanKerja} ${unitEselon1} Kementerian Ketenagakerjaan telah dihitung dengan benar.`;
  } else {
    teksPoin1 = `Perhitungan yang terdapat dalam daftar nominatif dan/atau pembayaran uang makan Pegawai ${satuanKerja} bulan ${namaBulan} tahun ${data.periodeTahun} telah dihitung dengan benar.`;
  }

  const yMulaiPoin1 = 448.27;
  page!.drawText("1.", {
    x: xNomorButir,
    y: yMulaiPoin1,
    size: sizeIsi,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  const yAkhirPoin1 = renderParagrafJustify(
    page!,
    teksPoin1,
    fontRegular,
    sizeIsi,
    xTeksButir,
    yMulaiPoin1,
    lebarTeksButir,
    spasiBarisPernyataan
  );

  const yMulaiPoin2 = yAkhirPoin1 - spasiBarisPernyataan;
  const teksPoin2 =
    "Apabila dikemudian hari terbukti pernyataan ini tidak benar, menimbulkan kerugian negara, dan/atau menimbulkan permasalahan hukum, maka saya bersedia bertanggung jawab secara mutlak untuk menyetor kerugian negara tersebut ke Kas Negara sesuai dengan ketentuan peraturan perundang-undangan.";

  page!.drawText("2.", {
    x: xNomorButir,
    y: yMulaiPoin2,
    size: sizeIsi,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
  const yAkhirPoin2 = renderParagrafJustify(
    page!,
    teksPoin2,
    fontRegular,
    sizeIsi,
    xTeksButir,
    yMulaiPoin2,
    lebarTeksButir,
    spasiBarisPernyataan
  );

  // 8. KALIMAT PENUTUP (Arial 12 pt, x = 108.86 pt, jarak 34.48 pt di bawah akhir butir 2)
  const yPenutup = yAkhirPoin2 - 34.48;
  page!.drawText("Demikian pernyataan ini kami buat dengan sesungguhnya.", {
    x: 108.86,
    y: yPenutup,
    size: sizeIsi,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  // 9. BLOK TANDA TANGAN (Rata tengah pada poros sisi kanan centerX = 412.67 pt)
  const centerXSign = 412.67;
  const drawCenteredSignLine = (teks: string, yPos: number) => {
    const w = fontRegular.widthOfTextAtSize(teks, sizeIsi);
    page!.drawText(teks, {
      x: centerXSign - w / 2,
      y: yPos,
      size: sizeIsi,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
  };

  const yTanggal = yPenutup - 41.82;
  const tglFormatted =
    data.tanggalDokumen ||
    `Jakarta, ${new Date().toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })}`;
  drawCenteredSignLine(tglFormatted, yTanggal);

  const yPpk = yTanggal - 14.28;
  drawCenteredSignLine("Pejabat Pembuat Komitmen", yPpk);

  const yJabatanSatker = yPpk - 13.82;
  const eselonSingkat = unitEselon1 === "Sekretariat Jenderal" ? "Setjen" : unitEselon1;
  drawCenteredSignLine(`${satuanKerja} ${eselonSingkat} Kemnaker. RI,`, yJabatanSatker);

  // Jarak jabatan penandatangan ke nama = ±88,8 pt (88.47 pt)
  const yNama = yJabatanSatker - 88.47;
  const yNip = yNama - 14.28;

  // Simpan posisi yNama pada metadata dokumen agar terapkanStempelTteSimulasi akurat
  const namaFileResmi = generateNamaFileSptjm(
    data.jenis,
    data.periodeBulan,
    data.periodeTahun,
    satuanKerja
  );
  doc!.setTitle(namaFileResmi.replace(/\.pdf$/i, ""));
  doc!.setKeywords([`SIGN_Y:${yNama.toFixed(2)}`]);

  if (data.previewTte) {
    // TIDAK ADA QR DI DRAFT, DAN ITU DISENGAJA.
    //
    // Dulu di sini digambar QR yang isinya URL tetap .../tte/verify/preview -
    // tidak melekat pada dokumen mana pun dan bukan tanda tangan apa pun.
    // Akibatnya draft tampak seolah sudah ber-TTE, dan pembacanya mengira ada
    // yang error ketika hasil tanda tangan aslinya terlihat berbeda.
    //
    // QR yang SAH hanya ada dua sumber: digambar BSrE sendiri dari tag '#' di
    // cabang `else` di bawah, atau digambar terapkanStempelTteSimulasi yang
    // memang ditandai simulasi. Draft bukan keduanya, jadi yang ditampilkan
    // cuma keterangan ruangnya.
    const teksRuang = "[ ruang QR tanda tangan elektronik BSrE ]";
    const wRuang = fontRegular.widthOfTextAtSize(teksRuang, 7);
    page!.drawText(teksRuang, {
      x: centerXSign - wRuang / 2,
      y: yNama + 44,
      size: 7,
      font: fontRegular,
      color: rgb(0.45, 0.45, 0.45),
    });
  } else {
    // BSrE memosisikan kotak QR [x - width/2, y - height/2, x + width/2, y + height/2] dari titik '#'.
    // Dengan y = yNama + 48 dan ukuran 60x60, kotak QR berada di [yNama + 18, yNama + 78],
    // bebas penuh dari puncak teks Nama (yNama + 9) maupun bawah teks Jabatan (yNama + 85.5).
    page!.drawText("#", {
      x: centerXSign,
      y: yNama + 48,
      size: 2,
      font: fontRegular,
      color: rgb(1, 1, 1),
    });
  }

  const namaSigner = namaPenandatangan.replace(/,\s*M\.M\.$/, "");
  drawCenteredSignLine(namaSigner, yNama);
  drawCenteredSignLine(`NIP ${nipPenandatangan}`, yNip);

  // Setel nama internal font PDF menjadi ArialMT dan Arial-BoldMT sesuai spesifikasi dokumen asli
  await fontRegular.embed();
  await fontBold.embed();
  const regDict = doc!.context.lookup(fontRegular.ref);
  if (regDict instanceof PDFDict) {
    regDict.set(PDFName.of("BaseFont"), PDFName.of("ArialMT"));
  }
  const boldDict = doc!.context.lookup(fontBold.ref);
  if (boldDict instanceof PDFDict) {
    boldDict.set(PDFName.of("BaseFont"), PDFName.of("Arial-BoldMT"));
  }

  const pdfBytes = await doc!.save();
  return Buffer.from(pdfBytes);
}

/**
 * Fallback kop surat teks apabila file PDF referensi dan gambar kop tidak tersedia
 */
function renderKopTeksFallback(page: PDFPage, fontBold: PDFFont, fontRegular: PDFFont) {
  page.drawLine({
    start: { x: 82, y: 732 },
    end: { x: 82, y: 833 },
    thickness: 2.2,
    color: rgb(0.157, 0.29, 0.38),
  });

  page.drawText("KEMENTERIAN KETENAGAKERJAAN REPUBLIK INDONESIA", {
    x: 100.58,
    y: 804.36,
    size: 14.04,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });

  page.drawText("SEKRETARIAT JENDERAL", {
    x: 100.58,
    y: 786.36,
    size: 15.96,
    font: fontBold,
    color: rgb(0.157, 0.29, 0.38),
  });

  page.drawText(
    "Jalan Jenderal Gatot Subroto Kaveling 51, Kelurahan Kuningan Timur, Kecamatan Setiabudi, Kota Jakarta Selatan, Provinsi DKI Jakarta 12950",
    {
      x: 100.58,
      y: 774.6,
      size: 9,
      font: fontRegular,
      color: rgb(0, 0, 0),
    }
  );

  page.drawText("www.kemnaker.go.id    persuratan@kemnaker.go.id    1500630", {
    x: 113.06,
    y: 762.12,
    size: 9,
    font: fontRegular,
    color: rgb(0, 0, 0),
  });
}

/**
 * Membubuhkan stempel QR Code TTE BSrE murni (Simulasi Offline / Fallback saat BSrE tidak dapat dijangkau)
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

  let yNama = 110.42;
  const kw = doc.getKeywords();
  if (kw) {
    const match = kw.match(/SIGN_Y:([\d.]+)/);
    if (match) {
      yNama = parseFloat(match[1]);
    }
  }

  await gambarQrCodeTte(doc, page, 412.67, yNama, options.verifyUrl);

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
