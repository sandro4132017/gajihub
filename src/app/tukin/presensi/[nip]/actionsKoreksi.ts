"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../../lib/prisma";
import { ambilUserSesi } from "../../../../auth/getSessionAccount";
import { canUploadRekapPresensi, type AuthUser } from "../../../../auth/permissions";

/**
 * KOREKSI JAM PRESENSI SATU HARI - Pasal 10 ayat (2) Permenaker 15/2024.
 *
 * Alur nyatanya: e-Presensi error -> pegawai memotret dirinya beserta geotag
 * & jam -> dikirim ke WhatsApp petugas absensi -> petugas memperbaikinya di
 * sini.
 *
 * TIGA PENGAMAN, dan ketiganya menentukan boleh/tidaknya fitur ini ada:
 *
 * 1. HANYA di tanggal yang sudah ditandai kendala e-Presensi. Ini yang
 *    membedakannya dari "edit presensi bebas" - invariant lama
 *    (`canEditPresensiKinerjaLangsung` = false untuk SEMUA role) tetap utuh.
 *    Tanpa syarat ini, siapa pun yang berwenang meng-upload presensi bisa
 *    mengubah jam hari biasa tanpa ada yang tahu.
 * 2. Otorisasi dicek terhadap satuan kerja PEGAWAI YANG DIKOREKSI, bukan
 *    terhadap yang sedang dibuka - id dari form tidak dipercaya.
 * 3. Setiap koreksi menulis AuditTrail lengkap dengan nilai SEBELUM (jam asli
 *    dari e-Presensi) dan SESUDAH. Angka hasil ketikan manusia tidak bisa
 *    menyamar sebagai angka dari e-Presensi.
 */

export interface KoreksiJamFormState {
  error?: string;
  sukses?: string;
}

function keAuthUser(u: { nip: string; role: AuthUser["role"]; satuanKerja: string | null; aktif: boolean }): AuthUser {
  return { nip: u.nip, role: u.role, satuanKerja: u.satuanKerja, aktif: u.aktif };
}

function tanggalUtcDariIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

/** "07:15" -> timestamp UTC di tanggal itu. Kosong -> null (tidak dikoreksi). */
function waktuDariJam(tanggal: Date, jam: string): Date | null | undefined {
  const teks = jam.trim();
  if (teks === "") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(teks);
  if (!m) return undefined; // penanda "tidak valid"
  const h = Number(m[1]);
  const mnt = Number(m[2]);
  if (h > 23 || mnt > 59) return undefined;
  return new Date(Date.UTC(tanggal.getUTCFullYear(), tanggal.getUTCMonth(), tanggal.getUTCDate(), h, mnt));
}

export async function koreksiJamPresensiAction(
  _state: KoreksiJamFormState,
  formData: FormData
): Promise<KoreksiJamFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  const authUser = keAuthUser(user);

  const nip = String(formData.get("nip") ?? "").trim();
  const tanggal = tanggalUtcDariIso(String(formData.get("tanggal") ?? ""));
  if (!tanggal) return { error: "Tanggal tidak valid." };

  const pegawai = await prisma.pegawai.findUnique({ where: { nip } });
  if (!pegawai) return { error: "Pegawai tidak ditemukan." };

  // Pengaman 2 - dicek terhadap satuan kerja pegawai yang disentuh.
  if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja ?? "")) {
    return { error: `Di luar kewenangan kamu (pegawai ${pegawai.satuanKerja ?? "tanpa satuan kerja"}).` };
  }

  // Pengaman 1 - tanggalnya harus sudah dinyatakan bermasalah.
  const kendala = await prisma.kendalaEpresensi.findFirst({
    where: {
      tanggal,
      OR: [{ satuanKerja: null }, { satuanKerja: pegawai.satuanKerja ?? undefined }],
    },
  });
  if (!kendala) {
    return {
      error:
        `Tanggal ${String(formData.get("tanggal"))} belum ditandai sebagai kendala e-Presensi, jadi jamnya tidak boleh ` +
        "diubah. Minta PPABP menandai tanggal itu dulu di halaman Kendala e-Presensi.",
    };
  }

  const jamMasuk = waktuDariJam(tanggal, String(formData.get("jamMasuk") ?? ""));
  const jamKeluar = waktuDariJam(tanggal, String(formData.get("jamKeluar") ?? ""));
  if (jamMasuk === undefined || jamKeluar === undefined) {
    return { error: "Format jam harus HH:MM, contoh 07:15 atau 16:00." };
  }
  if (jamMasuk === null && jamKeluar === null) {
    return { error: "Isi minimal satu jam - kalau keduanya kosong tidak ada yang dikoreksi." };
  }
  if (jamMasuk && jamKeluar && jamKeluar <= jamMasuk) {
    return { error: "Jam pulang harus lebih lambat dari jam masuk." };
  }

  const alasan = String(formData.get("alasan") ?? "").trim();
  if (alasan.length < 10) {
    return {
      error:
        "Alasan wajib diisi minimal 10 karakter - sebutkan dasar koreksinya (mis. lapor via WhatsApp + foto bergeotag jam 07.15).",
    };
  }

  const sebelum = await prisma.presensiHarian.findFirst({
    where: { pegawaiId: pegawai.id, tanggal },
    select: { jamMasuk: true, jamKeluar: true, statusKehadiran: true },
  });
  const lama = await prisma.koreksiPresensiHarian.findUnique({
    where: { pegawaiId_tanggal: { pegawaiId: pegawai.id, tanggal } },
  });

  const jm = (d: Date | null | undefined) =>
    d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : null;

  await prisma.$transaction([
    prisma.koreksiPresensiHarian.upsert({
      where: { pegawaiId_tanggal: { pegawaiId: pegawai.id, tanggal } },
      create: { pegawaiId: pegawai.id, tanggal, jamMasuk, jamKeluar, alasan, dikoreksiOlehId: user.id },
      update: { jamMasuk, jamKeluar, alasan, dikoreksiOlehId: user.id, dikoreksiPada: new Date() },
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "koreksi_presensi_harian",
        entitasId: `${nip}-${tanggal.toISOString().slice(0, 10)}`,
        aksi: lama ? "UPDATE" : "CREATE",
        aktor: user.nip,
        satuanKerja: pegawai.satuanKerja,
        dataSebelum: {
          // Jam ASLI dari e-Presensi ikut dicatat - inilah yang membedakan
          // "diperbaiki" dari "dikarang".
          jamMasukEpresensi: jm(sebelum?.jamMasuk),
          jamKeluarEpresensi: jm(sebelum?.jamKeluar),
          status: sebelum?.statusKehadiran ?? null,
          ...(lama ? { koreksiSebelumnya: { jamMasuk: jm(lama.jamMasuk), jamKeluar: jm(lama.jamKeluar), alasan: lama.alasan } } : {}),
        },
        dataSesudah: {
          jamMasuk: jm(jamMasuk),
          jamKeluar: jm(jamKeluar),
          alasan,
          dasarKendala: { tanggal: tanggal.toISOString().slice(0, 10), alasan: kendala.alasan },
          sumber: "Koreksi jam presensi (Pasal 10 ayat (2))",
        },
      },
    }),
  ]);

  revalidatePath(`/tukin/presensi/${nip}`);
  return {
    sukses:
      `Jam ${tanggal.toISOString().slice(0, 10)} dikoreksi (masuk ${jm(jamMasuk) ?? "tetap"}, pulang ${jm(jamKeluar) ?? "tetap"}). ` +
      "Angkanya BELUM berubah - tarik ulang presensi periode ini supaya berlaku.",
  };
}

export async function hapusKoreksiJamAction(
  _state: KoreksiJamFormState,
  formData: FormData
): Promise<KoreksiJamFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };

  const id = String(formData.get("id") ?? "");
  const baris = await prisma.koreksiPresensiHarian.findUnique({
    where: { id },
    include: { pegawai: { select: { nip: true, satuanKerja: true } } },
  });
  if (!baris) return { error: "Koreksi itu sudah tidak ada." };

  if (!canUploadRekapPresensi(keAuthUser(user), baris.pegawai.satuanKerja ?? "")) {
    return { error: "Di luar kewenangan kamu." };
  }

  const jm = (d: Date | null) =>
    d ? `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}` : null;

  await prisma.$transaction([
    prisma.koreksiPresensiHarian.delete({ where: { id } }),
    prisma.auditTrail.create({
      data: {
        entitas: "koreksi_presensi_harian",
        entitasId: `${baris.pegawai.nip}-${baris.tanggal.toISOString().slice(0, 10)}`,
        aksi: "DELETE",
        aktor: user.nip,
        satuanKerja: baris.pegawai.satuanKerja,
        // Barisnya sudah tidak ada - ini satu-satunya jejak yang tersisa.
        dataSebelum: {
          tanggal: baris.tanggal.toISOString().slice(0, 10),
          jamMasuk: jm(baris.jamMasuk),
          jamKeluar: jm(baris.jamKeluar),
          alasan: baris.alasan,
        },
      },
    }),
  ]);

  revalidatePath(`/tukin/presensi/${baris.pegawai.nip}`);
  return { sukses: "Koreksi dihapus - jam dari e-Presensi berlaku lagi setelah presensi ditarik ulang." };
}
