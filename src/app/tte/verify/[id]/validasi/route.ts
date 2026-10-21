// ============================================================================
// VALIDASI KEASLIAN NASKAH - pemegang dokumen mengunggah PDF yang dia punya,
// lalu dicocokkan dengan sidik yang dicatat Gajihub saat penandatanganan.
//
// LETAKNYA SENGAJA DI BAWAH /tte/verify/ - middleware mengizinkan seluruh
// awalan itu tanpa sesi, dan memang harus: yang memeriksa keaslian dokumen
// adalah orang luar yang tidak punya akun. Di bawah /api/ permintaannya akan
// dialihkan ke /login dan tidak pernah sampai ke sini.
//
// BERKASNYA TIDAK PERNAH DISIMPAN. Dibaca ke memori, dihitung sidiknya, lalu
// dibuang - pola yang sama dengan unggahan gaji induk dan predikat kinerja.
// Tidak ada yang bisa menitipkan berkas ke server lewat jalur ini.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hitungHashBerkas, hashSama } from "@/lib/tte/hashBerkas";

export const dynamic = "force-dynamic";

/** Batas ukuran unggahan. SPTJM bertanda tangan ada di kisaran ratusan KB. */
const BATAS_BYTE = 20 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const dokumen = await prisma.dokumenTte
      .findUnique({
        where: { id },
        select: { hashBerkas: true, status: true },
      })
      .catch(() => null);

    if (!dokumen) {
      return NextResponse.json(
        { error: "Dokumen tidak terdaftar di Gajihub." },
        { status: 404 }
      );
    }

    if (!dokumen.hashBerkas) {
      // Jujur soal batasnya: dokumen yang ditandatangani sebelum sidik dicatat
      // tidak bisa dibandingkan, dan itu BUKAN berarti berkasnya bermasalah.
      return NextResponse.json({
        bisaDibandingkan: false,
        pesan:
          "Dokumen ini ditandatangani sebelum Gajihub mencatat sidik berkas, " +
          "jadi belum ada pembanding. Keasliannya tetap bisa diperiksa lewat " +
          "tanda tangan elektronik di dalam PDF-nya.",
      });
    }

    const form = await req.formData().catch(() => null);
    const berkas = form?.get("berkas");

    if (!(berkas instanceof File) || berkas.size === 0) {
      return NextResponse.json(
        { error: "Pilih berkas PDF naskah yang ingin diperiksa." },
        { status: 400 }
      );
    }

    if (berkas.size > BATAS_BYTE) {
      return NextResponse.json(
        {
          error: `Berkas terlalu besar (${Math.round(
            berkas.size / 1024 / 1024
          )} MB). Batasnya ${BATAS_BYTE / 1024 / 1024} MB.`,
        },
        { status: 413 }
      );
    }

    const isi = new Uint8Array(await berkas.arrayBuffer());
    const hashDiunggah = hitungHashBerkas(isi);
    const cocok = hashSama(hashDiunggah, dokumen.hashBerkas);

    return NextResponse.json({
      bisaDibandingkan: true,
      cocok,
      hashDiunggah,
      hashTercatat: dokumen.hashBerkas,
      namaBerkas: berkas.name,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Gagal memeriksa berkas: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }
}
