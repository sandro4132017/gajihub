import { NextResponse, type NextRequest } from "next/server";
import {
  cekStatusTteAction,
  buatDraftSptjmAction,
  signSptjmUnitAction,
  hapusDraftSptjmAction,
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

    if (action === "hapus-draft") {
      // Membersihkan draft SPTJM supaya bisa disusun ulang. Aksinya sendiri
      // MENOLAK dokumen yang sudah TERTANDATANGANI - lihat hapusDraftSptjmAction.
      const res = await hapusDraftSptjmAction({
        jenis: (body.jenis as JenisSptjm) || "SPTJM_TUKIN",
        bulan: Number(body.bulan),
        tahun: Number(body.tahun),
      });
      return NextResponse.json(res);
    }

    if (action === "sign") {
      // HANYA FIELD INI YANG DITERIMA DARI KLIEN.
      //
      // Sebelumnya SELURUH isi JSON disalin ke FormData apa adanya, jadi
      // penyerang bisa menitipkan satuanKerja, namaPenandatangan,
      // nipPenandatangan, atau jabatanPenandatangan dan menandatangani SPTJM
      // unit orang lain atas nama orang lain. Keempatnya sekarang diturunkan
      // di server dari sesi (lihat signSptjmUnitAction), dan daftar putih ini
      // memastikan tidak ada field baru yang lolos hanya karena ditambahkan
      // di sisi klien.
      const FIELD_DIIZINKAN = [
        "jenis",
        "bulan",
        "tahun",
        "nomorDokumen",
        "nik",
        "passphrase",
      ] as const;
      const formData = new FormData();
      for (const k of FIELD_DIIZINKAN) {
        const v = (body as Record<string, unknown>)[k];
        if (v !== undefined && v !== null) formData.set(k, String(v));
      }
      const res = await signSptjmUnitAction({}, formData);
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

