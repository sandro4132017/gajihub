"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../../auth/permissions";

export interface UbahAssignmentRoleFormState {
  error?: string;
  success?: string;
}

const ROLE_VALID: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

/**
 * Kelola assignment role LANGSUNG (canKelolaAssignmentRole) - BEDA dari
 * eksekusi usulan PPABP (canEksekusiPerubahanRole, lihat
 * ../usulan-role/actions.ts): ini jalur pintas Admin buat ubah role/
 * satuanKerja/status aktif akun langsung TANPA lewat UsulanPerubahanRole,
 * dipakai buat kebutuhan administratif (nonaktifkan akun, koreksi
 * kesalahan input, dst) - bukan alur "usul-lalu-eksekusi" yang formal.
 * TIDAK membuat baris UsulanPerubahanRole ataupun approval log - cuma
 * dicatat ke AuditTrail buat jejak.
 */
export async function ubahAssignmentRoleAction(
  _state: UbahAssignmentRoleFormState,
  formData: FormData
): Promise<UbahAssignmentRoleFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const admin = await ambilUserSesi();
    if (!admin) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: admin.nip, role: admin.role, satuanKerja: admin.satuanKerja, aktif: admin.aktif };
    if (!canKelolaAssignmentRole(authUser)) {
      return { error: "Role kamu tidak berwenang mengelola assignment role." };
    }

    const targetUserId = String(formData.get("targetUserId") ?? "");
    const role = String(formData.get("role") ?? "") as Role;
    const satuanKerjaRaw = String(formData.get("satuanKerja") ?? "").trim();
    const aktif = formData.get("aktif") === "on";
    // Role TAMBAHAN (checkbox, boleh lebih dari satu) - buat kemudahan
    // testing lintas role. Role utama dibuang dari daftar supaya tidak
    // dobel, lihat daftarRoleTersedia().
    const rolesTambahan = formData
      .getAll("rolesTambahan")
      .map((r) => String(r) as Role)
      .filter((r) => ROLE_VALID.includes(r) && r !== role);

    if (!targetUserId || !ROLE_VALID.includes(role)) {
      return { error: "Akun dan role tujuan wajib diisi dengan benar." };
    }

    const target = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) return { error: "Akun tidak ditemukan." };

    const dataSebelum = {
      role: target.role,
      rolesTambahan: target.rolesTambahan,
      satuanKerja: target.satuanKerja,
      aktif: target.aktif,
    };
    // satuanKerja dipertahankan kalau KASUBAG_TU ada di role utama ATAU role
    // tambahan - kalau tidak, akun itu bakal "buta unit" begitu ganti ke role
    // Kasubag TU (satu akun cuma punya SATU satuanKerja, lihat model User).
    const butuhSatuanKerja = role === "KASUBAG_TU" || rolesTambahan.includes("KASUBAG_TU");
    const satuanKerja = butuhSatuanKerja ? satuanKerjaRaw || target.satuanKerja : null;

    if (butuhSatuanKerja && !satuanKerja) {
      return { error: "Satuan kerja wajib diisi kalau akun ini punya role Kasubag TU." };
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: targetUserId },
        data: { role, rolesTambahan, satuanKerja, aktif },
      }),
      prisma.auditTrail.create({
        data: {
          entitas: "app_user",
          entitasId: targetUserId,
          aksi: "UPDATE",
          aktor: admin.nip,
          dataSebelum,
          dataSesudah: { role, rolesTambahan, satuanKerja, aktif, sumber: "Kelola assignment role (Admin)" },
        },
      }),
    ]);

    revalidatePath("/admin/role-assignment");
    const catatanTambahan = rolesTambahan.length > 0 ? ` (+ role tambahan: ${rolesTambahan.join(", ")})` : "";
    return { success: `Assignment role ${target.nama} diperbarui jadi ${role}${catatanTambahan}.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

export interface BuatAkunBaruFormState {
  error?: string;
  success?: string;
}

/**
 * Buat akun User BARU langsung dari data Pegawai (5.069 baris), TANPA
 * lewat alur usulan PPABP (UsulanPerubahanRole butuh User yang SUDAH ada -
 * tidak bisa dipakai buat pegawai yang belum pernah punya akun otorisasi
 * sama sekali). Dipakai kalau ada nodin/arahan Pimpinan yang perlu
 * dieksekusi langsung (mis. pegawai baru dilantik jadi Kasubag TU) tanpa
 * menunggu PPABP mengusulkan dulu. Password = NIP (konvensi login yang
 * sama dengan seedUsers.ts).
 */
export async function buatAkunBaruAction(
  _state: BuatAkunBaruFormState,
  formData: FormData
): Promise<BuatAkunBaruFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const admin = await ambilUserSesi();
    if (!admin) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: admin.nip, role: admin.role, satuanKerja: admin.satuanKerja, aktif: admin.aktif };
    if (!canKelolaAssignmentRole(authUser)) {
      return { error: "Role kamu tidak berwenang membuat akun baru." };
    }

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const role = String(formData.get("role") ?? "") as Role;
    const satuanKerjaRaw = String(formData.get("satuanKerja") ?? "").trim();

    if (!pegawaiId || !ROLE_VALID.includes(role)) {
      return { error: "Pegawai dan role tujuan wajib diisi dengan benar." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };

    const existing = await prisma.user.findUnique({ where: { nip: pegawai.nip } });
    if (existing) {
      return { error: `${pegawai.nama} sudah punya akun (role saat ini: ${existing.role}) - ubah lewat tabel di atas, bukan buat baru.` };
    }

    const satuanKerja = role === "KASUBAG_TU" ? satuanKerjaRaw || pegawai.satuanKerja : null;

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { nip: pegawai.nip, nama: pegawai.nama, role, satuanKerja, aktif: true },
      });
      await tx.auditTrail.create({
        data: {
          entitas: "app_user",
          entitasId: user.id,
          aksi: "CREATE",
          aktor: admin.nip,
          dataSesudah: { nip: user.nip, nama: user.nama, role, satuanKerja, sumber: "Buat akun baru (Admin, tanpa usulan PPABP)" },
        },
      });
      return user;
    });

    revalidatePath("/admin/role-assignment");
    return { success: `Akun ${created.nama} (NIP ${created.nip}) dibuat dengan role ${role}. Login pakai NIP sebagai password.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
