"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { ambilUserSesi } from "../../auth/getSessionAccount";
import { canKelolaSkGrade, type AuthUser } from "../../auth/permissions";

export interface SkGradeFormState {
  error?: string;
  success?: string;
}

function keAuthUser(u: {
  nip: string;
  role: AuthUser["role"];
  satuanKerja: string | null;
  aktif: boolean;
}): AuthUser {
  return { nip: u.nip, role: u.role, satuanKerja: u.satuanKerja, aktif: u.aktif };
}

/** "2026-08-31" -> Date tengah malam UTC. Konvensi tanggal seluruh sistem ini. */
function tanggalUtcDariIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

/**
 * Mencatat SK grading satu pegawai.
 *
 * DIKETIK PETUGAS SAMBIL MELIHAT SK ASLINYA (keputusan user 2026-09-14), dan
 * itu memang maksudnya: nomornya tidak ada di SIAP mana pun, jadi satu-satunya
 * jalan masuk adalah orang yang memegang dokumennya. Berkasnya sendiri TIDAK
 * diunggah - keputusan tempat simpan & retensi dokumen masih terbuka di
 * proyek ini, dan menyimpan berkas tanpa menjawabnya lebih dulu berarti
 * memutuskannya diam-diam.
 *
 * PEGAWAI TIDAK DIBERI AKSES ke sini. Kelas jabatan menentukan tarif Tukin;
 * membiarkan orang mencatat SK yang menetapkan kelasnya sendiri berarti
 * membuka jalan menaikkan bayarannya sendiri tanpa pemeriksaan. Yang boleh:
 * KASUBAG_TU untuk unitnya, PPABP lintas unit - lihat canKelolaSkGrade().
 */
export async function catatSkGradeAction(
  _state: SkGradeFormState,
  formData: FormData
): Promise<SkGradeFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  const authUser = keAuthUser(user);

  const pegawaiId = String(formData.get("pegawaiId") ?? "");
  const pegawai = await prisma.pegawai.findUnique({
    where: { id: pegawaiId },
    select: { id: true, nama: true, satuanKerja: true },
  });
  if (!pegawai) return { error: "Pegawai tidak ditemukan." };

  // Dicek terhadap satuan kerja PEGAWAINYA, bukan sekadar "boleh mencatat
  // sesuatu" - Kasubag TU unit lain tidak boleh menyentuh baris ini.
  if (!canKelolaSkGrade(authUser, pegawai.satuanKerja)) {
    return { error: `Di luar kewenangan kamu (${pegawai.satuanKerja}).` };
  }

  const nomorSk = String(formData.get("nomorSk") ?? "").trim();
  if (nomorSk.length < 3) return { error: "Nomor SK wajib diisi." };

  const tanggalSk = tanggalUtcDariIso(String(formData.get("tanggalSk") ?? ""));
  if (!tanggalSk) return { error: "Tanggal SK tidak valid." };

  const tmtBerlaku = tanggalUtcDariIso(String(formData.get("tmtBerlaku") ?? ""));
  if (!tmtBerlaku) return { error: "TMT berlaku tidak valid." };

  const kelasJabatan = Number(String(formData.get("kelasJabatan") ?? "").trim());
  if (!Number.isInteger(kelasJabatan) || kelasJabatan < 1 || kelasJabatan > 17) {
    return { error: "Kelas jabatan harus angka 1-17." };
  }

  const keterangan = String(formData.get("keterangan") ?? "").trim();

  // TMT jauh mendahului tanggal SK-nya BUKAN kesalahan - SK berlaku surut itu
  // lazim. Yang dijaga cuma arah sebaliknya yang tidak masuk akal: berlaku
  // bertahun-tahun sebelum SK-nya ada, biasanya tanda dua kolom tertukar.
  if (tmtBerlaku.getTime() > tanggalSk.getTime() + 366 * 24 * 3600 * 1000) {
    return {
      error: "TMT berlaku lebih dari setahun SESUDAH tanggal SK - periksa lagi, dua kolom itu gampang tertukar.",
    };
  }

  const sudahAda = await prisma.skGrade.findFirst({ where: { pegawaiId, nomorSk } });
  if (sudahAda) {
    return { error: `Nomor SK ${nomorSk} sudah tercatat untuk ${pegawai.nama}.` };
  }

  await prisma.$transaction([
    prisma.skGrade.create({
      data: {
        pegawaiId,
        nomorSk,
        tanggalSk,
        tmtBerlaku,
        kelasJabatan,
        keterangan: keterangan || null,
        dicatatOlehId: user.id,
      },
    }),
    prisma.auditTrail.create({
      data: {
        entitas: "sk_grade",
        entitasId: `${pegawaiId}-${nomorSk}`,
        aksi: "CREATE",
        aktor: user.nip,
        satuanKerja: pegawai.satuanKerja,
        dataSesudah: {
          nomorSk,
          tanggalSk: tanggalSk.toISOString().slice(0, 10),
          tmtBerlaku: tmtBerlaku.toISOString().slice(0, 10),
          kelasJabatan,
          keterangan: keterangan || null,
        },
      },
    }),
  ]);

  revalidatePath("/pegawai");
  return {
    success:
      `SK ${nomorSk} tercatat - kelas ${kelasJabatan}, berlaku sejak ` +
      `${tmtBerlaku.toISOString().slice(8, 10)}/${tmtBerlaku.toISOString().slice(5, 7)}/${tmtBerlaku.toISOString().slice(0, 4)}. ` +
      "Berkas ADK periode yang tercakup SK ini akan memakai nomornya.",
  };
}

/** Menghapus satu baris SK grading - untuk salah ketik, bukan untuk "mencabut" SK. */
export async function hapusSkGradeAction(
  _state: SkGradeFormState,
  formData: FormData
): Promise<SkGradeFormState> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi login sudah habis - silakan login ulang." };
  const authUser = keAuthUser(user);

  const id = String(formData.get("id") ?? "");
  const baris = await prisma.skGrade.findUnique({
    where: { id },
    include: { pegawai: { select: { satuanKerja: true } } },
  });
  if (!baris) return { error: "Baris SK itu sudah tidak ada." };

  if (!canKelolaSkGrade(authUser, baris.pegawai.satuanKerja)) {
    return { error: `Di luar kewenangan kamu (${baris.pegawai.satuanKerja}).` };
  }

  await prisma.$transaction([
    prisma.skGrade.delete({ where: { id } }),
    prisma.auditTrail.create({
      data: {
        entitas: "sk_grade",
        entitasId: `${baris.pegawaiId}-${baris.nomorSk}`,
        aksi: "DELETE",
        aktor: user.nip,
        satuanKerja: baris.pegawai.satuanKerja,
        // Barisnya sudah tidak ada lagi - ini satu-satunya jejak yang tersisa.
        dataSebelum: {
          nomorSk: baris.nomorSk,
          tanggalSk: baris.tanggalSk.toISOString().slice(0, 10),
          tmtBerlaku: baris.tmtBerlaku.toISOString().slice(0, 10),
          kelasJabatan: baris.kelasJabatan,
          keterangan: baris.keterangan,
        },
      },
    }),
  ]);

  revalidatePath("/pegawai");
  return { success: `SK ${baris.nomorSk} dihapus dari daftar.` };
}
