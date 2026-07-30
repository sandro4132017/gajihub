import { utils, write } from "xlsx";
import { rakitTeksAdk, type SelAdk } from "../../../business-logic/adk";

/**
 * Membungkus baris ADK jadi HTTP response, dalam format Excel (.xlsx) atau
 * teks tab-separated (.txt).
 *
 * Dipakai bareng ketiga route ADK (Tukin, Uang Makan, Uang Lembur) supaya
 * perilaku dua tombol download-nya seragam, dan supaya penambahan format
 * baru nanti cukup diubah di satu tempat.
 *
 * Catatan: `xlsx` di-import NAMED di sini (bukan `import XLSX from "xlsx"`) -
 * file ini di-bundle Next, dan bundler-nya resolve paket itu ke build ESM
 * yang TIDAK punya default export. Lihat gotcha yang sama di
 * src/app/ppabp/gaji-induk/actions.ts.
 */
export function responseAdk({
  format,
  header,
  baris,
  total,
  namaSheet,
  namaFile,
}: {
  format: string | null;
  header: readonly string[];
  baris: SelAdk[][];
  total: SelAdk[];
  namaSheet: string;
  namaFile: string;
}): Response {
  if (format === "txt") {
    const teks = rakitTeksAdk(header, baris, total);
    return new Response(teks, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${namaFile}.txt"`,
      },
    });
  }

  // Default xlsx - termasuk kalau ?format= tidak diisi, supaya link lama
  // tetap menghasilkan file yang bisa dibuka.
  const ws = utils.aoa_to_sheet([[...header], ...baris, total]);
  const wb = utils.book_new();
  // Nama sheet dibatasi 31 karakter oleh format xlsx-nya sendiri.
  utils.book_append_sheet(wb, ws, namaSheet.slice(0, 31));
  const buffer = write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaFile}.xlsx"`,
    },
  });
}
