"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import { checkUserStatus, signPdf, verifyPdf } from "@/lib/tte/esignClient";
import { generateDraftSptjmLembur } from "@/lib/tte/sptjmPdf";
import fs from "fs/promises";
import path from "path";

export interface TteActionResult {
  success?: boolean;
  error?: string;
  dokumenId?: string;
  idDokumenBsre?: string;
  downloadUrl?: string;
}

const STORAGE_DIR = path.join(process.cwd(), "public", "uploads", "tte");

async function pastikanDirektoriStorage() {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
}

/**
 * Server Action untuk mengecek status akun TTE BSrE penandatangan
 */
export async function cekStatusTteAction(nikTarget?: string) {
  const user = await ambilUserSesi();
  if (!user) return { success: false, error: "Sesi telah berakhir." };

  // Jika NIK target tidak diberikan, gunakan NIK dummy dev atau NIK pegawai terkait
  const nik = nikTarget || process.env.TEST_BSRE_NIK || "0803202100007062";
  const res = await checkUserStatus(nik);
  return res;
}

/**
 * Server Action untuk menandatangani dokumen SPTJM Uang Lembur
 * Mengimplementasikan Kriteria Integrasi BSrE (Kriteria V, VIII, IX)
 */
export async function signSptjmLemburAction(
  _prev: TteActionResult,
  formData: FormData
): Promise<TteActionResult> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login kembali." };

  const bulan = Number(formData.get("bulan"));
  const tahun = Number(formData.get("tahun"));
  const passphrase = String(formData.get("passphrase") || "");
  const nik = String(formData.get("nik") || process.env.TEST_BSRE_NIK || "0803202100007062");

  if (!passphrase) {
    return { error: "Passphrase wajib diisi untuk menandatangani dokumen." };
  }

  const satuanKerja = user.satuanKerja;
  if (!satuanKerja) {
    return { error: "Akun Anda tidak terikat dengan satuan kerja mana pun." };
  }

  try {
    await pastikanDirektoriStorage();

    // 1. Ambil data agregat lembur unit untuk periode ini
    const pegawaiUnit = await prisma.pegawai.findMany({
      where: {
        satuanKerja,
        statusPegawai: "AKTIF",
      },
      select: {
        id: true,
        uangLembur: {
          where: { periodeBulan: bulan, periodeTahun: tahun },
          select: { totalJamLembur: true, totalUangLembur: true },
        },
      },
    });

    const lemburValid = pegawaiUnit.flatMap((p) => p.uangLembur);
    const jumlahPegawai = lemburValid.length;
    const totalJamLembur = lemburValid.reduce((acc, curr) => acc + curr.totalJamLembur, 0);
    const totalUangLembur = lemburValid.reduce((acc, curr) => acc + curr.totalUangLembur, 0);

    const nomorDokumen = `SPTJM/LMB/${bulan}/${tahun}/${Date.now().toString().slice(-4)}`;
    const judulDokumen = `SPTJM Uang Lembur ${satuanKerja} Periode ${bulan}/${tahun}`;

    // 2. Buat Draft PDF
    const draftPdfBuffer = await generateDraftSptjmLembur({
      nomorDokumen,
      satuanKerja,
      periodeBulan: bulan,
      periodeTahun: tahun,
      namaPenandatangan: user.nama,
      nipPenandatangan: user.nip,
      jabatanPenandatangan: user.role === "KASUBAG_TU" ? "Kasubag Tata Usaha" : "Pejabat Penandatangan",
      jumlahPegawai,
      totalJamLembur,
      totalUangLembur,
    });

    // Buat record dokumen TTE di DB dengan status MENUNGGU_TTE
    const recordDokumen = await prisma.dokumenTte.create({
      data: {
        jenisDokumen: "SPTJM_LEMBUR",
        nomorDokumen,
        judulDokumen,
        periodeBulan: bulan,
        periodeTahun: tahun,
        satuanKerja,
        status: "MENUNGGU_TTE",
        penandatanganId: user.id,
        penandatanganNip: user.nip,
        penandatanganNama: user.nama,
        penandatanganJabatan: user.role === "KASUBAG_TU" ? "Kasubag Tata Usaha" : "Pejabat Penandatangan",
      },
    });

    // Simpan file draft
    const draftFileName = `draft_${recordDokumen.id}.pdf`;
    const draftFilePath = path.join(STORAGE_DIR, draftFileName);
    await fs.writeFile(draftFilePath, draftPdfBuffer);

    await prisma.dokumenTte.update({
      where: { id: recordDokumen.id },
      data: { fileDraftPath: `/uploads/tte/${draftFileName}` },
    });

    // 3. Eksekusi TTE ke BSrE
    const signResult = await signPdf({
      fileBuffer: draftPdfBuffer,
      fileName: `sptjm_lembur_${bulan}_${tahun}.pdf`,
      nik,
      passphrase, // Passphrase hanya di memori dan tidak disimpan
      tampilan: "visible",
      image: false, // QR code
      linkQR: `${process.env.NEXT_PUBLIC_APP_URL || "https://gajihub.kemnaker.go.id"}/tte/verify/${recordDokumen.id}`,
      tagKoordinat: "#",
      width: 80,
      height: 80,
      reason: "Penetapan Surat Pernyataan Tanggung Jawab Mutlak (SPTJM) Uang Lembur",
      location: "Jakarta",
    });

    // 4. Tangani jika GAGAL (Kriteria IX BSrE: Catat alasan kegagalan resmi tanpa menyimpan passphrase)
    if (!signResult.success || !signResult.signedPdfBuffer) {
      await prisma.$transaction([
        prisma.dokumenTte.update({
          where: { id: recordDokumen.id },
          data: { status: "GAGAL" },
        }),
        prisma.logGagalTte.create({
          data: {
            dokumenTteId: recordDokumen.id,
            userId: user.id,
            nip: user.nip,
            statusCode: signResult.statusCode || 500,
            pesanError: signResult.error || "Gagal menandatangani dokumen.",
            kategoriError: (signResult.error || "").toLowerCase().includes("passphrase")
              ? "PASSPHRASE_SALAH"
              : "BSRE_ERROR",
          },
        }),
      ]);

      return {
        error: signResult.error || "Gagal melakukan tanda tangan elektronik pada dokumen.",
      };
    }

    // 5. Tangani jika SUKSES
    const signedFileName = `signed_${recordDokumen.id}.pdf`;
    const signedFilePath = path.join(STORAGE_DIR, signedFileName);
    await fs.writeFile(signedFilePath, signResult.signedPdfBuffer);

    await prisma.dokumenTte.update({
      where: { id: recordDokumen.id },
      data: {
        status: "TERTANDATANGANI",
        fileSignedPath: `/uploads/tte/${signedFileName}`,
        idDokumenBsre: signResult.idDokumen,
        signingTimeMs: signResult.signingTimeMs,
        signedAt: new Date(),
      },
    });

    revalidatePath("/kasubag/kalkulasi");
    revalidatePath("/ppabp/adk");

    return {
      success: true,
      dokumenId: recordDokumen.id,
      idDokumenBsre: signResult.idDokumen,
      downloadUrl: `/uploads/tte/${signedFileName}`,
    };
  } catch (err: any) {
    // Catat log kegagalan exception internal
    await prisma.logGagalTte.create({
      data: {
        nip: user.nip,
        userId: user.id,
        statusCode: 500,
        pesanError: err.message || "Internal Server Error",
        kategoriError: "SYSTEM_EXCEPTION",
      },
    });

    return {
      error: `Terjadi kendala teknis: ${err.message}`,
    };
  }
}

