import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { ambilUserSesi } from "../../../../../auth/getSessionAccount";
import { canKonfigurasiAdapter, type AuthUser } from "../../../../../auth/permissions";
import { periksaSinkronPegawai } from "../../../../../jobs/sinkronPegawaiSiap";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await ambilUserSesi();
  if (!user) {
    return NextResponse.json({ error: "Sesi login sudah habis - silakan login ulang." }, { status: 401 });
  }
  const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
  if (!canKonfigurasiAdapter(authUser)) {
    return NextResponse.json({ error: "Hanya Admin yang boleh menjalankan sinkronisasi pegawai." }, { status: 403 });
  }

  try {
    const rencana = await periksaSinkronPegawai(prisma);
    return NextResponse.json({ rencana });
  } catch (e) {
    return NextResponse.json({
      error: `Gagal membaca SIAP: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
