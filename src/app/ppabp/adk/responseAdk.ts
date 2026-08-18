import { utils, write } from "xlsx";
import { rakitTeksAdk, type SelAdk } from "../../../business-logic/adk";
import {
  rakitTeksAdkHarian,
  susunGridAdkHarian,
  susunBarisAdkHarian,
  type PegawaiAdkHarian,
} from "../../../business-logic/adkHarian";

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

/**
 * Varian untuk ADK Uang Makan & Uang Lembur, yang formatnya PER HARI dan tanpa
 * rupiah sama sekali - lihat penjelasan lengkap di
 * src/business-logic/adkHarian.ts.
 *
 * .txt  -> daftar panjang persis seperti file yang disetor ke Web Gaji.
 * .xlsx -> DUA sheet: "hasil" (isi yang sama persis dengan .txt) dan "depan"
 *          (grid per tanggal buat diperiksa manusia). Urutan sheet-nya sengaja
 *          "depan" dulu supaya yang terbuka pertama adalah yang bisa dibaca,
 *          sementara "hasil" tetap ada sebagai muatan sebenarnya - sama
 *          seperti workbook operator yang jadi acuannya.
 */
export function responseAdkHarian({
  format,
  pegawai,
  periodeBulan,
  periodeTahun,
  denganJam,
  namaFile,
}: {
  format: string | null;
  pegawai: PegawaiAdkHarian[];
  periodeBulan: number;
  periodeTahun: number;
  denganJam: boolean;
  namaFile: string;
}): Response {
  const baris = susunBarisAdkHarian(pegawai, { denganJam });

  if (format === "txt") {
    return new Response(rakitTeksAdkHarian(baris), {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${namaFile}.txt"`,
      },
    });
  }

  const wb = utils.book_new();
  const grid = susunGridAdkHarian(pegawai, periodeBulan, periodeTahun, { denganJam });
  const wsDepan = utils.aoa_to_sheet(grid);
  // Kolom NIP di grid ikut dipaksa teks - alasan yang sama dengan sheet
  // "hasil" di bawah. Baris data grid mulai setelah 5 baris kepala.
  for (let i = 5; i < grid.length; i++) {
    const alamat = utils.encode_cell({ r: i, c: 1 });
    if (wsDepan[alamat]) { wsDepan[alamat].t = "s"; wsDepan[alamat].v = String(grid[i][1]); }
  }
  utils.book_append_sheet(wb, wsDepan, "depan");
  // NIP ditulis sebagai TEKS, bukan angka: 18 digit melebihi presisi bilangan
  // Excel, dan disimpan sebagai angka ujungnya berubah jadi nol (mis.
  // ...032002 -> ...032000). Baris ADK yang NIP-nya salah satu digit tidak
  // akan ketemu di Web Gaji, dan salahnya tidak kelihatan sampai ditolak.
  const wsHasil = utils.aoa_to_sheet(
    baris.map((b) => (b.jam === undefined ? [b.nip, b.tanggalIso] : [b.nip, b.tanggalIso, b.jam])),
    { cellDates: false }
  );
  for (let i = 0; i < baris.length; i++) {
    const alamat = utils.encode_cell({ r: i, c: 0 });
    if (wsHasil[alamat]) { wsHasil[alamat].t = "s"; wsHasil[alamat].v = baris[i].nip; }
  }
  utils.book_append_sheet(wb, wsHasil, "hasil");

  const buffer = write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaFile}.xlsx"`,
    },
  });
}
