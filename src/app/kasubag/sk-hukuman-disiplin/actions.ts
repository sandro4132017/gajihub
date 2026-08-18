"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canInputSkHukumanDisiplin, type AuthUser } from "../../../auth/permissions";

export interface InputSkHukdisFormState {
  error?: string;
  success?: string;
}

/**
 * TODO(confirm) BESAR: alur approval OSDMA untuk SK Hukuman Disiplin ini
 * ASUMSI dari spesifikasi simulasi, BELUM konfirmasi resmi ke OSDMA/Biro
 * Hukum - lihat komentar panjang di model SkHukumanDisiplin (schema.prisma)
 * dan canInputSkHukumanDisiplin (permissions.ts).
 */
export async function inputSkHukdisAction(
  _state: InputSkHukdisFormState,
  formData: FormData
): Promise<InputSkHukdisFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const nomorSk = String(formData.get("nomorSk") ?? "").trim();
    const skBelumTerbit = formData.get("skBelumTerbit") === "on";
    const tanggalSk = String(formData.get("tanggalSk") ?? "");
    const jenisHukuman = String(formData.get("jenisHukuman") ?? "").trim();
    const keterangan = String(formData.get("keterangan") ?? "").trim();
    const periodeMulaiBulan = Number(formData.get("periodeMulaiBulan"));
    const periodeMulaiTahun = Number(formData.get("periodeMulaiTahun"));
    const angka = (nama: string) => {
      const v = String(formData.get(nama) ?? "").trim();
      return v === "" ? null : Number(v);
    };
    const periodeSelesaiBulan = angka("periodeSelesaiBulan");
    const periodeSelesaiTahun = angka("periodeSelesaiTahun");
    const kelasJabatanSelamaHukuman = angka("kelasJabatanSelamaHukuman");

    if (!pegawaiId || !tanggalSk || !jenisHukuman || !periodeMulaiBulan || !periodeMulaiTahun) {
      return { error: "Field wajib (pegawai, tanggal SK, jenis hukuman, periode mulai) belum lengkap." };
    }
    // Nomor SK wajib KECUALI memang ditandai belum terbit. Kalau tidak
    // dibedakan, orang akan mengisi "-" atau "TBD" dan penandanya jadi
    // tidak berguna karena keadaannya tidak bisa dihitung lagi.
    if (!skBelumTerbit && !nomorSk) {
      return { error: 'Nomor SK belum diisi. Kalau SK-nya memang belum terbit, centang "SK belum terbit".' };
    }
    if (skBelumTerbit && nomorSk) {
      return { error: 'Nomor SK terisi tapi ditandai belum terbit - pilih salah satu.' };
    }

    // Periode selesai harus lengkap dua-duanya atau tidak sama sekali. Kalau
    // cuma salah satu terisi, `skMencakupPeriode` memperlakukannya sebagai
    // "berlaku selamanya" - hukuman satu tahun berubah jadi permanen tanpa
    // ada yang menyadarinya.
    if ((periodeSelesaiBulan === null) !== (periodeSelesaiTahun === null)) {
      return { error: "Periode selesai harus diisi bulan DAN tahunnya, atau dikosongkan dua-duanya." };
    }
    if (periodeSelesaiBulan !== null && periodeSelesaiTahun !== null) {
      const mulai = periodeMulaiTahun * 12 + periodeMulaiBulan;
      const selesai = periodeSelesaiTahun * 12 + periodeSelesaiBulan;
      if (selesai < mulai) return { error: "Periode selesai lebih awal dari periode mulai." };
    }
    // Kelas jabatan menentukan TARIF tukin pokok - salah angka di sini
    // langsung salah bayar, jadi divalidasi sekarang, bukan waktu kalkulasi.
    if (
      kelasJabatanSelamaHukuman !== null &&
      (!Number.isInteger(kelasJabatanSelamaHukuman) ||
        kelasJabatanSelamaHukuman < 1 ||
        kelasJabatanSelamaHukuman > 17)
    ) {
      return { error: "Kelas jabatan selama hukuman harus antara 1 dan 17." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };
    if (!canInputSkHukumanDisiplin(authUser, pegawai.satuanKerja)) {
      return { error: "Role kamu tidak berwenang input SK Hukuman Disiplin unit ini." };
    }

    await prisma.skHukumanDisiplin.create({
      data: {
        pegawaiId,
        nomorSk: nomorSk || null,
        skBelumTerbit,
        tanggalSk: new Date(tanggalSk),
        jenisHukuman,
        keterangan: keterangan || undefined,
        periodeMulaiBulan,
        periodeMulaiTahun,
        periodeSelesaiBulan,
        periodeSelesaiTahun,
        kelasJabatanSelamaHukuman,
        diajukanOlehId: user.id,
        status: "DIAJUKAN",
      },
    });

    revalidatePath("/kasubag/sk-hukuman-disiplin");
    return {
      success:
        `SK Hukuman Disiplin ${pegawai.nama} diinput, menunggu approval OSDMA.` +
        (skBelumTerbit ? " Ditandai SK BELUM TERBIT - lengkapi nomornya begitu terbit." : "") +
        (kelasJabatanSelamaHukuman !== null
          ? ` Penurunan kelas jabatan ${pegawai.kelasJabatan ?? "?"} -> ${kelasJabatanSelamaHukuman} baru berlaku` +
            ` SETELAH disetujui OSDMA, dan kalkulasi Tukin periode terkait perlu dihitung ulang.`
          : ""),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}
