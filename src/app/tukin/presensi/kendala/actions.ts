"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import { ambilUserSesi } from "../../../../auth/getSessionAccount";
import {
  canKelolaKendalaEpresensi,
  canKelolaKendalaSeKementerian,
  type AuthUser,
} from "../../../../auth/permissions";
import { tglTampil } from "../../../tanggalTampil";

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

/**
 * Tanggal datang sebagai TIGA field (hari, bulan, tahun), bukan satu string
 * ISO dari `<input type="date">`. Alasannya ada di KendalaForms.tsx: urutan
 * tampil field itu ditentukan locale BROWSER, jadi tidak bisa dijamin
 * hari-dulu. Yang dirakit di sini tetap bentuk ISO yang sama, supaya
 * `tanggalUtcDariIso()` - termasuk penolakan tanggal yang tidak ada di
 * kalender - berlaku persis seperti sebelumnya.
 */
function isoDariBagian(formData: FormData): string {
  const hari = String(formData.get("tanggalHari") ?? "").trim();
  const bulan = String(formData.get("tanggalBulan") ?? "").trim();
  const tahun = String(formData.get("tanggalTahun") ?? "").trim();
  if (!hari || !bulan || !tahun) return "";
  return `${tahun}-${bulan.padStart(2, "0")}-${hari.padStart(2, "0")}`;
}

export async function tandaiKendalaAction(
  _state: KendalaFormState,
  formData: FormData
): Promise<KendalaFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  const authUser = keAuthUser(user);
  if (!canKelolaKendalaEpresensi(authUser)) {
    return { error: "Kamu tidak berwenang menandai tanggal kendala e-Presensi." };
  }

  const tanggalIso = isoDariBagian(formData);
  const tanggal = tanggalUtcDariIso(tanggalIso);
  if (!tanggal) {
    // Dua sebab yang beda tindak lanjutnya: belum dipilih, atau dipilih tapi
    // hari itu memang tidak ada di bulan tersebut (31 Februari) - daftar hari
    // di form sengaja selalu 1-31 supaya tetap jalan tanpa JavaScript.
    return {
      error: tanggalIso
        ? `Tanggal ${tglTampil(tanggalIso)} tidak ada di kalender - periksa lagi hari dan bulannya.`
        : "Tanggal belum lengkap - pilih hari, bulan, dan tahunnya.",
    };
  }

  const alasan = String(formData.get("alasan") ?? "").trim();
  // Alasan WAJIB. Satu baris ini yang dibaca auditor ketika bertanya kenapa
  // potongan sehari hilang untuk ratusan orang - penanda tanpa alasan sama
  // saja dengan tidak ada penjelasan sama sekali.
  if (alasan.length < 10) {
    return { error: "Alasan wajib diisi minimal 10 karakter - ini yang dibaca kalau angkanya dipertanyakan." };
  }

  // CAKUPAN DITENTUKAN SERVER, BUKAN FORM.
  //
  // Kasubag TU DIPAKSA ke unitnya sendiri - isian `satuanKerja` dari form
  // tidak dipercaya sama sekali. Kalau dipercaya, satu petugas unit bisa
  // mengirim nilai kosong dan membatalkan potongan SE-KEMENTERIAN; itu
  // persis batas yang dijaga waktu kewenangan ini dipindah ke unit.
  //
  // Cuma ADMIN yang boleh memilih, termasuk memilih cakupan kementerian.
  const satkerRaw = String(formData.get("satuanKerja") ?? "").trim();
  const satuanKerja =
    authUser.role === "ADMIN" ? (satkerRaw === "" ? null : satkerRaw) : (authUser.satuanKerja ?? null);

  if (satuanKerja === null && !canKelolaKendalaSeKementerian(authUser)) {
    return {
      error:
        "Penanda seluruh kementerian hanya boleh dibuat Admin. Akunmu menandai untuk satuan kerjanya sendiri, " +
        "dan satuan kerja akun ini belum diisi - minta Admin melengkapinya.",
    };
  }
  if (satuanKerja !== null && !canKelolaKendalaEpresensi(authUser, satuanKerja)) {
    return { error: `Di luar kewenangan kamu (${satuanKerja}).` };
  }

  // Penanda se-kementerian sudah mencakup semuanya - menambah penanda per
  // satker di atasnya cuma bikin dua baris yang artinya sama.
  const sudahSeKementerian = await prisma.kendalaEpresensi.findFirst({
    where: { tanggal, satuanKerja: null },
  });
  if (sudahSeKementerian) {
    return {
      error: `Tanggal ${tglTampil(tanggalIso)} sudah ditandai kendala untuk SELURUH kementerian - tidak perlu ditandai lagi per satuan kerja.`,
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
      `Tanggal ${tglTampil(tanggal.toISOString().slice(0, 10))} ditandai kendala e-Presensi` +
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
  const authUser = keAuthUser(user);

  const id = String(formData.get("id") ?? "");
  const baris = await prisma.kendalaEpresensi.findUnique({ where: { id } });
  if (!baris) return { error: "Penanda itu sudah tidak ada." };

  // DIPERIKSA TERHADAP CAKUPAN BARIS YANG DISENTUH, bukan sekadar "boleh
  // mencabut sesuatu". Mencabut penanda membuat potongan Pasal 13 ayat (2)
  // BERLAKU LAGI untuk semua orang di tanggal itu - kalau barisnya milik
  // unit lain, itu menurunkan bayaran orang yang bukan urusannya.
  const boleh = baris.satuanKerja
    ? canKelolaKendalaEpresensi(authUser, baris.satuanKerja)
    : canKelolaKendalaSeKementerian(authUser);
  if (!boleh) {
    return {
      error: baris.satuanKerja
        ? `Penanda itu milik ${baris.satuanKerja} - di luar kewenangan kamu.`
        : "Penanda seluruh kementerian hanya boleh dicabut Admin.",
    };
  }

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
      `Penanda ${tglTampil(baris.tanggal.toISOString().slice(0, 10))} dicabut. ` +
      "Potongan Pasal 13 ayat (2) di tanggal itu akan berlaku lagi setelah presensi ditarik ulang.",
  };
}
