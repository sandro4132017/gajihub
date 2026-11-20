"use server";

import { revalidatePath } from "next/cache";
import { tandatanganiDokumen } from "@/lib/tte/tandatanganiDokumen";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import {
  canLihatDokumenSptjm,
  canTandatanganiSptjmUnit,
  type AuthUser,
} from "@/auth/permissions";
import { checkUserStatus } from "@/lib/tte/esignClient";
import {
  generateDraftSptjm,
  generateNomorSptjmDefault,
  generateNamaFileSptjm,
  type JenisSptjm,
} from "@/lib/tte/sptjmPdf";
import { namaCetakPegawai } from "@/business-logic/namaPegawai";
import {
  folderPeriode,
  jalurAman,
  kunciPratinjauTte,
} from "@/lib/storage/berkasPrivat";
import { pesanGalatUntukLayar } from "@/lib/koneksi/galatSumber";
import fs from "fs/promises";
import path from "path";

export interface TteActionResult {
  success?: boolean;
  error?: string;
  dokumenId?: string;
  idDokumenBsre?: string;
  downloadUrl?: string;
  nomorDokumen?: string;
  /** Nama penanda tangan yang BENAR-BENAR dipakai, diturunkan server dari sesi. */
  penandatanganNama?: string;
  isSimulasi?: boolean;
}

/**
 * Menulis berkas TTE ke penyimpanan privat pada `kunci` (`tte/<unit>/<periode>/...`).
 * Jalur diturunkan lewat resolver yang sama dengan pembaca, jadi tidak mungkin
 * menulis di luar folder `tte/`.
 */
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

/**
 * Server Action untuk mengecek status akun TTE BSrE penandatangan
 */
export async function cekStatusTteAction(nikTarget?: string) {
  const user = await ambilUserSesi();
  if (!user) return { success: false, error: "Sesi telah berakhir." };

  // Hanya penanda tangan SPTJM unit yang boleh memeriksa sertifikat; tanpa
  // gerbang ini siapa pun yang login bisa menanyakan status BSrE NIK siapa saja.
  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (!canTandatanganiSptjmUnit(authUser, user.satuanKerja ?? "")) {
    return { success: false, error: "Hanya Kasubag TU yang dapat memeriksa sertifikat TTE." };
  }

  const nik = nikTarget || process.env.TEST_BSRE_NIK || "0803202100007062";
  const res = await checkUserStatus(nik);
  return res;
}

/**
 * Mengambil informasi SPTJM terbaru untuk jenis dokumen dan periode terkait
 */
export async function ambilStatusSptjmAction(
  jenis: JenisSptjm,
  bulan: number,
  tahun: number,
  satker?: string
) {
  const user = await ambilUserSesi();
  if (!user) return null;

  const authUserLihat: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (!canLihatDokumenSptjm(authUserLihat, satker?.trim() || user.satuanKerja || "")) return null;

  // Tanpa bawaan "Biro Keuangan dan BMN": nama itu dipakai untuk MENCARI baris
  // dokumen_tte, dan seluruh barisnya memakai bentuk panjang - jadi bawaan itu
  // selalu tidak menemukan apa pun. Bentuk singkat memang benar untuk DICETAK
  // di naskah (lihat acuan docs/sptjm), bukan untuk mencari data.
  const satkerEfektif = satker?.trim() || user.satuanKerja || "";
  if (!satkerEfektif) return null;

  const dokumen = await prisma.dokumenTte
    .findFirst({
      where: {
        jenisDokumen: jenis,
        periodeBulan: bulan,
        periodeTahun: tahun,
        satuanKerja: satkerEfektif,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        nomorDokumen: true,
        fileDraftPath: true,
        fileSignedPath: true,
        idDokumenBsre: true,
        signedAt: true,
        penandatanganNama: true,
        penandatanganNip: true,
        penandatanganJabatan: true,
      },
    })
    .catch(() => null);

  const pegawaiPenandatangan = await prisma.pegawai.findUnique({
    where: { nip: user.nip },
    select: { nama: true, nip: true, jabatan: true, sidikNik: true },
  });

  const nomorDefault = generateNomorSptjmDefault(jenis, bulan, tahun);

  return {
    dokumen: dokumen
      ? {
          ...dokumen,
          signedAt: dokumen.signedAt ? dokumen.signedAt.toISOString() : null,
        }
      : null,
    nomorDefault,
    // PENANDA TANGAN YANG DISODORKAN KE LAYAR = YANG AKAN BENAR-BENAR
    // MENANDATANGANI, yaitu pemegang sesi ini. Sebelumnya tiga baris ini
    // berisi nama, NIP, dan jabatan satu pejabat sungguhan yang di-hardcode
    // untuk SEMUA unit - jadi layar menjanjikan satu orang sementara yang
    // tercetak orang lain.
    //
    // Dikosongkan kalau datanya belum ada, supaya UI memakai penandanya
    // sendiri - bukan diisi nama siapa pun.
    ppkDefault: {
      nama: pegawaiPenandatangan ? namaCetakPegawai(pegawaiPenandatangan) : "",
      nip: pegawaiPenandatangan?.nip ?? user.nip,
      jabatan: pegawaiPenandatangan?.jabatan?.trim() ?? "",
      satuanKerja:
        satkerEfektif === "Biro Keuangan dan Barang Milik Negara"
          ? "Biro Keuangan dan BMN"
          : satkerEfektif,
      unitEselon1: "Sekretariat Jenderal",
    },
  };
}

/**
 * Membuat file draft PDF SPTJM untuk dilihat / dipratinjau pengguna
 */
export async function buatDraftSptjmAction(params: {
  jenis: JenisSptjm;
  bulan: number;
  tahun: number;
  nomorDokumen?: string;
  satuanKerja?: string;
}) {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan." };

  // Bawaan "Biro Keuangan dan BMN" DICABUT: nama itu tidak cocok dengan satu
  // pun baris Pegawai. Yang ada di data hanya "Biro Keuangan dan Barang Milik
  // Negara" (53 pegawai); yang singkat 0 pegawai. Jadi bawaan itu menghasilkan
  // dokumen untuk unit yang tidak ada, dengan agregasi nominal nol.
  const satker = params.satuanKerja?.trim() || user.satuanKerja || "";
  if (!satker) {
    return {
      error:
        "Satuan kerja belum ditentukan. Pilih unitnya dulu - tidak ada nama unit bawaan.",
    };
  }

  const authUserDraft: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  // Draft-nya MEMUAT AGREGASI NOMINAL unit itu, jadi gerbangnya izin MELIHAT
  // dokumen SPTJM unit - bukan izin menandatangani, dan bukan sekadar "satu
  // unit" (`canLihatSatker` tidak memeriksa role, jadi PEGAWAI se-unit lolos).
  // Kasubag TU unit itu, PPABP, dan ADMIN.
  if (!canLihatDokumenSptjm(authUserDraft, satker)) {
    return { error: "Kamu tidak berwenang melihat dokumen SPTJM satuan kerja ini." };
  }
  if (!periodeSah(Number(params.bulan), Number(params.tahun))) {
    return { error: "Periode tidak sah." };
  }

  const pegawaiDraft = await prisma.pegawai.findUnique({
    where: { nip: user.nip },
    select: { nama: true, nip: true, jabatan: true, sidikNik: true },
  });
  const nomorDokumen =
    params.nomorDokumen || generateNomorSptjmDefault(params.jenis, params.bulan, params.tahun);

  try {
    const pdfBuffer = await generateDraftSptjm({
      jenis: params.jenis,
      nomorDokumen,
      periodeBulan: params.bulan,
      periodeTahun: params.tahun,
      // Pratinjau memakai identitas AKUN YANG MEMBUKANYA, bukan satu nama yang
      // di-hardcode untuk semua unit. Kalau datanya belum lengkap, itu
      // DITULIS APA ADANYA di draft - draft memang tempat melihat yang kurang.
      namaPenandatangan: pegawaiDraft
        ? namaCetakPegawai(pegawaiDraft)
        : "(nama pegawai belum ada di data)",
      nipPenandatangan: pegawaiDraft?.nip || user.nip,
      jabatanPenandatangan: pegawaiDraft?.jabatan?.trim() || "(jabatan belum diisi)",
      satuanKerja: satker,
      unitEselon1: "Sekretariat Jenderal",
      previewTte: true,
    });

    const namaResmi = generateNamaFileSptjm(
      params.jenis,
      params.bulan,
      params.tahun,
      satker
    );
    await tulisBerkasTte(
      kunciPratinjauTte(satker, params.tahun, params.bulan, namaResmi),
      pdfBuffer
    );

    // Pratinjau tidak punya baris di database, jadi rutenya menghitung ulang
    // letak berkas dari parameter ini (bukan dari nama berkas di URL).
    const q = new URLSearchParams({
      jenis: params.jenis,
      bulan: String(params.bulan),
      tahun: String(params.tahun),
      satker,
      t: String(Date.now()),
    });

    return {
      success: true,
      downloadUrl: `/berkas/tte-pratinjau?${q.toString()}`,
      nomorDokumen,
    };
  } catch (err) {
    return { error: pesanGalatUntukLayar("tte.buatDraft", err, "Gagal membuat draft") };
  }
}

export interface HapusDraftSptjmResult {
  success?: boolean;
  error?: string;
  pesan?: string;
}

/**
 * Membersihkan DRAFT SPTJM supaya bisa disusun ulang dari awal.
 *
 * YANG DIHAPUS HANYA YANG BELUM TERTANDATANGANI. Dokumen berstatus
 * TERTANDATANGANI DITOLAK tegas - itu dokumen bertanda tangan elektronik BSrE,
 * dan membatalkannya bukan "mengulang draft". Untuk itu yang dipakai tombol
 * TTE Ulang, yang menandatangani ulang tanpa menghilangkan jejak apa pun.
 *
 * WEWENANGNYA SAMA DENGAN MENANDATANGANI - `canTandatanganiSptjmUnit`, yaitu
 * Kasubag TU unit itu sendiri. Sengaja izin yang SAMA, bukan izin baru yang
 * lebih longgar: yang menyusun dokumennya yang membersihkannya, dan tidak
 * seorang pun bisa menghapus draft unit lain.
 *
 * CATATAN KEPATUHAN DILEPAS DULU, TIDAK DIBIARKAN IKUT TERHAPUS.
 * `LogGagalTte.dokumenTte` ber-`onDelete: Cascade`, dan justru di baris yang
 * GAGAL inilah catatan Kriteria IX BSrE berada - kalau ikut terhapus, jejak
 * kegagalan penandatanganan hilang persis saat paling dibutuhkan. Kolomnya
 * nullable, jadi relasinya dilepas (`null`) dan barisnya selamat.
 */
export async function hapusDraftSptjmAction(params: {
  jenis: JenisSptjm;
  bulan: number;
  tahun: number;
}): Promise<HapusDraftSptjmResult> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login kembali." };

  const satker = user.satuanKerja ?? "";
  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (!canTandatanganiSptjmUnit(authUser, satker)) {
    return {
      error: "Hanya Kasubag TU satuan kerja ini yang berwenang menghapus draft SPTJM-nya.",
    };
  }

  const bulan = Number(params.bulan);
  const tahun = Number(params.tahun);
  if (!periodeSah(bulan, tahun)) {
    return { error: "Periode tidak sah." };
  }

  const kunci = {
    jenisDokumen: params.jenis,
    periodeBulan: bulan,
    periodeTahun: tahun,
    satuanKerja: satker,
  };

  const baris = await prisma.dokumenTte.findMany({
    where: kunci,
    select: { id: true, status: true, nomorDokumen: true, fileDraftPath: true },
  });

  const sudahTte = baris.filter((b) => b.status === "TERTANDATANGANI");
  if (sudahTte.length > 0) {
    return {
      error:
        "SPTJM periode ini sudah ditandatangani, jadi tidak bisa dihapus sebagai draft." +
        " Pakai TTE Ulang kalau ingin menandatanganinya kembali.",
    };
  }

  const idHapus = baris.map((b) => b.id);

  if (idHapus.length > 0) {
    try {
      await prisma.$transaction([
        prisma.logGagalTte.updateMany({
          where: { dokumenTteId: { in: idHapus } },
          data: { dokumenTteId: null },
        }),
        prisma.auditTrail.create({
          data: {
            entitas: "dokumen_tte",
            entitasId: idHapus.join(","),
            aksi: "DELETE",
            aktor: user.nip,
            // Unit yang DIKENAI aksi, bukan unit aktornya.
            satuanKerja: satker,
            dataSebelum: {
              keterangan: "draft SPTJM dibersihkan untuk disusun ulang",
              jenisDokumen: params.jenis,
              periode: `${bulan}/${tahun}`,
              baris: baris.map((b) => ({ status: b.status, nomorDokumen: b.nomorDokumen })),
            },
            // dataSesudah sengaja TIDAK diisi - penghapusan tidak punya "sesudah".
          },
        }),
        prisma.dokumenTte.deleteMany({ where: { id: { in: idHapus } } }),
      ]);
    } catch (err) {
      return { error: pesanGalatUntukLayar("tte.hapusDraft", err, "Gagal menghapus draft") };
    }
  }

  // Berkas dihapus PALING AKHIR, sesudah database berhasil. Kalau dibalik dan
  // transaksinya gagal, yang tertinggal baris yang menunjuk berkas yang sudah
  // tidak ada - terbaca seperti dokumen rusak, bukan seperti penghapusan yang
  // gagal. Berkas yatim hanya memakan disk.
  let berkasTerhapus = 0;
  const kandidat = baris.map((b) => b.fileDraftPath).filter((v): v is string => Boolean(v));
  // Berkas pratinjau tidak punya baris di database - namanya diturunkan dari
  // periode & unit, jadi dicari langsung.
  const jalurHapus = kandidat
    .map((k) => jalurAman(k, "tte"))
    .filter((j): j is string => j !== null);
  const kunciPratinjau = kunciPratinjauTte(
    satker,
    tahun,
    bulan,
    generateNamaFileSptjm(params.jenis, bulan, tahun, satker)
  );
  const jalurPratinjau = jalurAman(kunciPratinjau, "tte");
  if (jalurPratinjau) jalurHapus.push(jalurPratinjau);
  for (const jalur of jalurHapus) {
    try {
      await fs.unlink(jalur);
      berkasTerhapus++;
    } catch {
      /* tidak ada / tidak bisa dihapus - dibiarkan */
    }
  }

  revalidatePath("/kasubag/kalkulasi");
  revalidatePath("/ppabp/adk");

  if (idHapus.length === 0 && berkasTerhapus === 0) {
    return { success: true, pesan: "Tidak ada draft yang perlu dihapus." };
  }
  return {
    success: true,
    pesan: `Draft dibersihkan - ${idHapus.length} catatan dan ${berkasTerhapus} berkas dihapus. SPTJM bisa disusun ulang.`,
  };
}

/**
 * Server Action Utama: Menandatangani SPTJM unit (Tukin, Uang Makan, atau Lembur).
 *
 * PENANDA TANGANNYA KASUBAG TU UNIT ITU SENDIRI - bukan PPK/PPABP.
 * Keputusan user 2026-10-20, ditegakkan lewat canTandatanganiSptjmUnit.
 * Mengimplementasikan 11 Kriteria Integrasi BSrE BSSN
 */
export async function signSptjmUnitAction(
  _prev: TteActionResult,
  formData: FormData
): Promise<TteActionResult> {
  const user = await ambilUserSesi();
  if (!user) return { error: "Sesi tidak ditemukan. Silakan login kembali." };

  const jenis = (formData.get("jenis") as JenisSptjm) || "SPTJM_TUKIN";
  const bulan = Number(formData.get("bulan"));
  const tahun = Number(formData.get("tahun"));
  const passphrase = String(formData.get("passphrase") || "");
  const nik = String(formData.get("nik") || process.env.TEST_BSRE_NIK || "0803202100007062");
  // SATUAN KERJA DITURUNKAN DARI SESI, BUKAN DARI FORM.
  //
  // Sebelumnya nilainya dibaca dari `formData.get("satuanKerja")`, dan titik
  // masuknya (`POST /api/tte`) menyalin SELURUH isi JSON ke FormData apa
  // adanya. Akibatnya siapa pun yang punya sesi bisa menandatangani SPTJM
  // unit mana saja - termasuk unit yang bukan miliknya. Untuk dokumen yang
  // isinya pernyataan TANGGUNG JAWAB MUTLAK atas hitungan unit, itu lubang
  // yang membatalkan maksud dokumennya.
  const satker = user.satuanKerja ?? "";

  // Penomoran Opsi A: Mengambil nomor dari input form, atau default jika kosong
  const nomorInput = String(formData.get("nomorDokumen") || "").trim();
  const nomorDokumen = nomorInput || generateNomorSptjmDefault(jenis, bulan, tahun);

  const authUser: AuthUser = {
    nip: user.nip,
    role: user.role,
    satuanKerja: user.satuanKerja,
    aktif: user.aktif,
  };
  if (!canTandatanganiSptjmUnit(authUser, satker)) {
    return {
      error:
        "Hanya Kasubag TU satuan kerja ini yang berwenang menandatangani SPTJM-nya.",
    };
  }
  // Periode membentuk letak berkas; divalidasi SEBELUM ada baris dokumen atau
  // pemanggilan BSrE supaya periode cacat tidak meninggalkan dokumen yatim.
  if (!periodeSah(bulan, tahun)) {
    return { error: "Periode tidak sah." };
  }

  // Inti penandatanganan (identitas dari Pegawai, pencocokan NIK, status
  // sertifikat, BSrE, pencatatan log_gagal_tte, penyimpanan) ada di
  // src/lib/tte/tandatanganiDokumen.ts - dipakai bersama dokumen lembur.
  // NIK demo BSrE (TTE_IZINKAN_NIK_DEMO) HANYA berlaku di jalur SPTJM ini.
  return tandatanganiDokumen({
    user: { id: user.id, nip: user.nip },
    jenisDokumen: jenis,
    satuanKerja: satker,
    periodeBulan: bulan,
    periodeTahun: tahun,
    nomorDokumen,
    // Judulnya TIDAK lagi menyebut PPK: yang menandatangani Kasubag TU unit.
    judulDokumen: `SPTJM ${jenis.replace("SPTJM_", "")} ${satker} ${bulan}/${tahun}`,
    labelDokumen: "SPTJM",
    namaBerkasResmi: generateNamaFileSptjm(jenis, bulan, tahun, satker),
    namaBerkasKirim: `sptjm_${jenis.toLowerCase()}_${bulan}_${tahun}.pdf`,
    nik,
    passphrase,
    izinkanNikDemoBsre: true,
    buatPdf: (penandatangan) =>
      generateDraftSptjm({
        jenis,
        nomorDokumen,
        periodeBulan: bulan,
        periodeTahun: tahun,
        namaPenandatangan: penandatangan.nama,
        nipPenandatangan: penandatangan.nip,
        jabatanPenandatangan: penandatangan.jabatan,
        satuanKerja: satker,
        unitEselon1: "Sekretariat Jenderal",
      }),
    pathRevalidasi: ["/ppabp/adk", "/kasubag/kalkulasi"],
  });
}

/**
 * Kompatibilitas untuk pemanggil lama Kasubag TU Lembur
 */
export async function signSptjmLemburAction(
  _prev: TteActionResult,
  formData: FormData
): Promise<TteActionResult> {
  formData.set("jenis", "SPTJM_LEMBUR");
  return signSptjmUnitAction(_prev, formData);
}
