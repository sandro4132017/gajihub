import { NextResponse, type NextRequest } from "next/server";
import {
  tarikPresensiEpresensiAction,
  type SinkronPresensiFormState,
} from "../../../../tukin/presensi/actionsSync";

export const dynamic = "force-dynamic";

/**
 * Route Handler JSON untuk sinkronisasi ("Tarik Data Presensi") e-Presensi.
 *
 * Dibuat dengan pola JSON POST biasa (sama seperti /api/auth/login) agar
 * 100% kebal terhadap masalah `An unexpected response was received from the server`
 * (HTTP 500 error boundary React Server Action) di balik reverse proxy VPS / FortiWeb
 * Pusdatik pada domain gajihub.kemnaker.go.id.
 */
export async function POST(req: NextRequest) {
  try {
    let body: { bulan?: number | string; tahun?: number | string } = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Format permintaan tidak valid." } satisfies SinkronPresensiFormState,
        { status: 400 }
      );
    }

    const formData = new FormData();
    formData.set("bulan", String(body.bulan ?? ""));
    formData.set("tahun", String(body.tahun ?? ""));

    const hasil = await tarikPresensiEpresensiAction({}, formData);
    return NextResponse.json(hasil, { status: hasil.error ? 400 : 200 });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Gagal menarik data dari e-Presensi: ${
          err instanceof Error ? err.message : String(err)
        }`,
      } satisfies SinkronPresensiFormState,
      { status: 500 }
    );
  }
}
