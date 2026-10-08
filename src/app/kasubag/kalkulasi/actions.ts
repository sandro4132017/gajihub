"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../auth/getSessionAccount";
import { canAjukanKalkulasiTukinMassalUnit, canTelaahKoreksiAjukanUangLemburUnit, type AuthUser } from "../../../auth/permissions";
import { hitungTukin } from "../../../business-logic/tukin";
import { parseJenisCuti } from "../../../business-logic/jenisCuti";
import { hitungUangMakan } from "../../../business-logic/uangMakan";
import { hitungUangLembur } from "../../../business-logic/uangLembur";
import { validasiTukin, validasiUangMakan, validasiUangLembur } from "../../../validation/validationGate";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../business-logic/tarifTukinPokok";
import { kelasJabatanEfektif } from "../../../business-logic/kelasJabatanEfektif";
import {
  dikecualikanPotonganKehadiran,
  labelPengecualianKehadiran,
} from "../../../business-logic/pejabatPimpinanTinggi";
import {
  TARIF_UANG_MAKAN_PER_HARI,
  TARIF_UANG_LEMBUR_PER_JAM,
  TARIF_UANG_MAKAN_LEMBUR_PER_HARI,
  kurungTarifSbm,
} from "../../../business-logic/tarifSbm";
import { statusUnit } from "../../../business-logic/pengirimanUnit";
import { muatHariLiburPeriode } from "../../../lib/hariLibur";
import { tglTampil } from "../../tanggalTampil";
import type { Prisma } from "@prisma/client";

const HARI_KERJA_DEFAULT = 21;

export interface KalkulasiMassalFormState {
  error?: string;
  success?: string;
  /**
   * Aksinya berjalan tanpa kegagalan, TAPI tidak ada satu angka pun yang
   * berubah - mis. semua pegawai dilewati karena datanya kurang. Dipisah dari
   * `success` karena warna hijau di situ terbaca "beres" dan orang berhenti di
   * situ, padahal justru masih ada langkah yang harus diambil. Pernah terjadi
   * betulan: "Tukin terhitung untuk 0 pegawai" tampil hijau, 47 baris tetap
   * basi, dan penanda kuning di tabel dikira bug.
   */
  peringatan?: string;
  ringkasan?: {
    dihitung: number;
    dilewati: number;
    /**
     * Sebab yang BARU ketahuan saat menghitung - kelas jabatan kosong, tarif
     * belum dikonfigurasi, presensi belum ada.
     *
     * TIDAK memuat "predikat kinerja belum diupload": itu sudah dinyatakan
     * lebih dulu lewat kotak centang persetujuan, dan mengulanginya di laporan
     * hasil membuat orang membaca daftar yang isinya sudah dia setujui sendiri
     * semenit sebelumnya. Jumlahnya tetap dilaporkan lewat `dilewatiPredikat`.
     */
    detailDilewati: string[];
    /** Berapa yang dilewati KARENA predikat - sesuai persetujuan, bukan temuan. */
    dilewatiPredikat: number;
    /**
     * Pegawai yang Tukin-nya BERHASIL dihitung tapi Uang Makan/Lembur-nya
     * tidak. Dipisah dari `detailDilewati` karena artinya beda jauh: yang di
     * sini datanya TERSIMPAN sebagian, bukan gagal total.
     */
    detailSebagian: string[];
  };
}

async function ambilAuthUser(): Promise<AuthUser | null> {
  const akun = await getSessionAccount();
  if (!akun) return null;
  const user = await ambilUserSesi();
  if (!user) return null;
  return { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };
}

/**
 * Kalkulasi massal Tukin + Uang Makan unit, langsung dari PresensiHarian +
 * PredikatKinerja yang sudah tersedia di database (BUKAN via job scheduler
 * src/jobs/hitungTukinPeriodeJob.ts, karena job itu iterate
 * siap.getPegawaiAktif() yang cuma mengembalikan 2 pegawai mock, tidak
 * mencakup data Pegawai asli - lihat catatan yang sama di src/db/seedSimulasi.ts).
 * Reuse pure function hitungTukin/hitungUangMakan + validasiTukin/validasiUangMakan
 * yang sama dipakai job scheduler, cuma orchestration-nya beda.
 *
 * Uang Lembur SEKARANG ikut dihitung, memakai `totalJamLembur` dan
 * `jumlahHariMakanLembur` dari rekap presensi yang di-upload (SBM 2026 item
 * 23.1 + 23.2). Kalau jam lemburnya nol, barisnya tidak dibuat. Koreksi
 * manual per pegawai tetap tersedia lewat koreksiUangLemburAction di bawah.
 */
export async function kalkulasiMassalTukinUangMakanAction(
  _state: KalkulasiMassalFormState,
  formData: FormData
): Promise<KalkulasiMassalFormState> {
  try {
    const authUser = await ambilAuthUser();
    if (!authUser) return { error: "Sesi login sudah habis - silakan login ulang." };

    const satuanKerja = String(formData.get("satuanKerja") ?? "");
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    if (!satuanKerja || !periodeBulan || !periodeTahun) {
      return { error: "Satuan kerja dan periode wajib diisi." };
    }
    if (!canAjukanKalkulasiTukinMassalUnit(authUser, satuanKerja)) {
      return { error: "Role kamu tidak berwenang mengajukan kalkulasi massal unit ini." };
    }

    // --- KUNCI PENGIRIMAN ---
    //
    // Unit yang rekapnya sudah dikirim ke PPABP TIDAK boleh dihitung ulang.
    // Ini inti dari "yang dikirim terkunci": tanpa penjagaan di sini, angka
    // yang dilihat PPABP bisa berubah di bawah kakinya sendiri - dia membuka
    // berkas ADK dengan angka yang sudah tidak sama dengan yang disetujui
    // Kasubag TU, dan tidak ada apa pun yang memberitahunya.
    //
    // Dicek di SERVER, bukan cuma dengan menyembunyikan tombolnya: tombol
    // yang hilang tidak menghentikan permintaan yang dikirim ulang dari
    // DevTools atau dari tab yang sudah lama terbuka sebelum unit mengirim.
    const pengiriman = await prisma.pengirimanUnit.findUnique({
      where: {
        satuanKerja_periodeBulan_periodeTahun: { satuanKerja, periodeBulan, periodeTahun },
      },
    });
    if (statusUnit(pengiriman).terkunci) {
      return {
        error:
          "Rekap periode ini sudah dikirim ke PPABP dan terkunci, jadi tidak bisa dihitung ulang. Kalau ada yang perlu diperbaiki, minta PPABP mengembalikannya lebih dulu.",
      };
    }

    // HANYA PEGAWAI AKTIF. Yang berstatus PENSIUN/BERHENTI/NONAKTIF tidak
    // diproses dan tidak dilaporkan sebagai "dilewati".
    //
    // Sebelumnya seluruh isi unit ikut diproses, lalu pensiunan muncul di
    // daftar "dilewati - predikat kinerja belum diupload" tiap kali kalkulasi
    // dijalankan. Itu bukan informasi: predikat mereka memang tidak akan
    // pernah ada lagi, jadi barisnya tidak pernah bisa hilang dan tidak ada
    // yang bisa dikerjakan atasnya. Keluhan yang tidak bisa ditindaklanjuti
    // membuat daftar "dilewati" berhenti dibaca - termasuk baris yang
    // sungguhan.
    const pegawaiList = await prisma.pegawai.findMany({
      where: {
        satuanKerja,
        statusPegawai: "AKTIF",
        // Yang dikecualikan pada periode ini tidak diproses sama sekali -
        // bukan diproses lalu dibuang. Lihat
        // src/business-logic/pengecualianPegawai.ts.
        pengecualian: { none: { periodeBulan, periodeTahun } },
      },
    });

    // --- Gerbang kelengkapan predikat kinerja ---
    //
    // Dicek ULANG di sini, tidak cuma di UI: checkbox di form bisa dikirim
    // siapa saja, dan jumlah pegawai yang belum punya predikat bisa berubah
    // antara halaman dirender dan tombol ditekan (mis. ada yang upload file
    // di saat bersamaan).
    //
    // Yang dicek KELENGKAPAN, bukan jumlah file yang diupload - satu satuan
    // kerja bisa dinilai beberapa penilai dengan jumlah yang beda-beda per
    // unit, jadi "harus ada N file" adalah angka yang tidak dipunyai sistem.
    const lanjutkanTanpaLengkap = formData.get("lanjutkanTanpaLengkap") === "1";
    const nipAktif = pegawaiList.filter((p) => p.statusPegawai === "AKTIF");
    const punyaPredikat = await prisma.predikatKinerja.findMany({
      where: { pegawaiId: { in: nipAktif.map((p) => p.id) }, periodeBulan, periodeTahun },
      select: { pegawaiId: true },
    });
    const setPunya = new Set(punyaPredikat.map((k) => k.pegawaiId));
    const belumPunyaPredikat = nipAktif.filter((p) => !setPunya.has(p.id));

    if (belumPunyaPredikat.length > 0 && !lanjutkanTanpaLengkap) {
      const contoh = belumPunyaPredikat.slice(0, 5).map((p) => p.nama).join(", ");
      return {
        error:
          `${belumPunyaPredikat.length} pegawai aktif belum punya predikat kinerja periode ${periodeBulan}/${periodeTahun}` +
          ` (mis. ${contoh}${belumPunyaPredikat.length > 5 ? ", dst" : ""}).` +
          " Biasanya file dari salah satu unit penilai belum diupload." +
          " Upload dulu lewat menu Predikat Kinerja, atau centang persetujuan di bawah kalau memang mau dihitung tanpa mereka.",
      };
    }

    // ========================================================================
    // GERBANG "SUDAH APPROVED" DICABUT (2026-09-02) bersama approval
    // berjenjang. Dulu di sini ada pilihan lewati/hitung-ulang plus kotak
    // konfirmasi, karena menghitung ulang membatalkan approval satu unit
    // penuh - di Biro Keuangan periode 7/2026 itu terjadi tiga kali.
    //
    // Sekarang tidak ada approval yang bisa dibatalkan, dan penjagaannya
    // pindah ke tempat yang lebih tegas: kunci pengiriman unit, dicek di
    // atas. Bedanya penting - kunci itu MENOLAK seluruh kalkulasi ulang
    // dengan alasan yang terbaca, bukan melewati sebagian baris diam-diam.
    let dihitung = 0;
    const detailDilewati: string[] = [];
    let dilewatiPredikat = 0;
    const detailSebagian: string[] = [];

    // SK hukuman disiplin yang MENURUNKAN kelas jabatan (PP 94/2021). SIAP
    // tidak mencatatnya sama sekali, jadi angkanya cuma ada di sini - lihat
    // src/business-logic/kelasJabatanEfektif.ts. Diambil sekali untuk seluruh
    // unit, bukan per pegawai, supaya tidak jadi ratusan query.
    const skHukdis = await prisma.skHukumanDisiplin.findMany({
      where: {
        pegawaiId: { in: pegawaiList.map((p) => p.id) },
        status: "DISETUJUI",
        kelasJabatanSelamaHukuman: { not: null },
      },
    });
    const skPerPegawai = new Map<string, typeof skHukdis>();
    for (const sk of skHukdis) skPerPegawai.set(sk.pegawaiId, [...(skPerPegawai.get(sk.pegawaiId) ?? []), sk]);

    for (const pegawai of pegawaiList) {
      // Kelas EFEKTIF, bukan kelas di data kepegawaian - pegawai yang sedang
      // menjalani penurunan jabatan dibayar dengan tarif kelas yang turun.
      const efektif = kelasJabatanEfektif(
        pegawai.kelasJabatan,
        skPerPegawai.get(pegawai.id) ?? [],
        periodeBulan,
        periodeTahun
      );
      if (!efektif.kelas) {
        detailDilewati.push(`${pegawai.nama}: kelas jabatan tidak diketahui.`);
        continue;
      }
      const tukinPokokKelasJabatan = TUKIN_POKOK_PER_KELAS_JABATAN[efektif.kelas];
      if (tukinPokokKelasJabatan === undefined) {
        detailDilewati.push(`${pegawai.nama}: tarif tukin pokok kelas jabatan ${efektif.kelas} belum dikonfigurasi.`);
        continue;
      }
      if (efektif.sk) {
        // Perubahan tarif karena hukuman TIDAK boleh terjadi diam-diam -
        // dilaporkan ke layar bersama hasil kalkulasi.
        detailSebagian.push(
          `${pegawai.nama}: kelas jabatan ${efektif.kelasDasar} -> ${efektif.kelas} karena hukuman disiplin` +
            ` (${efektif.sk.skBelumTerbit ? "SK BELUM TERBIT" : `SK ${efektif.sk.nomorSk}`}),` +
            ` tarif tukin pokok mengikuti kelas ${efektif.kelas}.`
        );
      }

      const predikat = await prisma.predikatKinerja.findUnique({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
      });
      if (!predikat) {
        // TIDAK masuk detailDilewati - lihat catatannya di tipe `ringkasan`.
        dilewatiPredikat++;
        continue;
      }

      // Dua sumber presensi (lihat model RekapPresensiPeriode di
      // schema.prisma): RekapPresensiPeriode DIUTAMAKAN, kalau tidak ada baru
      // dihitung dari PresensiHarian. Sinkronisasi e-Presensi mengisi KEDUANYA,
      // jadi jalur pertama yang biasanya terpakai.
      // TODO(confirm): belum ada aturan mana yang menang kalau rekap hasil
      // upload manual dan hasil sinkronisasi sama-sama ada untuk periode yang
      // sama - sekarang yang tersimpan terakhir yang dipakai.
      const rekapManual = await prisma.rekapPresensiPeriode.findUnique({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
      });
      const presensi = rekapManual
        ? []
        : await prisma.presensiHarian.findMany({
            where: { pegawaiId: pegawai.id, tanggal: { gte: new Date(periodeTahun, periodeBulan - 1, 1), lt: new Date(periodeTahun, periodeBulan, 1) } },
          });
      if (!rekapManual && presensi.length === 0) {
        detailDilewati.push(`${pegawai.nama}: data presensi periode ini belum tersedia.`);
        continue;
      }

      const jumlahHariAlpha = rekapManual?.jumlahHariAlpha ?? presensi.filter((p) => p.statusKehadiran === "ALPHA").length;
      const jumlahTidakPresensi =
        rekapManual?.jumlahTidakPresensi ?? presensi.filter((p) => p.statusKehadiran === "TIDAK_PRESENSI").length;
      const totalMenitTerlambat =
        rekapManual?.totalMenitTerlambat ?? presensi.reduce((a, p) => a + p.menitTerlambat, 0);
      const totalMenitPulangCepat =
        rekapManual?.totalMenitPulangCepat ?? presensi.reduce((a, p) => a + p.menitPulangCepat, 0);
      const totalMenitMeninggalkanKantor =
        rekapManual?.totalMenitMeninggalkanKantor ?? presensi.reduce((a, p) => a + p.menitMeninggalkanKantor, 0);
      // Tugas belajar: Tunjangan Kinerja dibayar 80% (Permenaker 15/2024).
      // Satu hari berstatus tugas belajar sudah cukup menandai periode ini -
      // pasalnya menyebut "setiap bulan SEJAK yang bersangkutan melaksanakan
      // tugas belajar", jadi bulan pertama pun ikut walau belum genap sebulan.
      // TODO(confirm): bulan TERAKHIR tugas belajar juga jadi ikut 80% walau
      // pegawainya sudah kembali bekerja di pertengahan bulan - perlu
      // ditegaskan apakah bulan penutup itu dibayar penuh atau 80%.
      const tugasBelajar = (rekapManual?.jumlahHariTugasBelajar ?? 0) > 0;

      // Cuti (Pasal 14). Hanya dari rekap - PresensiHarian menyimpan status
      // CUTI tanpa jenisnya, dan menebak jenis cuti berarti menebak tarif
      // potongannya (cuti tahunan 0% vs cuti besar bulan I 50%).
      //
      // `parseJenisCuti` dipakai lagi di sini walaupun nilainya sudah
      // divalidasi saat disimpan - kolomnya bertipe String bebas di database,
      // jadi nilai asing tetap mungkin masuk lewat jalur lain. Yang tidak
      // dikenali diperlakukan sebagai TIDAK cuti + dilaporkan, bukan dipaksa
      // ke salah satu jenis.
      const jenisCuti = parseJenisCuti(rekapManual?.jenisCutiAktif);
      if (rekapManual?.jenisCutiAktif && !jenisCuti) {
        detailSebagian.push(
          `${pegawai.nama}: jenis cuti "${rekapManual.jenisCutiAktif}" di rekap presensi tidak dikenali - potongan Pasal 14 TIDAK diterapkan, Tukin dihitung seolah tidak cuti.`
        );
      }
      const cutiAktif = jenisCuti
        ? {
            jenis: jenisCuti,
            bulanKeberapa: rekapManual?.bulanCutiKeberapa ?? undefined,
            jumlahHariCuti: rekapManual?.jumlahHariCuti || undefined,
          }
        : undefined;
      const jumlahTidakIkutUpacara =
        rekapManual?.jumlahTidakIkutUpacara ?? presensi.filter((p) => p.tidakIkutUpacara).length;
      // Hari per status buat uang makan. Kalau sumbernya PresensiHarian
      // (jalur sinkronisasi), status DIKLAT/DINAS_LUAR dikeluarkan dari
      // hitungan WFO - mereka hadir tapi tidak berhak uang makan.
      const jumlahHariWfo =
        rekapManual?.jumlahHariWfo ??
        presensi.filter((p) => ["HADIR", "WFO", "TERLAMBAT", "TIDAK_PRESENSI"].includes(p.statusKehadiran)).length;
      const jumlahHariWfhWfa =
        rekapManual?.jumlahHariWfhWfa ??
        presensi.filter((p) => ["WFH", "WFA"].includes(p.statusKehadiran)).length;
      const jumlahHariHadir =
        rekapManual?.jumlahHariHadir ??
        presensi.filter((p) => ["HADIR", "TERLAMBAT", "TIDAK_PRESENSI", "WFA"].includes(p.statusKehadiran)).length;
      const jumlahHariKerja = rekapManual?.jumlahHariKerja
        ? Math.max(rekapManual.jumlahHariKerja, 1)
        : Math.max(presensi.length, HARI_KERJA_DEFAULT);

      const rekapKehadiran = {
        pegawaiId: pegawai.nip,
        periodeBulan,
        periodeTahun,
        jumlahHariAlpha,
        jumlahTidakPresensi,
        totalMenitTerlambat,
        totalMenitPulangCepat,
        totalMenitMeninggalkanKantor,
        tugasBelajar,
        cutiAktif,
        jumlahTidakIkutUpacara,
        jumlahHariKerja,
        jumlahHariHadir,
        totalJamLembur: 0,
      };

      const hasilTukin = hitungTukin({
        pegawaiId: pegawai.nip,
        periodeBulan,
        periodeTahun,
        tukinPokokKelasJabatan,
        rekapKehadiran,
        capaianKinerja: { pegawaiId: pegawai.nip, periodeBulan, periodeTahun, nilaiCapaianKinerjaPersen: predikat.nilaiAngka },
        // Pejabat Pimpinan Tinggi (Eselon I/II) - komponen kehadiran dibayar
        // penuh. Diturunkan dari kelas jabatan EFEKTIF, bukan kelas dasar:
        // kalau seorang pejabat diturunkan jabatannya karena hukuman disiplin,
        // dia memang tidak lagi memegang jabatan yang dikompensasi itu.
        dikecualikanPotonganKehadiran: dikecualikanPotonganKehadiran(efektif.kelas),
      });
      const validasiTukinHasil = validasiTukin(hasilTukin);
      if (hasilTukin.pengecualianPotonganKehadiran && hasilTukin.potonganKehadiranPersenSebelumPengecualian > 0) {
        // Sama alasannya dengan penurunan kelas jabatan di atas: nominal yang
        // berubah karena aturan khusus tidak boleh cuma terlihat di angka
        // akhir - sebutkan orangnya dan berapa yang tidak jadi dipotong.
        detailSebagian.push(
          `${pegawai.nama}: ${labelPengecualianKehadiran(efektif.kelas)} (kelas ${efektif.kelas}) -` +
            ` potongan Pasal 13 sebesar ${(hasilTukin.potonganKehadiranPersenSebelumPengecualian * 100).toFixed(2)}%` +
            ` dari bobot kehadiran TIDAK diterapkan. Dasar hukumnya belum dikonfirmasi.`
        );
      }

      await prisma.tukinCalculation.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan,
          periodeTahun,
          komponenKehadiran: hasilTukin.komponenKehadiranSetelahPotongan,
          komponenKinerja: hasilTukin.komponenKinerja,
          tukinPokok: hasilTukin.tukinPokok,
          potonganPph: hasilTukin.potonganPph,
          tukinBersih: hasilTukin.tukinBersih,
          status: "DRAFT",
          catatanAnomali: validasiTukinHasil.anomali.length ? validasiTukinHasil.anomali.join("; ") : null,
        },
        update: {
          komponenKehadiran: hasilTukin.komponenKehadiranSetelahPotongan,
          komponenKinerja: hasilTukin.komponenKinerja,
          tukinPokok: hasilTukin.tukinPokok,
          potonganPph: hasilTukin.potonganPph,
          tukinBersih: hasilTukin.tukinBersih,
          status: "DRAFT",
          calculatedAt: new Date(),
          approvedAt: null,
          approvedBy: null,
          catatanAnomali: validasiTukinHasil.anomali.length ? validasiTukinHasil.anomali.join("; ") : null,
        },
      });

      // Tarif uang makan mengikuti GOLONGAN pegawai (SBM 2026 item 22.1),
      // bukan satu angka untuk semua orang seperti sebelumnya.
      //
      // kurungTarifSbm (bukan golonganRomawi) supaya PPPK ikut terhitung:
      // golongan PPPK berformat romawi telanjang "IX" pada skala I-XVII yang
      // tidak dikenal SBM, dan dipetakan lewat PADANAN_GOLONGAN_PPPK.
      const gol = kurungTarifSbm(pegawai.golongan);
      if (!gol) {
        // BUKAN "dilewati": Tukin-nya SUDAH tersimpan di atas. Tukin memakai
        // KELAS JABATAN, bukan golongan - golongan cuma dipakai tarif SBM
        // uang makan/lembur. Dulu kasus ini masuk detailDilewati dan bikin
        // laporannya menyesatkan: pegawai PPPK dilaporkan "dilewati" padahal
        // Tukin-nya terhitung penuh, dan jumlah di pesan sukses jadi kurang.
        detailSebagian.push(
          `${pegawai.nama}: Tukin terhitung, TAPI uang makan/lembur dilewati - golongan "${pegawai.golongan ?? "(kosong)"}" tidak dikenali, bukan format PNS ("III/d") maupun jenjang PPPK ("IX"). Perbaiki golongannya di SIAP.`
        );
        dihitung++;
        continue;
      }
      const tarifUangMakan = TARIF_UANG_MAKAN_PER_HARI[gol];

      const hasilUm = hitungUangMakan({
        pegawaiId: pegawai.nip,
        periodeBulan,
        periodeTahun,
        jumlahHariKerja,
        jumlahHariWfo,
        jumlahHariWfhWfa,
        tarifHarianUangMakan: tarifUangMakan,
      });
      const validasiUmHasil = validasiUangMakan(hasilUm);

      await prisma.uangMakan.upsert({
        where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
        create: {
          pegawaiId: pegawai.id,
          periodeBulan,
          periodeTahun,
          jumlahHariKerja,
          jumlahHariHadir,
          jumlahHariDibayar: hasilUm.jumlahHariDibayar,
          tarifHarian: tarifUangMakan,
          totalUangMakan: hasilUm.totalUangMakan,
          status: "DRAFT",
          catatanAnomali: validasiUmHasil.anomali.length ? validasiUmHasil.anomali.join("; ") : null,
        },
        update: {
          jumlahHariKerja,
          jumlahHariHadir,
          jumlahHariDibayar: hasilUm.jumlahHariDibayar,
          tarifHarian: tarifUangMakan,
          totalUangMakan: hasilUm.totalUangMakan,
          status: "DRAFT",
          calculatedAt: new Date(),
          approvedAt: null,
          approvedBy: null,
          catatanAnomali: validasiUmHasil.anomali.length ? validasiUmHasil.anomali.join("; ") : null,
        },
      });

      // --- Uang Lembur (SBM 2026 item 23.1 + 23.2) ---
      // Cuma dihitung kalau rekap presensinya memang memuat jam lembur -
      // kalau nol, tidak dibuatkan baris supaya tidak ada baris Rp 0 yang
      // ikut mengantre approval.
      const totalJamLembur = rekapManual?.totalJamLembur ?? 0;
      const totalJamLemburHariLibur = rekapManual?.totalJamLemburHariLibur ?? 0;
      if (totalJamLembur + totalJamLemburHariLibur > 0) {
        const hasilLembur = hitungUangLembur({
          pegawaiId: pegawai.nip,
          periodeBulan,
          periodeTahun,
          totalJamLembur,
          totalJamLemburHariLibur,
          // Jumlah HARI, bukan jam - pengali jam pertama (1,5x) berlaku per
          // hari. Rekap lama (sebelum kolom ini ada) bernilai 0, dan
          // hitungUangLembur memperlakukan 0 sebagai BELUM DIKETAHUI: dibayar
          // 1x tarif plus anomali, bukan ditebak.
          jumlahHariLemburHariKerja: rekapManual?.jumlahHariLemburHariKerja ?? 0,
          tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM[gol],
          jumlahHariMakanLembur: rekapManual?.jumlahHariMakanLembur ?? 0,
          jumlahHariMakanLemburHariLibur: rekapManual?.jumlahHariMakanLemburHariLibur ?? 0,
          tarifMakanLemburPerHari: TARIF_UANG_MAKAN_LEMBUR_PER_HARI[gol],
          // Pengecekan silang WFH/WFA - lihat uangLembur.ts.
          jumlahHariWfo,
        });
        const validasiLemburHasil = validasiUangLembur(hasilLembur);
        const isiLembur = {
          totalJamLembur: hasilLembur.jamLemburDihitung,
          jamLemburHariKerja: hasilLembur.jamLemburHariKerja,
          jamLemburHariLibur: hasilLembur.jamLemburHariLibur,
          tarifPerJam: TARIF_UANG_LEMBUR_PER_JAM[gol],
          jumlahHariMakanLembur: hasilLembur.jumlahHariMakanLembur,
          tarifMakanLemburPerHari: TARIF_UANG_MAKAN_LEMBUR_PER_HARI[gol],
          uangLembur: hasilLembur.uangLembur,
          uangMakanLembur: hasilLembur.uangMakanLembur,
          totalUangLembur: hasilLembur.totalUangLembur,
          status: "DRAFT",
          catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
        };
        await prisma.uangLembur.upsert({
          where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
          create: { pegawaiId: pegawai.id, periodeBulan, periodeTahun, ...isiLembur },
          update: { ...isiLembur, calculatedAt: new Date(), approvedAt: null, approvedBy: null },
        });
      }

      dihitung++;
    }

    // Keputusan "hitung walau datanya belum lengkap" DICATAT, bukan cuma
    // dikonfirmasi lalu hilang. Kalau nanti ada pegawai yang protes tukinnya
    // tidak keluar, jejak siapa yang memutuskan dan berapa orang yang
    // terdampak ada di sini.
    if (belumPunyaPredikat.length > 0 && lanjutkanTanpaLengkap) {
      await prisma.auditTrail.create({
        data: {
          entitas: "tukin_calculation",
          entitasId: `kalkulasi-massal-${satuanKerja}-${periodeBulan}-${periodeTahun}`,
          aksi: "CREATE",
          aktor: authUser.nip,
          satuanKerja: satuanKerja,
          dataSesudah: {
            sumber: "Kalkulasi massal dijalankan tanpa predikat kinerja lengkap",
            satuanKerja,
            periode: `${periodeBulan}/${periodeTahun}`,
            dihitung,
            tanpaPredikat: belumPunyaPredikat.length,
            nipTanpaPredikat: belumPunyaPredikat.slice(0, 50).map((p) => p.nip),
          },
        },
      });
    }

    revalidatePath("/kasubag/kalkulasi");

    return {
      success:
        `Tukin terhitung untuk ${dihitung} pegawai` +
        (detailSebagian.length > 0
          ? ` (${detailSebagian.length} di antaranya tanpa uang makan/lembur).`
          : ", lengkap dengan uang makan/lembur."),
      ringkasan: {
        dihitung,
        // TOTAL yang dilewati, termasuk yang karena predikat - angka ini tetap
        // utuh supaya pemakai lain (dan audit) tidak kehilangan hitungannya
        // hanya karena tampilannya dipecah dua.
        dilewati: detailDilewati.length + dilewatiPredikat,
        detailDilewati,
        dilewatiPredikat,
        detailSebagian,
      },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

export interface KoreksiLemburFormState {
  error?: string;
  success?: string;
}

/**
 * Koreksi manual jam lembur satu pegawai untuk satu periode ("telaah/koreksi
 * ajuan Uang Lembur unit" di role matrix). TIDAK ada sumber data jam lembur
 * harian tersimpan di sistem manapun yang diintegrasikan (lihat TODO(confirm)
 * di RekapKehadiranPeriode) - jadi ini input manual Kasubag TU, bukan
 * "tarik ulang" dari adapter seperti presensi.
 */
export async function koreksiUangLemburAction(
  _state: KoreksiLemburFormState,
  formData: FormData
): Promise<KoreksiLemburFormState> {
  try {
    const authUser = await ambilAuthUser();
    if (!authUser) return { error: "Sesi login sudah habis - silakan login ulang." };

    const pegawaiId = String(formData.get("pegawaiId") ?? "");
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    const totalJamLembur = Number(formData.get("totalJamLembur"));
    const tarifPerJam = Number(formData.get("tarifPerJam"));

    if (!pegawaiId || !periodeBulan || !periodeTahun || Number.isNaN(totalJamLembur) || !tarifPerJam) {
      return { error: "Data koreksi tidak lengkap." };
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { id: pegawaiId } });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };
    if (!canTelaahKoreksiAjukanUangLemburUnit(authUser, pegawai.satuanKerja)) {
      return { error: "Role kamu tidak berwenang mengoreksi Uang Lembur unit ini." };
    }

    const hasilLembur = hitungUangLembur({
      pegawaiId: pegawai.nip,
      periodeBulan,
      periodeTahun,
      totalJamLembur,
      tarifPerJam,
    });
    const validasiLemburHasil = validasiUangLembur(hasilLembur);

    await prisma.uangLembur.upsert({
      where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId, periodeBulan, periodeTahun } },
      // Rincian hari kerja & hari libur IKUT DITULIS, tidak dibiarkan
      // memegang nilai lama. Form koreksi ini cuma menerima satu angka total,
      // dan `hitungUangLembur` di atas memperlakukannya sepenuhnya sebagai
      // lembur HARI KERJA - jadi rupiah yang tersimpan memang sudah dihitung
      // dengan jam hari libur nol. Membiarkan kolom rinciannya tetap berisi
      // angka dari kalkulasi sebelumnya berarti menyimpan rincian yang tidak
      // pernah dipakai menghitung uangnya, dan sejak halaman /uang-lembur
      // menampilkan kedua kolom itu, selisihnya langsung terbaca di layar.
      create: {
        pegawaiId,
        periodeBulan,
        periodeTahun,
        totalJamLembur,
        jamLemburHariKerja: hasilLembur.jamLemburHariKerja,
        jamLemburHariLibur: hasilLembur.jamLemburHariLibur,
        tarifPerJam,
        totalUangLembur: hasilLembur.totalUangLembur,
        status: "DRAFT",
        catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
      },
      update: {
        totalJamLembur,
        jamLemburHariKerja: hasilLembur.jamLemburHariKerja,
        jamLemburHariLibur: hasilLembur.jamLemburHariLibur,
        tarifPerJam,
        totalUangLembur: hasilLembur.totalUangLembur,
        status: "DRAFT",
        calculatedAt: new Date(),
        approvedAt: null,
        approvedBy: null,
        catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
      },
    });

    revalidatePath("/kasubag/kalkulasi");
    return { success: `Uang Lembur ${pegawai.nama} dikoreksi jadi ${totalJamLembur} jam.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

// ============================================================================
// KOREKSI JAM LEMBUR HARIAN BERDASARKAN SURAT PERINTAH LEMBUR (SPL)
// ============================================================================

export interface KoreksiJamLemburHarianState {
  error?: string;
  success?: string;
}

function tanggalUtcDariIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) return null;
  return d;
}

function hitungJamMesinDariPresensi(
  tanggal: Date,
  jamMasuk: Date | null,
  jamKeluar: Date | null,
  hariLiburMap: Map<string, string>
): number {
  if (!jamKeluar) return 0;
  const iso = tanggal.toISOString().slice(0, 10);
  const day = tanggal.getUTCDay();
  const isLibur = day === 0 || day === 6 || hariLiburMap.has(iso);

  const jamKeluarMenit = jamKeluar.getUTCHours() * 60 + jamKeluar.getUTCMinutes();

  if (isLibur) {
    if (!jamMasuk) return 0;
    const jamMasukMenit = jamMasuk.getUTCHours() * 60 + jamMasuk.getUTCMinutes();
    const durasi = Math.max(0, jamKeluarMenit - jamMasukMenit);
    return Math.floor(durasi / 60);
  } else {
    // Hari kerja: batas checkout 16:00 (Jumat 16:30)
    const checkoutCutoff = day === 5 ? 990 : 960;
    const lebih = Math.max(0, jamKeluarMenit - checkoutCutoff);
    return Math.floor(lebih / 60);
  }
}

async function sinkronkanUangLemburPegawai(
  tx: Prisma.TransactionClient,
  pegawai: { id: string; nip: string; satuanKerja: string | null; golongan: string | null },
  periodeBulan: number,
  periodeTahun: number,
  hariLiburMap: Map<string, string>
) {
  const awal = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhir = new Date(Date.UTC(periodeTahun, periodeBulan, 1));

  const semuaPresensi = await tx.presensiHarian.findMany({
    where: { pegawaiId: pegawai.id, tanggal: { gte: awal, lt: akhir } },
    select: { tanggal: true, jamLembur: true, statusKehadiran: true },
  });

  let jamLemburKerja = 0;
  let jamLemburLibur = 0;
  let hariMakanLemburKerja = 0;
  let hariMakanLemburLibur = 0;
  let hariLemburKerja = 0;
  let jumlahHariWfo = 0;

  for (const p of semuaPresensi) {
    if (p.statusKehadiran === "WFO" || p.statusKehadiran === "HADIR") {
      jumlahHariWfo++;
    }
    const iso = p.tanggal.toISOString().slice(0, 10);
    const day = p.tanggal.getUTCDay();
    const isLibur = day === 0 || day === 6 || hariLiburMap.has(iso);
    const jam = Math.max(0, Math.floor(p.jamLembur));
    if (jam > 0) {
      if (isLibur) {
        jamLemburLibur += jam;
        if (jam >= 2) hariMakanLemburLibur++;
      } else {
        jamLemburKerja += jam;
        hariLemburKerja++;
        if (jam >= 2) hariMakanLemburKerja++;
      }
    }
  }

  // Update RekapPresensiPeriode jika ada
  await tx.rekapPresensiPeriode.updateMany({
    where: { pegawaiId: pegawai.id, periodeBulan, periodeTahun },
    data: {
      totalJamLembur: jamLemburKerja,
      totalJamLemburHariLibur: jamLemburLibur,
      jumlahHariLemburHariKerja: hariLemburKerja,
      jumlahHariMakanLembur: hariMakanLemburKerja,
      jumlahHariMakanLemburHariLibur: hariMakanLemburLibur,
      diunggahPada: new Date(),
    },
  });

  const gol = kurungTarifSbm(pegawai.golongan);
  const totalJam = jamLemburKerja + jamLemburLibur;
  if (totalJam > 0) {
    const lemburLama = await tx.uangLembur.findUnique({
      where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
    });
    const tarifPerJam = (gol ? TARIF_UANG_LEMBUR_PER_JAM[gol] : lemburLama?.tarifPerJam) ?? 25_000;
    const tarifMakanLemburPerHari =
      (gol ? TARIF_UANG_MAKAN_LEMBUR_PER_HARI[gol] : lemburLama?.tarifMakanLemburPerHari) ?? 30_000;

    const hasilLembur = hitungUangLembur({
      pegawaiId: pegawai.nip,
      periodeBulan,
      periodeTahun,
      totalJamLembur: jamLemburKerja,
      totalJamLemburHariLibur: jamLemburLibur,
      jumlahHariLemburHariKerja: hariLemburKerja,
      tarifPerJam,
      jumlahHariMakanLembur: hariMakanLemburKerja,
      jumlahHariMakanLemburHariLibur: hariMakanLemburLibur,
      tarifMakanLemburPerHari,
      jumlahHariWfo,
    });
    const validasiLemburHasil = validasiUangLembur(hasilLembur);
    const isiLembur = {
      totalJamLembur: hasilLembur.jamLemburDihitung,
      jamLemburHariKerja: hasilLembur.jamLemburHariKerja,
      jamLemburHariLibur: hasilLembur.jamLemburHariLibur,
      tarifPerJam,
      jumlahHariMakanLembur: hasilLembur.jumlahHariMakanLembur,
      tarifMakanLemburPerHari,
      uangLembur: hasilLembur.uangLembur,
      uangMakanLembur: hasilLembur.uangMakanLembur,
      totalUangLembur: hasilLembur.totalUangLembur,
      status: "DRAFT",
      catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
    };
    await tx.uangLembur.upsert({
      where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
      create: { pegawaiId: pegawai.id, periodeBulan, periodeTahun, ...isiLembur },
      update: { ...isiLembur, calculatedAt: new Date(), approvedAt: null, approvedBy: null },
    });
  } else {
    // Jika jam lembur 0, hapus baris UangLembur agar tidak ada baris Rp 0
    await tx.uangLembur.deleteMany({
      where: { pegawaiId: pegawai.id, periodeBulan, periodeTahun },
    });
  }
}

/**
 * Mengoreksi jam lembur harian satu pegawai berdasarkan Surat Perintah Lembur (SPL).
 *
 * Meng-update KoreksiPresensiHarian (dengan audit trail & dasar SPL),
 * menyelaraskan PresensiHarian.jamLembur agar berkas ADK harian Web Gaji akurat,
 * serta menghitung ulang RekapPresensiPeriode & UangLembur agar tidak ada ketidakcocokan.
 */
export async function koreksiJamLemburHarianAction(
  _state: KoreksiJamLemburHarianState,
  formData: FormData
): Promise<KoreksiJamLemburHarianState> {
  try {
    const authUser = await ambilAuthUser();
    if (!authUser) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun login tidak ditemukan." };

    const pegawaiId = String(formData.get("pegawaiId") ?? "").trim();
    const tanggalIso = String(formData.get("tanggalIso") ?? "").trim();
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));
    const jamLemburStr = String(formData.get("jamLembur") ?? "").trim();
    const alasan = String(formData.get("alasan") ?? "").trim();

    if (!pegawaiId || !tanggalIso || !periodeBulan || !periodeTahun) {
      return { error: "Data koreksi tidak lengkap." };
    }

    const tanggal = tanggalUtcDariIso(tanggalIso);
    if (!tanggal) return { error: "Format tanggal tidak valid." };

    const jamLembur = Number(jamLemburStr);
    if (!Number.isFinite(jamLembur) || jamLembur < 0 || jamLembur > 24 || !Number.isInteger(jamLembur)) {
      return { error: "Jam lembur harus bilangan bulat antara 0 sampai 24 (sisa menit tidak dibayar)." };
    }

    if (alasan.length < 10) {
      return { error: "Dasar koreksi / nomor SPL wajib diisi minimal 10 karakter." };
    }

    const pegawai = await prisma.pegawai.findUnique({
      where: { id: pegawaiId },
      select: { id: true, nip: true, nama: true, satuanKerja: true, golongan: true },
    });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };

    if (!canTelaahKoreksiAjukanUangLemburUnit(authUser, pegawai.satuanKerja)) {
      return { error: `Role kamu tidak berwenang mengoreksi lembur pegawai ${pegawai.satuanKerja ?? "tanpa unit"}.` };
    }

    // Kunci pengiriman: jika rekap sudah dikirim ke PPABP, tidak boleh diedit
    if (pegawai.satuanKerja) {
      const pengiriman = await prisma.pengirimanUnit.findUnique({
        where: {
          satuanKerja_periodeBulan_periodeTahun: {
            satuanKerja: pegawai.satuanKerja,
            periodeBulan,
            periodeTahun,
          },
        },
      });
      if (statusUnit(pengiriman).terkunci) {
        return { error: "Periode ini sudah dikirim ke PPABP dan terkunci. Jam lembur tidak dapat diubah." };
      }
    }

    const presensiLama = await prisma.presensiHarian.findUnique({
      where: { pegawaiId_tanggal: { pegawaiId, tanggal } },
      select: { id: true, jamMasuk: true, jamKeluar: true, jamLembur: true },
    });

    const koreksiLama = await prisma.koreksiPresensiHarian.findUnique({
      where: { pegawaiId_tanggal: { pegawaiId, tanggal } },
    });

    const hariLiburMap = await muatHariLiburPeriode(periodeBulan, periodeTahun);

    await prisma.$transaction(async (tx) => {
      // 1. Catat ke KoreksiPresensiHarian
      await tx.koreksiPresensiHarian.upsert({
        where: { pegawaiId_tanggal: { pegawaiId, tanggal } },
        create: {
          pegawaiId,
          tanggal,
          jamLembur,
          alasan,
          dikoreksiOlehId: user.id,
        },
        update: {
          jamLembur,
          alasan,
          dikoreksiOlehId: user.id,
          dikoreksiPada: new Date(),
        },
      });

      // 2. Perbarui PresensiHarian jika baris kehadiran ada
      if (presensiLama) {
        await tx.presensiHarian.update({
          where: { id: presensiLama.id },
          data: { jamLembur },
        });
      }

      // 3. Rekam jejak audit
      await tx.auditTrail.create({
        data: {
          entitas: "koreksi_presensi_harian",
          entitasId: `${pegawai.nip}-${tanggalIso}`,
          aksi: koreksiLama ? "UPDATE" : "CREATE",
          aktor: authUser.nip,
          satuanKerja: pegawai.satuanKerja,
          dataSebelum: {
            tanggal: tanggalIso,
            jamLemburMesin: presensiLama?.jamLembur ?? 0,
            jamLemburSebelumnya: koreksiLama?.jamLembur ?? null,
            alasanSebelumnya: koreksiLama?.alasan ?? null,
          },
          dataSesudah: {
            tanggal: tanggalIso,
            jamLembur,
            alasan,
            sumber: "Koreksi SPL Kasubag TU",
          },
        },
      });

      // 4. Selaraskan RekapPresensiPeriode & UangLembur
      await sinkronkanUangLemburPegawai(tx, pegawai, periodeBulan, periodeTahun, hariLiburMap);
    });

    revalidatePath("/kasubag/kalkulasi");
    revalidatePath(`/tukin/presensi/${pegawai.nip}`);

    return {
      success: `Jam lembur ${pegawai.nama} tgl ${tglTampil(tanggalIso)} disesuaikan jadi ${jamLembur} jam (SPL: ${alasan}).`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

/**
 * Menghapus koreksi jam lembur harian dan memulihkan jam ke hitungan mesin e-Presensi.
 */
export async function hapusKoreksiJamLemburHarianAction(
  _state: KoreksiJamLemburHarianState,
  formData: FormData
): Promise<KoreksiJamLemburHarianState> {
  try {
    const authUser = await ambilAuthUser();
    if (!authUser) return { error: "Sesi login sudah habis - silakan login ulang." };

    const koreksiId = String(formData.get("koreksiId") ?? "").trim();
    const pegawaiId = String(formData.get("pegawaiId") ?? "").trim();
    const tanggalIso = String(formData.get("tanggalIso") ?? "").trim();
    const periodeBulan = Number(formData.get("periodeBulan"));
    const periodeTahun = Number(formData.get("periodeTahun"));

    if (!koreksiId || !pegawaiId || !tanggalIso || !periodeBulan || !periodeTahun) {
      return { error: "Parameter hapus koreksi tidak lengkap." };
    }

    const tanggal = tanggalUtcDariIso(tanggalIso);
    if (!tanggal) return { error: "Format tanggal tidak valid." };

    const pegawai = await prisma.pegawai.findUnique({
      where: { id: pegawaiId },
      select: { id: true, nip: true, nama: true, satuanKerja: true, golongan: true },
    });
    if (!pegawai) return { error: "Pegawai tidak ditemukan." };

    if (!canTelaahKoreksiAjukanUangLemburUnit(authUser, pegawai.satuanKerja)) {
      return { error: `Role kamu tidak berwenang mengoreksi lembur pegawai ${pegawai.satuanKerja ?? "tanpa unit"}.` };
    }

    if (pegawai.satuanKerja) {
      const pengiriman = await prisma.pengirimanUnit.findUnique({
        where: {
          satuanKerja_periodeBulan_periodeTahun: {
            satuanKerja: pegawai.satuanKerja,
            periodeBulan,
            periodeTahun,
          },
        },
      });
      if (statusUnit(pengiriman).terkunci) {
        return { error: "Periode ini sudah dikirim ke PPABP dan terkunci. Koreksi tidak dapat dihapus." };
      }
    }

    const koreksi = await prisma.koreksiPresensiHarian.findUnique({
      where: { id: koreksiId },
    });
    if (!koreksi) return { error: "Data koreksi tidak ditemukan atau sudah dihapus." };

    const presensi = await prisma.presensiHarian.findUnique({
      where: { pegawaiId_tanggal: { pegawaiId, tanggal } },
      select: { id: true, jamMasuk: true, jamKeluar: true, jamLembur: true },
    });

    const hariLiburMap = await muatHariLiburPeriode(periodeBulan, periodeTahun);

    // Cari jam mesin awal dari AuditTrail atau hitung dari jam tap
    const jejakAudit = await prisma.auditTrail.findFirst({
      where: {
        entitas: "koreksi_presensi_harian",
        entitasId: `${pegawai.nip}-${tanggalIso}`,
      },
      orderBy: { timestamp: "desc" },
    });

    const dataSebelum = jejakAudit?.dataSebelum as Record<string, unknown> | null;
    const jamMesinAsli =
      typeof dataSebelum?.jamLemburMesin === "number"
        ? (dataSebelum.jamLemburMesin as number)
        : hitungJamMesinDariPresensi(
            tanggal,
            presensi?.jamMasuk ?? null,
            presensi?.jamKeluar ?? null,
            hariLiburMap
          );

    await prisma.$transaction(async (tx) => {
      // 1. Hapus atau set jamLembur = null di KoreksiPresensiHarian
      if (koreksi.jamMasuk === null && koreksi.jamKeluar === null) {
        await tx.koreksiPresensiHarian.delete({ where: { id: koreksiId } });
      } else {
        await tx.koreksiPresensiHarian.update({
          where: { id: koreksiId },
          data: { jamLembur: null },
        });
      }

      // 2. Pulihkan jamLembur di PresensiHarian
      if (presensi) {
        await tx.presensiHarian.update({
          where: { id: presensi.id },
          data: { jamLembur: jamMesinAsli },
        });
      }

      // 3. Catat audit trail
      await tx.auditTrail.create({
        data: {
          entitas: "koreksi_presensi_harian",
          entitasId: `${pegawai.nip}-${tanggalIso}`,
          aksi: "DELETE",
          aktor: authUser.nip,
          satuanKerja: pegawai.satuanKerja,
          dataSebelum: {
            tanggal: tanggalIso,
            jamLemburSebelumnya: koreksi.jamLembur,
            alasanSebelumnya: koreksi.alasan,
          },
          dataSesudah: {
            tanggal: tanggalIso,
            jamLemburDipulihkan: jamMesinAsli,
            sumber: "Pencabutan Koreksi Lembur Kasubag TU",
          },
        },
      });

      // 4. Selaraskan RekapPresensiPeriode & UangLembur
      await sinkronkanUangLemburPegawai(tx, pegawai, periodeBulan, periodeTahun, hariLiburMap);
    });

    revalidatePath("/kasubag/kalkulasi");
    revalidatePath(`/tukin/presensi/${pegawai.nip}`);

    return {
      success: `Koreksi lembur tgl ${tglTampil(tanggalIso)} dicabut. Jam dikembalikan ke hitungan mesin (${jamMesinAsli} jam).`,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Terjadi kesalahan tak terduga." };
  }
}

