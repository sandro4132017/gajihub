// ============================================================================
// MENYAJIKAN BERKAS SPTJM BERTANDA TANGAN KEPADA PEMEGANG DOKUMEN.
//
// MASALAH YANG DIPERBAIKI: tautan unduh di halaman verifikasi dulu menunjuk
// langsung ke berkas statis di folder unggahan. Matcher middleware hanya
// mengecualikan berkas gambar dan font - `.pdf` tidak termasuk - jadi
// permintaan itu ikut dicegat, dan pengunjung tanpa sesi dialihkan ke /login.
// Terukur di produksi: HTTP 307 -> /login.
//
// Akibatnya halaman verifikasinya terbuka untuk umum, tapi berkas yang
// seharusnya diperiksa justru tertutup - orang luar tidak bisa mengunduh PDF
// untuk divalidasi, padahal itu inti seluruh alurnya.
//
// KENAPA LEWAT RUTE INI, BUKAN DENGAN MELONGGARKAN MATCHER. Mengecualikan
// seluruh folder unggahan dari middleware akan sekaligus membuka unggahan lain
// (bukti dukung banding, berkas gaji) kepada siapa pun. Berkasnya sendiri kini
// ada di penyimpanan privat (storage/uploads/tte, lihat berkasPrivat.ts), dan
// rute ini satu-satunya jalan publik ke sana. Rute ini hanya
// menyajikan SATU dokumen untuk id yang sudah diketahui, hanya kalau sudah
// TERTANDATANGANI, dan letaknya di bawah /tte/verify/ yang memang sudah
// diizinkan tanpa sesi.
//
// Cakupan keterbukaannya SAMA PERSIS dengan halaman verifikasinya: siapa pun
// yang memegang dokumen - atau memindai QR-nya - boleh memeriksanya. Itu
// memang maksud tanda tangan elektronik.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { bacaBerkasDalamAkar } from "@/lib/storage/berkasPrivat";
import path from "path";
import { prisma } from "@/lib/prisma";
import { jalurDisk } from "@/lib/tte/periksaBsre";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const dokumen = await prisma.dokumenTte
    .findUnique({
      where: { id },
      select: { status: true, fileSignedPath: true },
    })
    .catch(() => null);

  // Draft TIDAK disajikan di sini. Dokumen yang belum ditandatangani tidak
  // punya urusan dengan halaman verifikasi publik.
  if (!dokumen || dokumen.status !== "TERTANDATANGANI" || !dokumen.fileSignedPath) {
    return NextResponse.json(
      { error: "Berkas bertanda tangan untuk dokumen ini tidak tersedia." },
      { status: 404 }
    );
  }

  let jalur = "";
  let isi: Buffer;
  try {
    jalur = jalurDisk(dokumen.fileSignedPath);
    isi = await bacaBerkasDalamAkar(jalur, "tte");
  } catch {
    // Tercatat tertandatangani tapi berkasnya tidak ada di server ini. Paling
    // sering karena dokumennya ditandatangani di mesin lain - storage/ tidak
    // ikut git, jadi tidak ikut berpindah saat deploy. Referensi yang tidak
    // sah (jalurDisk melempar) diperlakukan sama.
    return NextResponse.json(
      {
        error:
          "Berkas tidak ditemukan di server ini. Dokumen ini kemungkinan " +
          "ditandatangani di lingkungan lain.",
      },
      { status: 404 }
    );
  }

  const namaBerkas = path.basename(jalur);

  return new NextResponse(new Uint8Array(isi), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(isi.length),
      // `inline` supaya langsung terbaca di peramban HP sesudah memindai QR;
      // tombol simpan tetap tersedia dari pembaca PDF bawaannya.
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(namaBerkas)}`,
      // Dokumen penggajian tidak boleh mengendap di cache bersama.
      "Cache-Control": "private, no-store",
    },
  });
}
