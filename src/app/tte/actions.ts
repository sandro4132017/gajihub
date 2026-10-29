"use server";

import { revalidatePath } from "next/cache";
import { isModeInternal } from "@/auth/modeJaringan";
import { tautanVerifikasiDokumen } from "@/lib/tte/alamatVerifikasi";
import { hitungHashBerkas } from "@/lib/tte/hashBerkas";
import { buatSpesimenQr, ambilTemplateSpesimen } from "@/lib/tte/spesimenTte";
import { prisma } from "@/lib/prisma";
import { ambilUserSesi } from "@/auth/getSessionAccount";
import {
  canLihatDokumenSptjm,
  canTandatanganiSptjmUnit,
  type AuthUser,
} from "@/auth/permissions";
import { checkUserStatus, signPdf } from "@/lib/tte/esignClient";
import {
  generateDraftSptjm,
  generateNomorSptjmDefault,
  generateNamaFileSptjm,
  terapkanStempelTteSimulasi,
  type JenisSptjm,
} from "@/lib/tte/sptjmPdf";
import { idDokumenSimulasi } from "@/lib/tte/simulasiTte";
import { namaCetakPegawai } from "@/business-logic/namaPegawai";
import { kunciSidikNik, sidikNik } from "@/auth/sidikNik";
import {
  folderPeriode,
  jalurAman,
  kunciDraftTte,
  kunciPratinjauTte,
  kunciSignedTte,
} from "@/lib/storage/berkasPrivat";
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
  } catch (err: any) {
    return { error: `Gagal membuat draft: ${err.message}` };
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
      return {
        error: `Gagal menghapus draft: ${err instanceof Error ? err.message : String(err)}`,
      };
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

  // IDENTITAS PENANDA TANGAN DIAMBIL DARI TABEL PEGAWAI, bukan dari form.
  //
  // Nama, NIP, dan jabatan ini TERCETAK di dokumen dan tersimpan di
  // DokumenTte sebagai jawaban atas "siapa yang menandatangani". Selama
  // nilainya datang dari field tersembunyi di browser, jawabannya adalah apa
  // kata browser - bukan siapa yang login. Bawaannya pun dulu satu nama
  // sungguhan yang di-hardcode untuk SEMUA unit.
  //
  // TODO(confirm): NIK yang diketik saat menandatangani BELUM bisa dicocokkan
  // ke orang ini. Jembatannya `Pegawai.sidikNik` (HMAC dari NIK) ada di skema
  // tapi KOSONG - terukur 0 dari 5.302 baris, dan SIDIK_NIK_SECRET belum
  // diisi. Jadi yang dijamin sekarang: penanda tangan adalah Kasubag TU unit
  // ini, dan dia memegang passphrase sertifikat NIK tersebut. Yang BELUM
  // dijamin: NIK itu benar-benar NIK miliknya. Dilewati dengan alasan, bukan
  // ditebak - isi SIDIK_NIK_SECRET lalu jalankan sync:pegawai untuk menutupnya.
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
    // Jabatan ikut tercetak di dokumen. Mengarangnya pada surat pernyataan
    // tanggung jawab bukan pilihan - perbaiki datanya dulu.
    return {
      error:
        "Jabatan pada data pegawai Anda masih kosong. Lengkapi dulu di Data Pegawai sebelum menandatangani SPTJM.",
    };
  }
  // NAMA LENGKAP DENGAN GELAR - naskah SPTJM resmi memakai bentuk itu, dan
  // SIAP menyimpan gelarnya di kolom terpisah. Memakai `nama` apa adanya
  // menghilangkan gelar seseorang dari dokumen yang dia tanda tangani, dan
  // mencetaknya KAPITAL SEMUA sebagaimana tersimpan di SIAP.
  const namaPenandatangan = namaCetakPegawai(pegawai);
  const nipPenandatangan = pegawai.nip;
  const jabatanPenandatangan = pegawai.jabatan.trim();

  // NIK YANG DIKETIK HARUS MILIK PEMEGANG SESI.
  //
  // Tanpa ini, siapa pun yang login sebagai Kasubag TU unit ini bisa
  // menandatangani memakai NIK dan passphrase ORANG LAIN. Hasilnya dokumen
  // yang bertentangan dengan dirinya sendiri: nama yang TERCETAK diambil
  // dari akun yang login, sementara tanda tangan kriptografisnya milik
  // pemegang sertifikat yang lain. Pada surat pernyataan tanggung jawab
  // MUTLAK, itu berarti yang disebut bertanggung jawab bukan yang
  // menandatangani.
  //
  // Pencocokannya lewat SIDIK (HMAC), bukan NIK tersimpan - proyek ini
  // sengaja tidak pernah menyimpan NIK (lihat src/auth/sidikNik.ts).
  //
  // DILEWATI DENGAN ALASAN, BUKAN DIAM-DIAM, kalau jembatannya belum siap:
  // SIDIK_NIK_SECRET belum diisi, atau pegawai ini belum punya sidik karena
  // `sync:pegawai` belum dijalankan ulang sesudah kuncinya diisi. Memblokir
  // penandatanganan karena konfigurasi yang belum lengkap akan mematikan
  // fitur yang sedang dipakai; yang dilakukan: dicatat ke log server.
  if (pegawai.sidikNik) {
    let sidikDiketik: string | null = null;
    try {
      sidikDiketik = sidikNik(nik, kunciSidikNik());
    } catch {
      sidikDiketik = null; // kunci belum diisi - lihat catatan di bawah
    }
    if (sidikDiketik === null) {
      console.warn(
        "[tte] NIK tidak dapat dicocokkan ke pemegang sesi - SIDIK_NIK_SECRET belum diisi " +
          "atau NIK-nya tidak berbentuk sah. Penandatanganan DILANJUTKAN."
      );
    } else if (sidikDiketik !== pegawai.sidikNik) {
      return {
        error:
          "NIK yang dimasukkan bukan milik akun yang sedang login. SPTJM harus " +
          "ditandatangani oleh pemiliknya sendiri - silakan login dengan akun Anda.",
      };
    }
  } else {
    console.warn(
      `[tte] Pegawai ${user.nip} belum punya sidik NIK, jadi NIK yang diketik tidak ` +
        "dapat dicocokkan. Isi SIDIK_NIK_SECRET lalu jalankan npm run sync:pegawai."
    );
  }

  // STATUS SERTIFIKAT DIPERIKSA DI SERVER, bukan hanya di layar.
  //
  // Modal memang sudah memanggil cek status lebih dulu, tapi itu pemeriksaan
  // SISI KLIEN: siapa pun yang memanggil /api/tte langsung melewatinya.
  //
  // Tanpa penjagaan ini akibatnya menyesatkan, bukan sekadar longgar: NIK
  // yang belum terdaftar membuat BSrE membalas galat, galat itu BUKAN
  // "passphrase salah", dan selama mode INTERNAL aktif cabang berikutnya
  // jatuh ke SIMULASI. Jadi orang yang mencoba dengan NIK yang belum
  // terdaftar akan melihat dokumennya TERBIT - padahal tidak ada tanda
  // tangan BSrE di dalamnya. Lebih baik ditolak terang-terangan.
  //
  // Diukur langsung ke BSrE: NIK karangan membalas NOT_REGISTERED (2011)
  // atau NO_CERTIFICATE (2021); akun yang sah membalas ISSUE (1111).
  const statusSertifikat = await checkUserStatus(nik);
  if (statusSertifikat.status !== "ISSUE") {
    return {
      error:
        `Sertifikat elektronik untuk NIK ini belum siap dipakai (${statusSertifikat.status}). ` +
        "Pastikan NIK-nya benar dan sudah terdaftar di BSrE sebelum menandatangani.",
    };
  }

  if (!passphrase) {
    return { error: "Passphrase wajib diisi untuk menandatangani dokumen." };
  }

  try {
    // 1. Generate Draft PDF
    const draftPdfBuffer = await generateDraftSptjm({
      jenis,
      nomorDokumen,
      periodeBulan: bulan,
      periodeTahun: tahun,
      namaPenandatangan,
      nipPenandatangan,
      jabatanPenandatangan,
      satuanKerja: satker,
      unitEselon1: "Sekretariat Jenderal",
    });

    // Judulnya TIDAK lagi menyebut PPK: yang menandatangani Kasubag TU unit.
    const judulDokumen = `SPTJM ${jenis.replace("SPTJM_", "")} ${satker} ${bulan}/${tahun}`;

    // 2. Buat / Update record DokumenTte di DB
    const recordDokumen = await prisma.dokumenTte.create({
      data: {
        jenisDokumen: jenis,
        nomorDokumen,
        judulDokumen,
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

    // 3. Panggil Server Esign Client BSrE
    //
    // Tautan QR diambil dari KONFIGURASI, bukan dari header permintaan.
    // Header menceritakan bagaimana penandatangan membuka halaman ini;
    // QR-nya dibaca orang lain dari HP, dan alamatnya terkunci permanen di
    // dalam PDF. Lihat src/lib/tte/alamatVerifikasi.ts.
    const linkQrVerifikasi = tautanVerifikasiDokumen(recordDokumen.id);

    const signResult = await signPdf({
      fileBuffer: draftPdfBuffer,
      fileName: `sptjm_${jenis.toLowerCase()}_${bulan}_${tahun}.pdf`,
      nik,
      passphrase, // Passphrase hanya di memori dan langsung dibuang setelah request
      tampilan: "visible",
      // SPESIMEN KUSTOM, bukan QR polos.
      //
      // Cabang image=false + linkQR hanya menghasilkan QR telanjang - renderer
      // BSrE tidak punya tombol gaya apa pun di cabang itu. Cabang image=true
      // menerima gambar yang kita susun sendiri, dan di situlah logo Gajihub
      // bisa ditaruh di tengah QR. Tanda tangan kriptografisnya tetap milik
      // BSrE; yang berpindah tangan hanya penggambaran visualnya.
      image: true,
      imageTTDBuffer: buatSpesimenQr(linkQrVerifikasi, ambilTemplateSpesimen()).png,
      tagKoordinat: "#",
      width: 60,
      height: 60,
      reason: `Penetapan Dokumen ${judulDokumen}`,
      location: "Jakarta",
    });

    let signedPdfFinal: Buffer;
    // Id BSrE HANYA diisi kalau BSrE memang menjawab. Cabang simulasi di
    // bawah mengisinya dengan id berawalan SIMULASI-, supaya dokumen yang
    // tidak pernah ditandatangani BSrE tidak bisa terbaca sebagai sah.
    let idDokumenBsreFinal: string | null = signResult.idDokumen || null;
    let isSimulasiMode = false;

    if (signResult.success && signResult.signedPdfBuffer) {
      // TTE Berhasil melalui server BSrE riil
      signedPdfFinal = signResult.signedPdfBuffer;
    } else {
      // Jika server BSrE offline / timeout (misal testing localhost tanpa VPN kantor):
      // Terapkan simulasi TTE resmi agar pengujian lokal tetap menghasilkan file PDF bertanda tangan digital
      const errorMsg = (signResult.error || "").toLowerCase();
      const isConnectionOrServer500 =
        (signResult.statusCode !== undefined && signResult.statusCode >= 500) ||
        errorMsg.includes("http 500") ||
        errorMsg.includes("timeout") ||
        errorMsg.includes("koneksi") ||
        errorMsg.includes("network") ||
        errorMsg.includes("fetch failed") ||
        errorMsg.includes("econnrefused");
      const isPassphraseError =
        errorMsg.includes("passphrase") ||
        signResult.statusCode === 0;

      // Jika server BSrE aktif dan mengembalikan passphrase salah, jangan samarkan sebagai simulasi
      if (isPassphraseError) {
        // KRITERIA IX: setiap kegagalan penandatanganan WAJIB tercatat di
        // log_gagal_tte - dan passphrase salah justru kegagalan yang paling
        // sering. Cabang ini dulu mengubah status jadi GAGAL lalu langsung
        // `return`, jadi tidak ada satu pun barisnya tertulis. Terukur:
        // 1 dokumen berstatus GAGAL, 0 baris log_gagal_tte.
        //
        // Pesan galatnya TIDAK BOLEH memuat passphrase - lihat peringatan di
        // model LogGagalTte pada prisma/schema.prisma.
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

      if (isConnectionOrServer500 || isModeInternal() || process.env.NODE_ENV !== "production") {
        isSimulasiMode = true;
        idDokumenBsreFinal = idDokumenSimulasi(recordDokumen.id);
        // KEGAGALAN BSrE TETAP DICATAT walau PDF-nya tetap terbit.
        // Cabang ini dulu menelan galatnya sepenuhnya: dokumen tersimpan
        // "TERTANDATANGANI" tanpa satu pun jejak bahwa BSrE tidak menjawab.
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
        // Kegagalan otentikasi / passphrase salah pada server aktif (Kriteria IX BSrE)
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
    }

    // 4. Simpan berkas PDF tertandatangani.
    //
    // DITARUH DI SUBFOLDER BER-ID DOKUMEN, bukan langsung di satu folder.
    // Nama resminya hanya diturunkan dari jenis + bulan + tahun + unit, jadi
    // dua kali menandatangani periode yang SAMA menghasilkan nama yang sama
    // dan berkas yang kedua MENIMPA yang pertama. Terukur: 3 baris
    // dokumen_tte SPTJM_TUKIN 8/2026 semuanya menunjuk satu berkas yang
    // sama, jadi dua di antaranya memeriksa berkas milik dokumen lain -
    // dan verifikasi tanda tangan yang memeriksa berkas yang salah tidak
    // ada gunanya.
    //
    // Nama dasarnya tetap nama resmi supaya tampil benar saat diunduh;
    // atribut `download` di panel juga sudah menyetelnya sendiri.
    const namaResmiSigned = generateNamaFileSptjm(jenis, bulan, tahun, satker);
    const kunciSigned = kunciSignedTte(satker, tahun, bulan, recordDokumen.id, namaResmiSigned);
    await tulisBerkasTte(kunciSigned, signedPdfFinal);

    // Sidik diambil dari bita yang BENAR-BENAR ditulis ke disk, bukan dari
    // draft sebelum ditandatangani - yang dibandingkan orang nanti adalah
    // berkas yang mereka unduh dari sini.
    const hashBerkas = hitungHashBerkas(signedPdfFinal);

    await prisma.dokumenTte.update({
      where: { id: recordDokumen.id },
      data: {
        status: "TERTANDATANGANI",
        fileSignedPath: kunciSigned,
        idDokumenBsre: idDokumenBsreFinal,
        // JANGAN mengarang lama penandatanganan. Nilai bawaan 120 ms dulu
        // dipakai juga saat simulasi - angka yang terlihat masuk akal untuk
        // penandatanganan yang tidak pernah terjadi. null jauh lebih jujur.
        signingTimeMs: isSimulasiMode ? null : signResult.signingTimeMs ?? null,
        signedAt: new Date(),
        hashBerkas,
      },
    });

    revalidatePath("/ppabp/adk");
    revalidatePath("/kasubag/kalkulasi");

    return {
      success: true,
      dokumenId: recordDokumen.id,
      idDokumenBsre: idDokumenBsreFinal ?? undefined,
      // Rute berizin, bukan letak di disk (yang tidak pernah sampai ke klien).
      downloadUrl: `/berkas/tte/${recordDokumen.id}`,
      nomorDokumen,
      penandatanganNama: namaPenandatangan,
      isSimulasi: isSimulasiMode,
    };
  } catch (err: any) {
    await prisma.logGagalTte.create({
      data: {
        nip: nipPenandatangan,
        userId: user.id,
        statusCode: 500,
        pesanError: err.message || "Internal Server Error",
        kategoriError: "SYSTEM_EXCEPTION",
      },
    });

    return { error: `Terjadi kendala teknis: ${err.message}` };
  }
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
