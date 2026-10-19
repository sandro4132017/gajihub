import { NextResponse, type NextRequest } from "next/server";
import {
  kalkulasiMassalTukinUangMakanAction,
  type KalkulasiMassalFormState,
} from "../../../kasubag/kalkulasi/actions";

export const dynamic = "force-dynamic";

const FIELD_KALKULASI = [
  "satuanKerja",
  "periodeBulan",
  "periodeTahun",
  "lanjutkanTanpaLengkap",
] as const;

export async function POST(req: NextRequest) {
  let body: Map<string, unknown>;

  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Format permintaan kalkulasi tidak valid." } satisfies KalkulasiMassalFormState,
        { status: 400 }
      );
    }
    body = new Map(Object.entries(parsed));
  } catch {
    return NextResponse.json(
      { error: "Format permintaan kalkulasi tidak valid." } satisfies KalkulasiMassalFormState,
      { status: 400 }
    );
  }

  const formData = new FormData();
  for (const field of FIELD_KALKULASI) {
    const value = body.get(field);
    if (typeof value === "string" || typeof value === "number") {
      formData.set(field, String(value));
    }
  }

  try {
    const hasil = await kalkulasiMassalTukinUangMakanAction({}, formData);
    return NextResponse.json(hasil, { status: hasil.error ? 400 : 200 });
  } catch {
    return NextResponse.json(
      { error: "Terjadi kendala server saat menjalankan kalkulasi. Periksa hasil periode sebelum mencoba lagi." },
      { status: 500 }
    );
  }
}
