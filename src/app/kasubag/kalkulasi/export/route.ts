import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canExportRekapUnit } from "../../../../auth/permissions";
import { resolveSatkerEfektif } from "../../../dashboardScope";
import {
  susunRekapTukinLengkapExcel,
  susunRekapTukinExcel,
  selCuti,
  jenisKepegawaian,
  KOLOM_RUPIAH_TUKIN_LENGKAP,
  KOLOM_RUPIAH_TUKIN,
  type BarisRekapTukinLengkap,
} from "../../../../business-logic/rekapUnitExcel";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../../business-logic/tarifTukinPokok";
import { rincianTukinTersimpan } from "../../../../business-logic/rincianTukinTersimpan";
import { LABEL_PREDIKAT } from "../../../tukin/predikat-kinerja/predikat";
import { responseRekapExcel } from "../../../responseRekapExcel";
import { NAMA_BULAN } from "../../../bulan";
import type { AuthUser } from "../../../../auth/permissions";

/**
 * Unduh rekap Tunjangan Kinerja satu unit untuk satu periode, sebagai Excel.
 *
 * Menggunakan FORMAT RINCIAN LENGKAP (43 kolom) yang mencakup:
 * - Identitas pegawai (Nama, NIP, Golongan, Kelas Jabatan, Status Kepegawaian)
 * - Detail presensi & potongan (Hari kerja, WFO, WFH, Terlambat, Lupa absen,
 *   Alpa, Dinas luar, 12 breakdown cuti, Tugas belajar, Diklat, Upacara)
 * - Komponen Kehadiran 30% (% Potongan, % Kehadiran riil, Nominal kehadiran,
 *   Jumlah potongan rupiah)
 * - Komponen Kinerja 70% (Hasil kerja, Perilaku kerja, Capaian predikat,
 *   % Kinerja, Nominal kinerja)
 * - Pembayaran & verifikasi (Nominal dibayarkan, Potongan PPh, Status
 *   pengajuan DRAFT/APPROVED/SELISIH, dan Catatan anomali)
 *
 * Seluruh nilai mata uang dibulatkan ke rupiah utuh (Math.round) dan diformat
 * dengan format mata uang Rupiah ("Rp "#,##0) di Excel, sejalan dengan
 * tampilan web (`formatRupiah`) dan format resmi Biro Keuangan.
 *
 * Menghadirkan seluruh baris pegawai aktif (bukan hanya APPROVED), agar Kasubag
 * TU dapat memeriksa dan mengarsipkan data secara transparan sebelum disetujui.
 *
 * Parameter opsional:
 * - `?format=ringkas` untuk mengunduh versi tabel ringkas 12 kolom jika diperlukan.
 */
export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser: AuthUser = {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  const satkerEfektif = resolveSatkerEfektif(authUser, req.nextUrl.searchParams.get("satker") ?? undefined);
  if (!satkerEfektif) {
    return new Response("Pilih satuan kerja dulu sebelum mengunduh.", { status: 400 });
  }
  if (!canExportRekapUnit(authUser, satkerEfektif)) {
    return new Response("Tidak berwenang mengunduh rekap unit ini.", { status: 403 });
  }

  const formatParam = req.nextUrl.searchParams.get("format");

  // Jika format ringkas diminta secara eksplisit
  if (formatParam === "ringkas") {
    const rows = await prisma.tukinCalculation.findMany({
      where: {
        periodeBulan: bulan,
        periodeTahun: tahun,
        pegawai: { satuanKerja: satkerEfektif },
      },
      include: { pegawai: { select: { nip: true, nama: true, jabatan: true, kelasJabatan: true } } },
      orderBy: { pegawai: { nama: "asc" } },
    });

    const rekap = susunRekapTukinExcel(
      rows.map((r) => ({
        nip: r.pegawai.nip,
        nama: r.pegawai.nama,
        jabatan: r.pegawai.jabatan,
        kelasJabatan: r.pegawai.kelasJabatan,
        tukinPokok: Math.round(r.tukinPokok),
        komponenKehadiran: Math.round(r.komponenKehadiran),
        komponenKinerja: Math.round(r.komponenKinerja),
        potonganPph: Math.round(r.potonganPph),
        tukinBersih: Math.round(r.tukinBersih),
        status: r.status,
        catatanAnomali: r.catatanAnomali,
      }))
    );

    return responseRekapExcel({
      rekap,
      namaSheet: "Rekap Tukin Ringkas",
      namaFile: `rekap-tukin-ringkas-${namaBerkas(satkerEfektif)}-${NAMA_BULAN[bulan - 1]}-${tahun}`,
      kolomTeks: [1],
      kolomRupiah: [...KOLOM_RUPIAH_TUKIN],
    });
  }

  // FORMAT RINCIAN LENGKAP (Default)
  const pengecualian = await prisma.pengecualianPegawai.findMany({
    where: {
      periodeBulan: bulan,
      periodeTahun: tahun,
      pegawai: { satuanKerja: satkerEfektif },
    },
    select: { pegawaiId: true },
  });
  const setDikecualikan = new Set(pengecualian.map((p) => p.pegawaiId));

  const pegawaiList = await prisma.pegawai.findMany({
    where: {
      satuanKerja: satkerEfektif,
      statusPegawai: "AKTIF",
    },
    orderBy: { nama: "asc" },
    include: {
      tukinCalc: { where: { periodeBulan: bulan, periodeTahun: tahun } },
      rekapPresensi: { where: { periodeBulan: bulan, periodeTahun: tahun } },
      predikatKinerja: { where: { periodeBulan: bulan, periodeTahun: tahun } },
    },
  });

  const pegawaiExport = pegawaiList.filter((p) => !setDikecualikan.has(p.id));

  const barisLengkap: BarisRekapTukinLengkap[] = pegawaiExport.map((p) => {
    const tukin = p.tukinCalc[0];
    const rekap = p.rekapPresensi[0];
    const predikat = p.predikatKinerja[0];

    const tarifKelas =
      p.kelasJabatan !== null && p.kelasJabatan !== undefined
        ? TUKIN_POKOK_PER_KELAS_JABATAN[p.kelasJabatan] ?? null
        : null;
    const rincian = tukin ? rincianTukinTersimpan(tukin, tarifKelas) : null;

    const persenPotongan =
      rincian && rincian.bobotKehadiranPenuh
        ? ((rincian.potonganKehadiran ?? 0) / rincian.bobotKehadiranPenuh) * 100
        : 0;

    const persenKehadiran =
      rincian && tarifKelas
        ? (rincian.komponenKehadiran / tarifKelas) * 100
        : (tukin ? 30 : 0);

    const persenKinerja =
      rincian && tarifKelas
        ? (rincian.komponenKinerja / tarifKelas) * 100
        : (tukin ? 70 : 0);

    const statusPegawai = jenisKepegawaian(p.golongan);

    return {
      nip: p.nip,
      nama: p.nama,
      golongan: p.golongan,
      kelasJabatan: p.kelasJabatan,
      nominalTukin: Math.round(tarifKelas ?? (tukin?.tukinPokok ?? 0)),
      statusPegawai,
      jumlahHariKerja: rekap?.jumlahHariKerja ?? 0,
      jumlahHariWfo: rekap?.jumlahHariWfo ?? 0,
      jumlahHariWfhWfa: rekap?.jumlahHariWfhWfa ?? 0,
      totalMenitTerlambat: rekap?.totalMenitTerlambat ?? 0,
      jumlahTidakPresensi: rekap?.jumlahTidakPresensi ?? 0,
      jumlahHariAlpha: rekap?.jumlahHariAlpha ?? 0,
      jumlahHariDinasLuar: rekap?.jumlahHariDinasLuar ?? 0,
      ctGugurKandungan1: selCuti("GUGUR_1", rekap),
      ctGugurKandungan2: selCuti("GUGUR_2", rekap),
      cutiTahunan: selCuti("TAHUNAN", rekap),
      cutiMelahirkan: selCuti("MELAHIRKAN", rekap),
      cutiSakitBulan1: selCuti("SAKIT_1", rekap),
      cutiSakitBulan2: selCuti("SAKIT_2", rekap),
      cutiSakitBulan3: selCuti("SAKIT_3", rekap),
      cutiSakitLebih3Bulan: selCuti("SAKIT_4", rekap),
      ctBesarApKurang1Bulan: selCuti("BESAR_AP_KURANG", rekap),
      ctBesarBulan1: selCuti("BESAR_1", rekap),
      ctBesarBulan2: selCuti("BESAR_2", rekap),
      ctBesarBulan3: selCuti("BESAR_3", rekap),
      jumlahHariTugasBelajar: rekap?.jumlahHariTugasBelajar ?? 0,
      jumlahHariDiklat: rekap?.jumlahHariDiklat ?? 0,
      jumlahTidakIkutUpacara: rekap?.jumlahTidakIkutUpacara ?? 0,
      jumlahWfoWfh: (rekap?.jumlahHariWfo ?? 0) + (rekap?.jumlahHariWfhWfa ?? 0),
      persenPotongan,
      persenKehadiran,
      nominalKehadiran: Math.round(rincian?.komponenKehadiran ?? (tukin?.komponenKehadiran ?? 0)),
      jumlahPotonganKehadiran: Math.round(rincian?.potonganKehadiran ?? 0),
      hasilKerja: predikat?.hasilKerja ?? null,
      perilakuKerja: predikat?.perilakuKerja ?? null,
      capaianKinerja: predikat ? (LABEL_PREDIKAT[predikat.predikat] ?? predikat.predikat) : null,
      persenKinerja,
      nominalKinerja: Math.round(rincian?.komponenKinerja ?? (tukin?.komponenKinerja ?? 0)),
      dibayarkan: Math.round(tukin?.tukinBersih ?? (tukin?.tukinPokok ?? 0)),
      potonganPph: Math.round(tukin?.potonganPph ?? 0),
      statusPengajuan: tukin?.status ?? "BELUM DIHITUNG",
      catatanAnomali: tukin?.catatanAnomali ?? null,
    };
  });

  const rekap = susunRekapTukinLengkapExcel(barisLengkap);

  return responseRekapExcel({
    rekap,
    namaSheet: "Rincian Tukin",
    namaFile: `rincian-tukin-${namaBerkas(satkerEfektif)}-${NAMA_BULAN[bulan - 1]}-${tahun}`,
    kolomTeks: [2],
    kolomRupiah: [...KOLOM_RUPIAH_TUKIN_LENGKAP],
  });
}

/** Nama unit jadi potongan nama berkas yang aman di semua sistem berkas. */
function namaBerkas(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
