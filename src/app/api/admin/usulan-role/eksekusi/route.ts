import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "../../../../../lib/prisma";
import { ambilUserSesi } from "../../../../../auth/getSessionAccount";
import { canEksekusiPerubahanRole, type AuthUser } from "../../../../../auth/permissions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const admin = await ambilUserSesi();
  if (!admin) {
    return NextResponse.json({ error: "Sesi login sudah habis - silakan login ulang." }, { status: 401 });
  }
  const authUser: AuthUser = { nip: admin.nip, role: admin.role, satuanKerja: admin.satuanKerja, aktif: admin.aktif };
  if (!canEksekusiPerubahanRole(authUser)) {
    return NextResponse.json({ error: "Role kamu tidak berwenang mengeksekusi usulan perubahan role." }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const usulanId = String(body.usulanId ?? "");
  const keputusan = String(body.keputusan ?? "");
  if (keputusan !== "EKSEKUSI" && keputusan !== "TOLAK") {
    return NextResponse.json({ error: "Keputusan tidak valid." }, { status: 400 });
  }

  const usulan = await prisma.usulanPerubahanRole.findUnique({ where: { id: usulanId }, include: { user: true } });
  if (!usulan) return NextResponse.json({ error: "Usulan tidak ditemukan." }, { status: 404 });
  if (usulan.status !== "MENUNGGU") {
    return NextResponse.json({ error: `Usulan ini berstatus ${usulan.status} - sudah diputuskan sebelumnya.` }, { status: 400 });
  }

  if (keputusan === "TOLAK") {
    await prisma.usulanPerubahanRole.update({
      where: { id: usulanId },
      data: { status: "DITOLAK", diputuskanOlehId: admin.id, diputuskanPada: new Date() },
    });
    revalidatePath("/admin/usulan-role");
    return NextResponse.json({ success: `Usulan perubahan role ${usulan.user?.nama ?? ""} ditolak.` });
  }

  const butuhSatuanKerja = usulan.roleDiusulkan === "KASUBAG_TU";
  const satuanKerjaInput = String(body.satuanKerja ?? "").trim();
  if (butuhSatuanKerja && !satuanKerjaInput) {
    return NextResponse.json(
      { error: "Unit kerja wajib diisi buat role Kasubag TU - tanpa itu akunnya tidak bisa melihat data apa pun." },
      { status: 400 }
    );
  }
  const satuanKerjaBaru = butuhSatuanKerja ? satuanKerjaInput : null;

  await prisma.$transaction([
    prisma.usulanPerubahanRole.update({
      where: { id: usulanId },
      data: { status: "DIEKSEKUSI", diputuskanOlehId: admin.id, diputuskanPada: new Date() },
    }),
    prisma.user.update({
      where: { id: usulan.userId },
      data: { role: usulan.roleDiusulkan, satuanKerja: satuanKerjaBaru },
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "app_user",
        entitasId: usulan.userId,
        aksi: "UPDATE",
        aktor: admin.nip,
        dataSebelum: { role: usulan.roleSaatIni, satuanKerja: usulan.user?.satuanKerja },
        dataSesudah: {
          role: usulan.roleDiusulkan,
          satuanKerja: satuanKerjaBaru,
          sumber: "Eksekusi Usulan Perubahan Role",
          usulanId,
        },
      },
    }),
  ]);

  revalidatePath("/admin/usulan-role");
  return NextResponse.json({
    success: `Usulan perubahan role ${usulan.user?.nama ?? ""} -> ${usulan.roleDiusulkan} berhasil dieksekusi.`,
  });
}
