import { NextResponse, type NextRequest } from "next/server";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { canLihatStatusLayananTte } from "@/auth/permissions";
import { periksaKoneksiBsre } from "@/lib/tte/koneksiBsre";

export const dynamic = "force-dynamic";

const TANPA_CACHE = { "Cache-Control": "no-store" };

/**
 * Status koneksi layanan BSrE untuk indikator di layar. Hanya keadaan, sebab,
 * dan waktu periksa - tidak pernah alamat server, NIK, maupun pesan galat.
 */
export async function GET(req: NextRequest) {
  const user = await ambilUserSesi();
  if (!user) {
    return NextResponse.json(
      { error: "Sesi tidak ditemukan." },
      { status: 401, headers: TANPA_CACHE }
    );
  }
  if (!canLihatStatusLayananTte(user)) {
    return NextResponse.json(
      { error: "Tidak berwenang." },
      { status: 403, headers: TANPA_CACHE }
    );
  }

  const paksa = req.nextUrl.searchParams.get("paksa") === "1";
  try {
    const { keadaan, sebab, diperiksaPada } = await periksaKoneksiBsre({ paksa });
    return NextResponse.json(
      { keadaan, ...(sebab ? { sebab } : {}), diperiksaPada },
      { headers: TANPA_CACHE }
    );
  } catch {
    return NextResponse.json(
      { keadaan: "TIDAK_DIKETAHUI", diperiksaPada: new Date().toISOString() },
      { headers: TANPA_CACHE }
    );
  }
}
