import { NextResponse, type NextRequest } from "next/server";
import {
  cekStatusTteAction,
  buatDraftSptjmAction,
  signSptjmPpkAction,
} from "../../tte/actions";
import type { JenisSptjm } from "../../../lib/tte/sptjmTypes";

export const dynamic = "force-dynamic";

/**
 * Route Handler JSON untuk seluruh operasi TTE BSrE (cek status NIK, pratinjau draft,
 * dan penandatanganan SPTJM).
 *
 * Menggunakan JSON POST standar agar bebas dari error `An unexpected response was
 * received from the server` (HTTP 500 Server Action) di balik reverse proxy VPS / FortiWeb.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "status") {
      const nik = typeof body.nik === "string" ? body.nik : undefined;
      const res = await cekStatusTteAction(nik);
      return NextResponse.json(res);
    }

    if (action === "draft") {
      const res = await buatDraftSptjmAction({
        jenis: (body.jenis as JenisSptjm) || "SPTJM_TUKIN",
        bulan: Number(body.bulan),
        tahun: Number(body.tahun),
        nomorDokumen: body.nomorDokumen,
        satuanKerja: body.satuanKerja,
      });
      return NextResponse.json(res);
    }

    if (action === "sign") {
      const formData = new FormData();
      for (const [k, v] of Object.entries(body)) {
        if (k !== "action" && v !== undefined && v !== null) {
          formData.set(k, String(v));
        }
      }
      const res = await signSptjmPpkAction({}, formData);
      return NextResponse.json(res);
    }

    return NextResponse.json({ error: "Aksi TTE tidak dikenali." }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Terjadi kendala pada layanan TTE: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }
}

