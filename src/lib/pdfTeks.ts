// ============================================================================
// EKSTRAKSI TEKS + KOORDINAT DARI PDF
//
// Ini lapisan I/O-nya (bukan business logic - lihat "Konvensi kode" di
// CLAUDE.md): satu-satunya tempat yang menyentuh library PDF. Parser yang
// memahami isi laporan tetap pure di src/business-logic/presensiPdf.ts, jadi
// bisa ditest tanpa file PDF sungguhan.
//
// Dipakai `unpdf` - bundel pdfjs yang memang disiapkan buat jalan di server
// (tanpa canvas/DOM). Yang dipakai cuma getTextContent(), bukan rendering.
// ============================================================================

import { getDocumentProxy } from "unpdf";
import type { HalamanPdf, ItemTeksPdf } from "../business-logic/presensiPdf";

/**
 * pdfjs versi baru memanggil Math.sumPrecise (Node 22+). Di Node 20 - versi
 * yang dipakai VPS testing - fungsi itu belum ada, dan pdfjs memuntahkan
 * "Warning: TypeError: Math.sumPrecise is not a function" tiap halaman.
 * Ekstraksi teksnya tetap jalan, tapi warning-nya membanjiri log server, jadi
 * ditambal di sini. Hapus kalau runtime-nya sudah Node 22+.
 */
function tambalMathSumPrecise() {
  const M = Math as unknown as { sumPrecise?: (nilai: Iterable<number>) => number };
  if (typeof M.sumPrecise !== "function") {
    M.sumPrecise = (nilai) => {
      let total = 0;
      for (const n of nilai) total += n;
      return total;
    };
  }
}

export interface HasilEkstraksiPdf {
  halaman: HalamanPdf[];
  /** Jumlah halaman yang sama sekali tidak punya teks (indikasi PDF hasil scan). */
  halamanTanpaTeks: number;
}

export async function ekstrakTeksPdf(data: Uint8Array): Promise<HasilEkstraksiPdf> {
  tambalMathSumPrecise();

  const doc = await getDocumentProxy(data);
  const halaman: HalamanPdf[] = [];
  let halamanTanpaTeks = 0;

  for (let nomor = 1; nomor <= doc.numPages; nomor++) {
    const page = await doc.getPage(nomor);
    const konten = await page.getTextContent();

    const items: ItemTeksPdf[] = [];
    for (const raw of konten.items as unknown[]) {
      const it = raw as { str?: string; transform?: number[]; width?: number };
      if (typeof it.str !== "string" || it.str.trim() === "") continue;
      if (!it.transform || it.transform.length < 6) continue;
      items.push({
        teks: it.str,
        x: it.transform[4],
        y: it.transform[5],
        lebar: typeof it.width === "number" ? it.width : 0,
      });
    }

    if (items.length === 0) halamanTanpaTeks++;
    halaman.push({ nomor, items });
  }

  return { halaman, halamanTanpaTeks };
}
