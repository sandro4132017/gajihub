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

const HARI_KERJA_DEFAULT = 21;

export interface KalkulasiMassalFormState {
  error?: string;
  success?: string;
  /**
   * Aksinya berjalan tanpa kegagalan, TAPI tidak ada satu angka pun yang
   * berubah - mis. semua pegawai dilewati karena sudah APPROVED. Dipisah dari
   * `success` karena warna hijau di situ terbaca "beres" dan orang berhenti di
   * situ, padahal justru masih ada langkah yang harus diambil. Pernah terjadi
   * betulan: "Tukin terhitung untuk 0 pegawai" tampil hijau, 47 baris tetap
   * basi, dan penanda kuning di tabel dikira bug.
   */
  peringatan?: string;
  ringkasan?: {
    dihitung: number;
    dilewati: number;
    detailDilewati: string[];
    /**
     * Pegawai yang Tukin-nya BERHASIL dihitung tapi Uang Makan/Lembur-nya
     * tidak. Dipisah dari `detailDilewati` karena artinya beda jauh: yang di
     * sini datanya TERSIMPAN sebagian, bukan gagal total.
     */
    detailSebagian: string[];
    /** Pegawai yang tidak dihitung ulang karena Tukin-nya sudah APPROVED. */
    dilewatiKarenaApproved: number;
    /** Approval yang benar-benar dibatalkan karena dipaksa hitung ulang. */
    approvalDibatalkan: number;
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

    const pegawaiList = await prisma.pegawai.findMany({ where: { satuanKerja } });

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
    // GERBANG "SUDAH DISETUJUI" - menghitung ulang MEMBATALKAN approval
    // ========================================================================
    // Menghitung ulang selalu mengembalikan status ke DRAFT dan memperbarui
    // `calculatedAt`; approval yang tercatat SEBELUM waktu itu otomatis
    // dianggap basi oleh `evaluasiApproval`. Jadi satu klik bisa menghapus
    // hasil kerja approval satu unit penuh - tanpa peringatan apa pun sebelum
    // ini ada.
    //
    // Kejadian nyata yang memicu pengaman ini: periode 7/2026 Biro Keuangan
    // punya 278 baris ApprovalLog (139 jenjang 1 + 139 jenjang 2) untuk 47
    // pegawai - siklusnya terulang sekitar TIGA kali, dan tiap kali export
    // ADK-nya kosong lagi.
    //
    // Perilaku BAWAANNYA sekarang MELEWATI baris yang sudah disetujui.
    // Menghitung ulang tetap bisa, tapi harus dipilih sadar DAN dikonfirmasi -
    // dua langkah, sama seperti tombol "Setujui semua".
    const perlakuanApproved = String(formData.get("perlakuanApproved") ?? "lewati");
    const konfirmasiReset = formData.get("konfirmasiResetApproval") === "1";
    const tukinApproved = await prisma.tukinCalculation.findMany({
      where: {
        pegawaiId: { in: pegawaiList.map((p) => p.id) },
        periodeBulan,
        periodeTahun,
        status: "APPROVED",
      },
      select: { pegawaiId: true },
    });
    const setApproved = new Set(tukinApproved.map((t) => t.pegawaiId));

    if (setApproved.size > 0 && perlakuanApproved === "hitungUlang" && !konfirmasiReset) {
      return {
        error:
          `${setApproved.size} pegawai periode ${periodeBulan}/${periodeTahun} sudah berstatus APPROVED.` +
          " Menghitung ulang akan mengembalikan mereka ke DRAFT dan membatalkan approval yang sudah selesai" +
          " (termasuk jenjang 2), sehingga export ADK periode ini kosong lagi sampai disetujui ulang." +
          " Centang kotak konfirmasi kalau memang itu yang dimaksud.",
      };
    }
    const lewatiApproved = setApproved.size > 0 && perlakuanApproved !== "hitungUlang";

    let dihitung = 0;
    let dilewatiKarenaApproved = 0;
    let approvalDibatalkan = 0;
    const detailDilewati: string[] = [];
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
      if (lewatiApproved && setApproved.has(pegawai.id)) {
        dilewatiKarenaApproved++;
        continue;
      }
      if (setApproved.has(pegawai.id)) approvalDibatalkan++;
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
        detailDilewati.push(`${pegawai.nama}: predikat kinerja periode ini belum diupload.`);
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

    // Tidak ada satupun yang dihitung DAN penyebabnya cuma "sudah APPROVED":
    // ini bukan keberhasilan, dan tidak boleh tampil hijau. Sebutkan langkah
    // berikutnya, karena kalau tidak, penanda "angka basi" di tabel bertahan
    // tanpa penjelasan dan terlihat seperti kerusakan.
    if (dihitung === 0 && dilewatiKarenaApproved > 0 && detailDilewati.length === 0) {
      return {
        peringatan:
          `TIDAK ADA yang dihitung ulang. Ke-${dilewatiKarenaApproved} pegawai periode` +
          ` ${periodeBulan}/${periodeTahun} sudah berstatus APPROVED, dan pilihan yang aktif adalah` +
          ` "Lewati yang sudah disetujui" - jadi angka Tukin mereka masih yang lama.` +
          ` Kalau presensinya memang berubah (mis. ada koreksi jam), pilih "Hitung ulang semua"` +
          ` lalu centang kotak konfirmasi - approval yang sudah selesai akan dibatalkan dan` +
          ` harus disetujui ulang di Dashboard Tukin.`,
        ringkasan: {
          dihitung,
          dilewati: detailDilewati.length,
          detailDilewati,
          detailSebagian,
          dilewatiKarenaApproved,
          approvalDibatalkan,
        },
      };
    }

    return {
      success:
        `Tukin terhitung untuk ${dihitung} pegawai` +
        (detailSebagian.length > 0
          ? ` (${detailSebagian.length} di antaranya tanpa uang makan/lembur).`
          : ", lengkap dengan uang makan/lembur.") +
        // Dua akibat yang HARUS disebut apa adanya - keduanya mengubah apa
        // yang bisa diekspor ke ADK, dan tidak boleh cuma terlihat dari
        // berubahnya angka di tabel.
        (dilewatiKarenaApproved > 0
          ? ` ${dilewatiKarenaApproved} pegawai yang sudah APPROVED DILEWATI - approval mereka tetap utuh.`
          : "") +
        (approvalDibatalkan > 0
          ? ` PERHATIAN: ${approvalDibatalkan} approval yang sudah selesai DIBATALKAN - baris itu kembali DRAFT` +
            ` dan tidak akan masuk export ADK sampai disetujui ulang di Dashboard Tukin.`
          : ""),
      ringkasan: {
        dihitung,
        dilewati: detailDilewati.length,
        detailDilewati,
        detailSebagian,
        dilewatiKarenaApproved,
        approvalDibatalkan,
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
      create: {
        pegawaiId,
        periodeBulan,
        periodeTahun,
        totalJamLembur,
        tarifPerJam,
        totalUangLembur: hasilLembur.totalUangLembur,
        status: "DRAFT",
        catatanAnomali: validasiLemburHasil.anomali.length ? validasiLemburHasil.anomali.join("; ") : null,
      },
      update: {
        totalJamLembur,
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
