"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../auth/getSessionAccount";
import { canAjukanBanding, type AuthUser } from "../../auth/permissions";
import {
  bagianDataSah,
  isReferensiBanding,
  isReferensiData,
  type ReferensiBanding,
} from "../../business-logic/bandingData";

export interface AjukanBandingFormState {
  error?: string;
  success?: string;
}

/**
 * Baris yang dibanding, disempitkan jadi yang benar-benar dipakai action ini:
 * siapa pemiliknya dan periode mana. Bentuknya sama untuk kalkulasi, rekap
 * presensi, maupun predikat - jadi pemeriksaan kepemilikan di bawah cuma
 * ditulis SEKALI, tidak sekali per jenis.
 */
type BarisDibanding = { pegawaiId: string; periodeBulan: number; periodeTahun: number } | null;

/** Ambil baris yang mau dibanding dari tabel yang sesuai referensiTipe-nya. */
function cariBaris(referensiTipe: ReferensiBanding, referensiId: string): Promise<BarisDibanding> {
  switch (referensiTipe) {
    case "TUKIN":
      return prisma.tukinCalculation.findUnique({ where: { id: referensiId } });
    case "UANG_MAKAN":
      return prisma.uangMakan.findUnique({ where: { id: referensiId } });
    case "UANG_LEMBUR":
      return prisma.uangLembur.findUnique({ where: { id: referensiId } });
    case "PRESENSI":
      return prisma.rekapPresensiPeriode.findUnique({ where: { id: referensiId } });
    case "PREDIKAT_KINERJA":
      return prisma.predikatKinerja.findUnique({ where: { id: referensiId } });
    case "DATA_PEGAWAI":
      // Data pegawai TIDAK terikat periode - jabatan dan kelas jabatan berlaku
      // sampai ada SK berikutnya, bukan per bulan. Periodenya diisi bulan
      // berjalan supaya kolom wajibnya terisi dan banding ini muncul di
      // urutan waktu yang benar bersama banding lain; angkanya sendiri tidak
      // dipakai untuk apa pun. `referensiId` di jenis ini adalah id PEGAWAI.
      return prisma.pegawai.findUnique({ where: { id: referensiId } }).then((p) => {
        if (!p) return null;
        const kini = new Date();
        return { pegawaiId: p.id, periodeBulan: kini.getMonth() + 1, periodeTahun: kini.getFullYear() };
      });
  }
}

/**
 * Ajukan banding atas kalkulasi Tukin/Uang Makan/Uang Lembur milik sendiri
 * (role matrix PEGAWAI - lihat CLAUDE.md). Sama seperti action approval,
 * fetch ULANG User dari database (bukan percaya cookie sesi) sebelum
 * mengizinkan aksi yang mengubah data.
 *
 * periodeBulan/periodeTahun DIAMBIL DARI kalkulasi yang dibanding, bukan
 * dari input form - supaya tidak bisa dipalsukan lewat DevTools.
 *
 * Banding yang diajukan memicu ReconciliationStatus (pegawai+periode yang
 * sama) pindah ke status "SANGGAH" - lihat catatan di model Banding/
 * ReconciliationStatus di schema.prisma. Upsert (bukan update) karena belum
 * ada job/service lain yang membuat baris ReconciliationStatus duluan
 * (belum ada proses rekonsiliasi otomatis di sistem ini). Durasi window
 * verifikasi & aturan hold-pembayaran-vs-koreksi-siklus-berikutnya TETAP
 * belum diisi di sini - itu masih TODO(confirm) kebijakan terpisah.
 *
 * Action ini hanya PENGAJUAN. Verifikasi berjenjangnya ada di tempat lain:
 * jenjang 1 di app/kasubag/banding/actions.ts (verifikasiBandingJenjang1Action),
 * approval final di app/osdma/banding/actions.ts (approveBandingFinalAction).
 */
export async function ajukanBandingAction(
  _state: AjukanBandingFormState,
  formData: FormData
): Promise<AjukanBandingFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) {
      return { error: "Sesi login sudah habis - silakan login ulang." };
    }

    const referensiTipeRaw = String(formData.get("referensiTipe") ?? "");
    const referensiId = String(formData.get("referensiId") ?? "");
    const alasan = String(formData.get("alasan") ?? "").trim();
    const bagianData = String(formData.get("bagianData") ?? "").trim();
    const usulanPerbaikan = String(formData.get("usulanPerbaikan") ?? "").trim();

    if (!isReferensiBanding(referensiTipeRaw)) {
      return { error: "Jenis banding tidak valid." };
    }
    if (!alasan) {
      return { error: "Alasan banding wajib diisi." };
    }

    // Banding atas DATA wajib menyebut bagian mana dan usulan perbaikannya.
    // Tanpa keduanya yang menerima cuma dapat keluhan, bukan sesuatu yang bisa
    // dicek ke sistem sumbernya - dan itu persis keadaan sebelum jenis banding
    // ini ada. Dicek DI SERVER: nilai <select> gampang diganti lewat DevTools.
    if (isReferensiData(referensiTipeRaw)) {
      if (!bagianData) {
        return { error: "Pilih dulu bagian data yang keliru." };
      }
      if (!bagianDataSah(referensiTipeRaw, bagianData)) {
        return { error: "Bagian data yang dipilih tidak dikenal untuk jenis banding ini." };
      }
      if (!usulanPerbaikan) {
        return { error: "Isi dulu usulan perbaikan - nilai yang menurut kamu seharusnya tercatat." };
      }
    }

    const user = await ambilUserSesi();
    if (!user) {
      return { error: "Akun tidak terdaftar sebagai User." };
    }
    const authUser: AuthUser = {
      nip: user.nip,
      role: user.role,
      satuanKerja: user.satuanKerja,
      aktif: user.aktif,
    };
    if (!canAjukanBanding(authUser, user.nip)) {
      return { error: "Role kamu tidak berwenang mengajukan banding." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { nip: user.nip } });
    if (!pegawai) {
      return { error: "Data pegawai untuk NIP ini tidak ditemukan." };
    }

    const baris = await cariBaris(referensiTipeRaw, referensiId);
    if (!baris) {
      return { error: "Data yang mau dibanding tidak ditemukan." };
    }
    if (baris.pegawaiId !== pegawai.id) {
      return { error: "Data ini bukan milik kamu." };
    }

    // Satu banding berjalan per baris. Yang menghalangi cuma banding yang MASIH
    // BERJALAN - kalau yang lama sudah diputuskan dan datanya ternyata keliru
    // lagi, orang harus tetap bisa mengajukan yang baru.
    const masihBerjalan = await prisma.banding.findFirst({
      where: {
        pegawaiId: pegawai.id,
        referensiTipe: referensiTipeRaw,
        referensiId,
        status: { in: ["DIAJUKAN", "MENUNGGU_APPROVAL_FINAL"] },
      },
    });
    if (masihBerjalan) {
      return { error: "Masih ada banding untuk data yang sama dan belum diputuskan." };
    }

    // ReconciliationStatus SANGGAH menandai "periode ini sedang dipersoalkan".
    //
    // DATA_PEGAWAI SENGAJA TIDAK ikut menandainya: jabatan dan kelas jabatan
    // tidak terikat bulan, dan periodenya cuma diisi bulan berjalan supaya
    // kolom wajibnya terisi. Menandai SANGGAH atas dasar itu berarti
    // menyatakan pembayaran bulan berjalan dipersoalkan padahal belum tentu -
    // dan yang membacanya di halaman rekonsiliasi tidak punya cara tahu
    // bedanya. Presensi & predikat tetap ikut: keduanya memang membentuk
    // angka periode itu.
    const tandaiSanggah = referensiTipeRaw !== "DATA_PEGAWAI";

    await prisma.$transaction(async (tx) => {
      await tx.banding.create({
        data: {
          pegawaiId: pegawai.id,
          periodeBulan: baris.periodeBulan,
          periodeTahun: baris.periodeTahun,
          referensiTipe: referensiTipeRaw,
          referensiId,
          pengajuId: user.id,
          alasan,
          bagianData: bagianData || null,
          usulanPerbaikan: usulanPerbaikan || null,
        },
      });

      if (!tandaiSanggah) return;
      await tx.reconciliationStatus.upsert({
        where: {
          pegawaiId_periodeBulan_periodeTahun: {
            pegawaiId: pegawai.id,
            periodeBulan: baris.periodeBulan,
            periodeTahun: baris.periodeTahun,
          },
        },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan: baris.periodeBulan,
          periodeTahun: baris.periodeTahun,
          status: "SANGGAH",
        },
        update: { status: "SANGGAH" },
      });
    });

    revalidatePath("/saya");
    return { success: "Banding berhasil diajukan, menunggu verifikasi." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
