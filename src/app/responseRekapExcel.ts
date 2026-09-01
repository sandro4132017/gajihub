import { utils, write } from "xlsx";
import type { HasilRekapExcel } from "../business-logic/rekapUnitExcel";

/**
 * Membungkus hasil `susunRekap*Excel()` jadi berkas .xlsx yang diunduh.
 *
 * TERPISAH dari `responseAdk()` di src/app/ppabp/adk/responseAdk.ts dengan
 * sengaja: berkas ADK adalah muatan pembayaran yang formatnya dikunci Web
 * Gaji, sementara ini rekap yang dibaca manusia. Satu helper untuk keduanya
 * berarti perubahan demi keterbacaan rekap bisa mengubah bentuk berkas yang
 * dipakai membayar orang.
 *
 * `xlsx` di-import NAMED (bukan `import XLSX from "xlsx"`) - file ini
 * di-bundle Next, dan bundler-nya resolve paket itu ke build ESM yang TIDAK
 * punya default export. Jebakan yang sama sudah tercatat di responseAdk.ts dan
 * ppabp/gaji-induk/actions.ts.
 */
export function responseRekapExcel({
  rekap,
  namaSheet,
  namaFile,
  kolomTeks = [1],
}: {
  rekap: HasilRekapExcel;
  namaSheet: string;
  namaFile: string;
  /** Indeks kolom yang dipaksa bertipe teks. Bawaannya kolom NIP. */
  kolomTeks?: number[];
}): Response {
  const ws = utils.aoa_to_sheet([[...rekap.header], ...rekap.baris, rekap.total]);

  // NIP DIPAKSA JADI TEKS. 18 digit melebihi presisi bilangan Excel (aman
  // sampai 15-16 digit), jadi kalau dibiarkan jadi angka, tiga digit
  // terakhirnya berubah menjadi nol - `...032002` terbaca `...032000`. Rekap
  // yang NIP-nya salah satu digit tidak akan cocok waktu diadu dengan berkas
  // lain, dan salahnya tidak kelihatan sampai ada yang menelusuri satu per
  // satu. Jebakan yang sama sudah menggigit di basis data gaji (46 baris
  // ber-NIP `...000`) dan di ADK harian.
  //
  // Baris 0 header, jadi data mulai baris 1.
  for (let r = 1; r <= rekap.baris.length; r++) {
    for (const c of kolomTeks) {
      const alamat = utils.encode_cell({ r, c });
      const sel = ws[alamat];
      if (sel && sel.v !== undefined && sel.v !== "") {
        sel.t = "s";
        sel.v = String(sel.v);
      }
    }
  }

  const wb = utils.book_new();
  // Nama sheet dibatasi 31 karakter oleh format xlsx-nya sendiri.
  utils.book_append_sheet(wb, ws, namaSheet.slice(0, 31));
  const buffer = write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${namaFile}.xlsx"`,
      // Rekap ini memuat nama & NIP pegawai satu unit - jangan sampai
      // tersimpan di cache proxy bersama.
      "Cache-Control": "private, no-store",
    },
  });
}
