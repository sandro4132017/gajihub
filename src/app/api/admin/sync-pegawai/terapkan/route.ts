import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../lib/prisma";
import { ambilUserSesi } from "../../../../../auth/getSessionAccount";
import { canKonfigurasiAdapter, type AuthUser } from "../../../../../auth/permissions";
import { terapkanSinkronPegawai } from "../../../../../jobs/sinkronPegawaiSiap";

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
    const hasil = await terapkanSinkronPegawai(prisma, null, user.id);
    await prisma.auditTrail.create({
      data: {
        entitas: "sinkronisasi_pegawai",
        entitasId: `siap-${new Date().toISOString().slice(0, 10)}`,
        aksi: "SYNC",
        aktor: user.nip,
        satuanKerja: null,
        dataSesudah: {
          sumber: hasil.rencana.sumber,
          tersimpan: hasil.tersimpan,
          pegawaiBaru: hasil.rencana.pegawaiBaru.length,
          statusDiperbarui: hasil.statusDiperbarui,
          gantiKelasJabatan: hasil.rencana.gantiKelasJabatan.length,
          gantiJabatan: hasil.rencana.gantiJabatan.length,
          perubahanTercatat: hasil.perubahanTercatat,
          pindahUnit: hasil.rencana.pindahUnit.map((c) => ({
            nip: c.nip,
            nama: c.nama,
            dari: c.dari,
            ke: c.ke,
          })),
        },
      },
    });

    revalidatePath("/admin/sistem");
    return NextResponse.json({ hasil });
  } catch (e) {
    return NextResponse.json({
      error: `Sinkronisasi gagal: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
}
