import { NextResponse, type NextRequest } from "next/server";
import { setVerifikasiTabelAction, type KirimFormState } from "../../../../kasubag/kirim/actions";
import { catatGalat, pesanGalatAwam } from "../../../../../lib/koneksi/galatSumber";

export const dynamic = "force-dynamic";

// Daftar putih eksplisit: field di luar ini dibuang sebelum sampai ke aksi.
const FIELD_VERIFIKASI = ["bulan", "tahun", "jenisTabel", "centang"] as const;

/**
 * POST /api/kasubag/kirim/verifikasi-tabel - centang "tabel sudah diperiksa". satuanKerja diambil aksi dari sesi.
 *
 * Route Handler JSON (bukan Server Action) karena firewall jaringan memblokir
 * body multipart Server Action. Otorisasi, kunci periode, dan validasi bisnis
 * seluruhnya tetap di aksi; route hanya menyalin field putih ke FormData.
 * Isi body tidak pernah di-log.
 */
export async function POST(req: NextRequest) {
  let body: Map<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Format permintaan tidak valid." } satisfies KirimFormState, {
        status: 400,
      });
    }
    body = new Map(Object.entries(parsed));
  } catch {
    return NextResponse.json({ error: "Format permintaan tidak valid." } satisfies KirimFormState, {
      status: 400,
    });
  }

  const formData = new FormData();
  for (const field of FIELD_VERIFIKASI) {
    const value = body.get(field);
    if (typeof value === "string" || typeof value === "number") {
      formData.set(field, String(value));
    }
  }

  try {
    const hasil = await setVerifikasiTabelAction({}, formData);
    return NextResponse.json(hasil, { status: hasil.error ? 400 : 200 });
  } catch (err) {
    const { ref, info } = catatGalat("rekap-verifikasi", err);
    return NextResponse.json({ error: pesanGalatAwam(info, ref, "Gagal menyimpan centang pemeriksaan") } satisfies KirimFormState, {
      status: 500,
    });
  }
}
