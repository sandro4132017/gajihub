"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import { ambilUserSesi } from "../../../../auth/getSessionAccount";
import { canKelolaKendalaEpresensi, type AuthUser } from "../../../../auth/permissions";

export interface KendalaFormState {
  error?: string;
  sukses?: string;
}

function keAuthUser(u: { nip: string; role: AuthUser["role"]; satuanKerja: string | null; aktif: boolean }): AuthUser {
  return { nip: u.nip, role: u.role, satuanKerja: u.satuanKerja, aktif: u.aktif };
}

/** "2026-07-15" -> Date tengah malam UTC (konvensi PresensiHarian.tanggal). */
function tanggalUtcDariIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  // Tolak tanggal yang tidak ada (mis. 2026-02-31 yang akan "meluber" ke Maret).
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

export async function tandaiKendalaAction(
  _state: KendalaFormState,
  formData: FormData
): Promise<KendalaFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  if (!canKelolaKendalaEpresensi(keAuthUser(user))) {
    return { error: "Kamu tidak berwenang menandai tanggal kendala e-Presensi." };
  }

  const tanggal = tanggalUtcDariIso(String(formData.get("tanggal") ?? ""));
  if (!tanggal) return { error: "Tanggal tidak valid." };

  const alasan = String(formData.get("alasan") ?? "").trim();
  // Alasan WAJIB. Satu baris ini yang dibaca auditor ketika bertanya kenapa
  // potongan sehari hilang untuk ratusan orang - penanda tanpa alasan sama
  // saja dengan tidak ada penjelasan sama sekali.
  if (alasan.length < 10) {
    return { error: "Alasan wajib diisi minimal 10 karakter - ini yang dibaca kalau angkanya dipertanyakan." };
  }

  const satkerRaw = String(formData.get("satuanKerja") ?? "").trim();
  const satuanKerja = satkerRaw === "" ? null : satkerRaw;

  // Penanda se-kementerian sudah mencakup semuanya - menambah penanda per
  // satker di atasnya cuma bikin dua baris yang artinya sama.
  const sudahSeKementerian = await prisma.kendalaEpresensi.findFirst({
    where: { tanggal, satuanKerja: null },
  });
  if (sudahSeKementerian) {
    return {
      error: `Tanggal ${String(formData.get("tanggal"))} sudah ditandai kendala untuk SELURUH kementerian - tidak perlu ditandai lagi per satuan kerja.`,
    };
  }
  const sudahAda = await prisma.kendalaEpresensi.findFirst({ where: { tanggal, satuanKerja } });
  if (sudahAda) return { error: "Tanggal itu sudah ditandai untuk cakupan yang sama." };

  await prisma.$transaction([
    prisma.kendalaEpresensi.create({
      data: { tanggal, satuanKerja, alasan, ditandaiOlehId: user.id },
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "kendala_epresensi",
        entitasId: tanggal.toISOString().slice(0, 10),
        aksi: "CREATE",
        aktor: user.nip,
        // Penanda se-kementerian tetap NULL: itu keputusan tingkat kementerian,
        // bukan aktivitas satu unit.
        satuanKerja,
        dataSesudah: {
          tanggal: tanggal.toISOString().slice(0, 10),
          satuanKerja,
          alasan,
          sumber: "Tandai kendala e-Presensi (Pasal 10 ayat (2))",
        },
      },
    }),
  ]);

  revalidatePath("/tukin/presensi/kendala");
  revalidatePath("/tukin/presensi");
  return {
    sukses:
      `Tanggal ${tanggal.toISOString().slice(0, 10)} ditandai kendala e-Presensi` +
      `${satuanKerja ? ` untuk ${satuanKerja}` : " (seluruh kementerian)"}. ` +
      "Angkanya BELUM berubah - tarik ulang presensi periode itu supaya berlaku.",
  };
}

export async function cabutKendalaAction(
  _state: KendalaFormState,
  formData: FormData
): Promise<KendalaFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  if (!canKelolaKendalaEpresensi(keAuthUser(user))) {
    return { error: "Kamu tidak berwenang mencabut penanda kendala e-Presensi." };
  }

  const id = String(formData.get("id") ?? "");
  const baris = await prisma.kendalaEpresensi.findUnique({ where: { id } });
  if (!baris) return { error: "Penanda itu sudah tidak ada." };

  await prisma.$transaction([
    prisma.kendalaEpresensi.delete({ where: { id } }),
    prisma.auditTrail.create({
      data: {
        entitas: "kendala_epresensi",
        entitasId: baris.tanggal.toISOString().slice(0, 10),
        aksi: "DELETE",
        aktor: user.nip,
        // Isinya disalin lengkap - baris aslinya sudah tidak ada lagi, jadi
        // ini satu-satunya jejak yang tersisa kalau nanti dipertanyakan.
        dataSebelum: {
          tanggal: baris.tanggal.toISOString().slice(0, 10),
          satuanKerja: baris.satuanKerja,
          alasan: baris.alasan,
          ditandaiPada: baris.ditandaiPada.toISOString(),
        },
      },
    }),
  ]);

  revalidatePath("/tukin/presensi/kendala");
  revalidatePath("/tukin/presensi");
  return {
    sukses:
      `Penanda ${baris.tanggal.toISOString().slice(0, 10)} dicabut. ` +
      "Potongan Pasal 13 ayat (2) di tanggal itu akan berlaku lagi setelah presensi ditarik ulang.",
  };
}
