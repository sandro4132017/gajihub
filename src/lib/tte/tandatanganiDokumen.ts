// INTI penandatanganan dokumen dengan TTE BSrE, dipakai bersama oleh SPTJM
// (signSptjmUnitAction) dan dokumen lembur (Surat Tugas, SPKL bulanan).
//
// SERVER-ONLY: memakai Prisma, berkas privat, dan Esign Client.
//
// FUNGSI INI TIDAK MEMERIKSA WEWENANG. Pemanggilnya WAJIB sudah memastikan
// pemegang sesi berhak menandatangani jenis dokumen & satuan kerja itu
// (canTandatanganiSptjmUnit, canTandatanganiSpklBulanan, dst.) SEBELUM
// memanggil. Yang dijaga di sini: identitas penanda tangan dari tabel Pegawai,
// kecocokan NIK dengan pemegang sesi, status sertifikat, passphrase tidak
// pernah bocor, dan SETIAP kegagalan tercatat di log_gagal_tte (Kriteria IX).
//
// Passphrase hanya ada di memori selama pemanggilan ini: tidak disimpan di
// database, sesi, log, URL, maupun pesan galat (Kriteria V & VIII).

import fs from "fs/promises";
import path from "path";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { tautanVerifikasiDokumen } from "@/lib/tte/alamatVerifikasi";
import { hitungHashBerkas } from "@/lib/tte/hashBerkas";
import { buatSpesimenQr, ambilTemplateSpesimen } from "@/lib/tte/spesimenTte";
import { checkUserStatus, signPdf } from "@/lib/tte/esignClient";
import { terapkanStempelTteSimulasi } from "@/lib/tte/sptjmPdf";
import {
  NIK_DEMO_BSRE,
  bolehSimulasiTte,
  idDokumenSimulasi,
  izinkanNikDemo,
  klasifikasiGagalBsre,
  samarkanPassphrase,
} from "@/lib/tte/simulasiTte";
import { namaCetakPegawai } from "@/business-logic/namaPegawai";
import { kunciSidikNik, sidikNik } from "@/auth/sidikNik";
import {
  folderPeriode,
  jalurAman,
  kunciDraftTte,
  kunciSignedTte,
} from "@/lib/storage/berkasPrivat";
import { pesanGalatUntukLayar } from "@/lib/koneksi/galatSumber";
import { labelStatusSertifikat } from "./labelStatusSertifikat";

export interface HasilTandatangani {
  success?: boolean;
  error?: string;
  dokumenId?: string;
  idDokumenBsre?: string;
  downloadUrl?: string;
  nomorDokumen?: string;
  /** Nama penanda tangan yang BENAR-BENAR dipakai, diturunkan server dari Pegawai. */
  penandatanganNama?: string;
  isSimulasi?: boolean;
}

/** Identitas yang tercetak di dokumen, diambil dari tabel Pegawai (bukan dari form). */
export interface IdentitasPenandatangan {
  nama: string;
  nip: string;
  jabatan: string;
}

export interface ParamTandatangani {
  /** Pemegang sesi yang sudah lolos pemeriksaan wewenang. */
  user: { id: string; nip: string };
  jenisDokumen: string;
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  nomorDokumen: string;
  judulDokumen: string;
  /** Dipakai di pesan ke pengguna: "SPTJM", "dokumen lembur". */
  labelDokumen: string;
  /** Nama berkas resmi yang tampil saat diunduh. */
  namaBerkasResmi: string;
  /** fileName yang dikirim ke Esign Client. */
  namaBerkasKirim: string;
  nik: string;
  passphrase: string;
  /**
   * Boleh memakai NIK demo BSrE lewat sakelar TTE_IZINKAN_NIK_DEMO. Hanya
   * jalur SPTJM yang mengizinkan (keputusan 2026-11-05); jalur lembur
   * SELALU false.
   */
  izinkanNikDemoBsre: boolean;
  /** Membangun PDF draft dari identitas penanda tangan. Dipanggil di dalam penjaga galat. */
  buatPdf: (penandatangan: IdentitasPenandatangan) => Promise<Buffer>;
  /** Halaman yang perlu disegarkan setelah dokumen tertandatangani. */
  pathRevalidasi: readonly string[];
  /**
   * Batas waktu (ms) menunggu BSrE pada panggilan sign. OPSIONAL: SPTJM tidak
   * mengisinya sehingga perilakunya tidak berubah. Jalur lembur mengisinya
   * (BATAS_WAKTU_SIGN_LEMBUR_MS). Habis waktu dicatat di log_gagal_tte
   * (NETWORK_TIMEOUT) dan dokumen ditandai GAGAL.
   */
  batasWaktuSignMs?: number;
}

async function tulisBerkasTte(kunci: string, isi: Uint8Array): Promise<void> {
  const jalur = jalurAman(kunci, "tte");
  if (!jalur) throw new Error("Lokasi penyimpanan berkas TTE tidak sah.");
  await fs.mkdir(path.dirname(jalur), { recursive: true });
  await fs.writeFile(jalur, isi);
}

function periodeSah(bulan: number, tahun: number): boolean {
  try {
    folderPeriode(tahun, bulan);
    return true;
  } catch {
    return false;
  }
}

export async function tandatanganiDokumen(p: ParamTandatangani): Promise<HasilTandatangani> {
  const { user, passphrase, nik, satuanKerja: satker, periodeBulan: bulan, periodeTahun: tahun } = p;
  const label = p.labelDokumen;

  // Periode membentuk letak berkas; divalidasi SEBELUM ada baris dokumen atau
  // pemanggilan BSrE supaya periode cacat tidak meninggalkan dokumen yatim.
  if (!periodeSah(bulan, tahun)) {
    return { error: "Periode tidak sah." };
  }

  // IDENTITAS PENANDA TANGAN DIAMBIL DARI TABEL PEGAWAI, bukan dari form.
  // Nama, NIP, dan jabatan ini TERCETAK di dokumen dan tersimpan di
  // DokumenTte sebagai jawaban atas "siapa yang menandatangani".
  //
  // TODO(confirm): NIK yang diketik BELUM bisa dicocokkan ke orang ini bila
  // Pegawai.sidikNik kosong / SIDIK_NIK_SECRET belum diisi; dilewati dengan
  // alasan (log server), bukan ditebak.
  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: user.nip },
    select: { nama: true, nip: true, jabatan: true, sidikNik: true },
  });
  if (!pegawai) {
    return {
      error:
        "Data pegawai untuk akun ini tidak ditemukan, jadi identitas penanda tangan tidak bisa dipastikan.",
    };
  }
  if (!pegawai.jabatan || !pegawai.jabatan.trim()) {
    // Jabatan ikut tercetak di dokumen; mengarangnya bukan pilihan.
    return {
      error: `Jabatan pada data pegawai Anda masih kosong. Lengkapi dulu di Data Pegawai sebelum menandatangani ${label}.`,
    };
  }
  const namaPenandatangan = namaCetakPegawai(pegawai);
  const nipPenandatangan = pegawai.nip;
  const jabatanPenandatangan = pegawai.jabatan.trim();

  // NIK DEMO BSrE DITOLAK SECARA EKSPLISIT bila pemanggil tidak mengizinkannya
  // (jalur lembur). Tidak bergantung pada pencocokan sidik di bawah, yang
  // dilewati saat sidikNik kosong atau SIDIK_NIK_SECRET belum ada.
  if (!p.izinkanNikDemoBsre && nik.trim() === NIK_DEMO_BSRE) {
    await prisma.logGagalTte
      .create({
        data: {
          dokumenTteId: null,
          userId: user.id,
          nip: nipPenandatangan,
          statusCode: 0,
          pesanError: "NIK sertifikat demo BSrE ditolak pada jenis dokumen ini.",
          kategoriError: "NIK_DEMO_DITOLAK",
        },
      })
      .catch(() => {
        /* pencatatan gagal tidak boleh mengubah jawaban */
      });
    return {
      error:
        "NIK sertifikat demo BSrE tidak boleh dipakai untuk menandatangani " +
        `${label}. Gunakan NIK Anda sendiri yang sudah terdaftar di BSrE.`,
    };
  }

  // NIK YANG DIKETIK HARUS MILIK PEMEGANG SESI, dicocokkan lewat SIDIK (HMAC)
  // karena proyek ini tidak pernah menyimpan NIK (src/auth/sidikNik.ts).
  // Dilewati dengan peringatan bila jembatannya belum siap.
  if (pegawai.sidikNik && p.izinkanNikDemoBsre && izinkanNikDemo(nik)) {
    console.warn("[tte] sertifikat demo BSrE dipakai oleh akun pegawai (sakelar TTE_IZINKAN_NIK_DEMO hidup).");
  } else if (pegawai.sidikNik) {
    let sidikDiketik: string | null = null;
    try {
      sidikDiketik = sidikNik(nik, kunciSidikNik());
    } catch {
      sidikDiketik = null;
    }
    if (sidikDiketik === null) {
      console.warn(
        "[tte] NIK tidak dapat dicocokkan ke pemegang sesi - SIDIK_NIK_SECRET belum diisi " +
          "atau NIK-nya tidak berbentuk sah. Penandatanganan DILANJUTKAN."
      );
    } else if (sidikDiketik !== pegawai.sidikNik) {
      return {
        error:
          "NIK yang dimasukkan bukan milik akun yang sedang login. " +
          `${label.charAt(0).toUpperCase()}${label.slice(1)} harus ` +
          "ditandatangani oleh pemiliknya sendiri - silakan login dengan akun Anda.",
      };
    }
  } else {
    console.warn(
      `[tte] Pegawai ${user.nip} belum punya sidik NIK, jadi NIK yang diketik tidak ` +
        "dapat dicocokkan. Isi SIDIK_NIK_SECRET lalu jalankan npm run sync:pegawai."
    );
  }

  // STATUS SERTIFIKAT DIPERIKSA DI SERVER, bukan hanya di layar. Penolakan
  // dicatat (Kriteria BSrE IX) dengan NIP, tanpa NIK dan tanpa passphrase.
  const statusSertifikat = await checkUserStatus(nik);
  if (statusSertifikat.status !== "ISSUE") {
    const gangguanLayanan =
      statusSertifikat.status === "NETWORK_ERROR" ||
      statusSertifikat.status === "SERVER_ERROR";
    await prisma.logGagalTte
      .create({
        data: {
          dokumenTteId: null,
          userId: user.id,
          nip: nipPenandatangan,
          statusCode: statusSertifikat.statusCode ?? 0,
          pesanError: `Pemeriksaan sertifikat ditolak: status ${statusSertifikat.status}.`,
          kategoriError: gangguanLayanan
            ? statusSertifikat.status === "NETWORK_ERROR"
              ? "NETWORK_TIMEOUT"
              : "BSRE_ERROR"
            : "SERTIFIKAT_BELUM_SIAP",
        },
      })
      .catch(() => {
        /* pencatatan gagal tidak boleh mengubah jawaban */
      });
    if (gangguanLayanan) {
      return {
        error:
          "Pemeriksaan sertifikat GAGAL: layanan BSrE tidak dapat dihubungi. " +
          `${label.charAt(0).toUpperCase()}${label.slice(1)} belum ditandatangani. Coba lagi beberapa menit lagi; bila berulang, ` +
          "laporkan ke Admin Gajihub. Kegagalan ini sudah tercatat.",
      };
    }
    return {
      error:
        `Sertifikat elektronik untuk NIK ini belum siap dipakai (${labelStatusSertifikat(statusSertifikat.status)}). ` +
        "Pastikan NIK-nya benar dan sudah terdaftar di BSrE sebelum menandatangani.",
    };
  }

  if (!passphrase) {
    return { error: "Passphrase wajib diisi untuk menandatangani dokumen." };
  }

  try {
    // 1. PDF draft
    const draftPdfBuffer = await p.buatPdf({
      nama: namaPenandatangan,
      nip: nipPenandatangan,
      jabatan: jabatanPenandatangan,
    });

    // 2. Baris DokumenTte
    const recordDokumen = await prisma.dokumenTte.create({
      data: {
        jenisDokumen: p.jenisDokumen,
        nomorDokumen: p.nomorDokumen,
        judulDokumen: p.judulDokumen,
        periodeBulan: bulan,
        periodeTahun: tahun,
        satuanKerja: satker,
        status: "MENUNGGU_TTE",
        penandatanganId: user.id,
        penandatanganNip: nipPenandatangan,
        penandatanganNama: namaPenandatangan,
        penandatanganJabatan: jabatanPenandatangan,
      },
    });

    const kunciDraft = kunciDraftTte(satker, tahun, bulan, recordDokumen.id);
    await tulisBerkasTte(kunciDraft, draftPdfBuffer);

    await prisma.dokumenTte.update({
      where: { id: recordDokumen.id },
      data: { fileDraftPath: kunciDraft },
    });

    // 3. Esign Client BSrE. Tautan QR dari KONFIGURASI, bukan header
    // permintaan (alamatnya terkunci permanen di dalam PDF).
    const linkQrVerifikasi = tautanVerifikasiDokumen(recordDokumen.id);

    const signResultMentah = await signPdf({
      fileBuffer: draftPdfBuffer,
      fileName: p.namaBerkasKirim,
      nik,
      passphrase, // hanya di memori, dibuang setelah request
      tampilan: "visible",
      image: true,
      imageTTDBuffer: buatSpesimenQr(linkQrVerifikasi, ambilTemplateSpesimen()).png,
      tagKoordinat: "#",
      width: 60,
      height: 60,
      reason: `Penetapan Dokumen ${p.judulDokumen}`,
      location: "Jakarta",
      ...(p.batasWaktuSignMs ? { batasWaktuMs: p.batasWaktuSignMs } : {}),
    });

    // Teks galat BSrE disamarkan SEBELUM dipakai di mana pun: BSrE bisa
    // menggemakan input, termasuk passphrase (Kriteria V & VIII).
    const signResult = {
      ...signResultMentah,
      error:
        signResultMentah.error === undefined
          ? undefined
          : samarkanPassphrase(signResultMentah.error, passphrase),
    };

    let signedPdfFinal: Buffer;
    // Id BSrE HANYA diisi kalau BSrE memang menjawab; cabang simulasi memakai
    // id berawalan SIMULASI- supaya tidak terbaca sebagai sah.
    let idDokumenBsreFinal: string | null = signResult.idDokumen || null;
    let isSimulasiMode = false;

    if (signResult.success && signResult.signedPdfBuffer) {
      signedPdfFinal = signResult.signedPdfBuffer;
    } else {
      const gagal = klasifikasiGagalBsre(signResult);
      const isPassphraseError = gagal.kategori === "PASSPHRASE_SALAH";

      // Passphrase salah tidak pernah disamarkan sebagai simulasi, dan
      // WAJIB tercatat (Kriteria IX). Pesan galat tidak memuat passphrase.
      if (isPassphraseError) {
        await prisma.$transaction([
          prisma.dokumenTte.update({
            where: { id: recordDokumen.id },
            data: { status: "GAGAL" },
          }),
          prisma.logGagalTte.create({
            data: {
              dokumenTteId: recordDokumen.id,
              userId: user.id,
              nip: nipPenandatangan,
              statusCode: signResult.statusCode ?? 0,
              pesanError: signResult.error || "Passphrase BSrE salah.",
              kategoriError: "PASSPHRASE_SALAH",
            },
          }),
        ]);
        return {
          error: signResult.error || "Passphrase BSrE salah.",
        };
      }

      if (bolehSimulasiTte()) {
        isSimulasiMode = true;
        idDokumenBsreFinal = idDokumenSimulasi(recordDokumen.id);
        // Kegagalan BSrE tetap dicatat walau PDF-nya tetap terbit.
        await prisma.logGagalTte
          .create({
            data: {
              dokumenTteId: recordDokumen.id,
              userId: user.id,
              nip: nipPenandatangan,
              statusCode: signResult.statusCode ?? 0,
              pesanError:
                (signResult.error || "Esign Client BSrE tidak menjawab") +
                " - stempel SIMULASI diterapkan, BUKAN tanda tangan BSrE.",
              kategoriError: "SIMULASI_DITERAPKAN",
            },
          })
          .catch(() => {
            /* pencatatan gagal tidak boleh menggagalkan dokumennya */
          });
        signedPdfFinal = await terapkanStempelTteSimulasi(draftPdfBuffer, {
          namaPenandatangan,
          nipPenandatangan,
          idDokumenBsre: idDokumenBsreFinal,
          verifyUrl: linkQrVerifikasi,
        });
      } else {
        // Kriteria IX BSrE: kegagalan dicatat; dokumen tidak diterbitkan.
        await prisma.$transaction([
          prisma.dokumenTte.update({
            where: { id: recordDokumen.id },
            data: { status: "GAGAL" },
          }),
          prisma.logGagalTte.create({
            data: {
              dokumenTteId: recordDokumen.id,
              userId: user.id,
              nip: nipPenandatangan,
              statusCode: signResult.statusCode ?? 0,
              pesanError: signResult.error || "Gagal menandatangani dokumen.",
              kategoriError: gagal.kategori,
            },
          }),
        ]);

        // Teks bakunya menyebut "SPTJM"; untuk dokumen lain diganti labelnya.
        return { error: gagal.pesanPengguna.replace("SPTJM", label) };
      }
    }

    // 4. Simpan berkas bertanda tangan di subfolder ber-ID dokumen, supaya
    // dua kali menandatangani periode yang sama tidak saling menimpa.
    const kunciSigned = kunciSignedTte(satker, tahun, bulan, recordDokumen.id, p.namaBerkasResmi);
    await tulisBerkasTte(kunciSigned, signedPdfFinal);

    // Sidik dari bita yang BENAR-BENAR ditulis ke disk.
    const hashBerkas = hitungHashBerkas(signedPdfFinal);

    await prisma.dokumenTte.update({
      where: { id: recordDokumen.id },
      data: {
        status: "TERTANDATANGANI",
        fileSignedPath: kunciSigned,
        idDokumenBsre: idDokumenBsreFinal,
        // Jangan mengarang lama penandatanganan saat simulasi.
        signingTimeMs: isSimulasiMode ? null : signResult.signingTimeMs ?? null,
        signedAt: new Date(),
        hashBerkas,
      },
    });

    for (const jalur of p.pathRevalidasi) revalidatePath(jalur);

    return {
      success: true,
      dokumenId: recordDokumen.id,
      idDokumenBsre: idDokumenBsreFinal ?? undefined,
      // Rute berizin, bukan letak di disk.
      downloadUrl: `/berkas/tte/${recordDokumen.id}`,
      nomorDokumen: p.nomorDokumen,
      penandatanganNama: namaPenandatangan,
      isSimulasi: isSimulasiMode,
    };
  } catch (err) {
    const pesanMentah = err instanceof Error ? err.message : String(err);
    // Kriteria BSrE IX: kegagalan tetap dicatat (tanpa passphrase).
    await prisma.logGagalTte
      .create({
        data: {
          nip: nipPenandatangan,
          userId: user.id,
          statusCode: 500,
          pesanError: samarkanPassphrase(pesanMentah || "Internal Server Error", passphrase),
          kategoriError: "SYSTEM_EXCEPTION",
        },
      })
      .catch(() => null);

    return {
      error: pesanGalatUntukLayar("tte.sign", err, "Terjadi kendala teknis", [passphrase]),
    };
  }
}
