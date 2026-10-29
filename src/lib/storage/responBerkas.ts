// Respons bersama untuk Route Handler yang menyajikan berkas privat
// (`/berkas/...`). Dipisah dari berkasPrivat.ts supaya yang itu tetap bebas
// dari Next.js.

import { NextResponse } from "next/server";
import { headerUnduh } from "./berkasPrivat";

/** Galat berupa teks biasa berbahasa Indonesia - bukan JSON, bukan halaman HTML. */
export function responTeks(status: number, pesan: string): NextResponse {
  return new NextResponse(pesan, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const GALAT = {
  tanpaSesi: () => responTeks(401, "Sesi login berakhir. Silakan login kembali."),
  tanpaIzin: () => responTeks(403, "Kamu tidak berwenang membuka berkas ini."),
  tidakAda: () => responTeks(404, "Berkas tidak ditemukan."),
} as const;

/** `inline` kecuali `?unduh=1`. */
export function mintaInline(url: URL): boolean {
  return url.searchParams.get("unduh") !== "1";
}

export function responBerkas(isi: Buffer, nama: string, inline: boolean): NextResponse {
  return new NextResponse(new Uint8Array(isi), {
    status: 200,
    headers: headerUnduh(nama, { inline, panjang: isi.length }),
  });
}
