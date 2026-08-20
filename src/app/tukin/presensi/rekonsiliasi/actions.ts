"use server";

import { read, utils } from "xlsx";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount, ambilUserSesi } from "../../../../auth/getSessionAccount";
import { canUploadRekapPresensi, type AuthUser } from "../../../../auth/permissions";
import { parseRekapAbsensiManual } from "../../../../business-logic/rekapAbsensiManual";
import {
  rekapDariLaporanPdf,
  JADWAL_KERJA_DEFAULT,
} from "../../../../business-logic/presensiPdfKeRekap";
import { STATUS_HARIAN } from "../../../../business-logic/presensiKeDb";
import {
  bandingkanSatuPegawai,
  ringkasBanding,
  type HariDibandingkan,
  type HasilBandingPegawai,
  type RingkasanBanding,
} from "../../../../business-logic/bandingRekapPresensi";
import { muatKendalaPeriode, muatKoreksiPeriode } from "../../../../lib/kendalaPresensi";
import { muatHariLiburPeriode } from "../../../../lib/hariLibur";
import type { BarisRekapPresensi } from "../../../../business-logic/rekapPresensi";

/**
 * Rekonsiliasi berkas rekap absensi MANUAL petugas terhadap data Gajihub.
 *
 * TIDAK MENULIS APA PUN KE DATABASE - tidak ada `create`, `update`, maupun
 * `delete` di file ini, dan berkasnya sendiri tidak disimpan (dibaca di memori
 * lalu dibuang, pola yang sama dengan upload gaji induk & predikat kinerja).
 * Itu keputusan sadar: selama masa transisi, berkas petugas dan Gajihub adalah
 * DUA KLAIM tentang kejadian yang sama, dan alat ini cuma menyandingkannya.
 * Menentukan mana yang benar tetap pekerjaan manusia - dan koreksinya lewat
 * jalur yang sudah ada (tandai kendala + koreksi jam, atau perbaiki di
 * e-Presensi lalu tarik ulang), bukan lewat halaman ini.
 *
 * Otorisasi dicek PER PEGAWAI terhadap satuan kerjanya, bukan sekali per
 * berkas: satu berkas memuat seluruh unit, dan Kasubag TU tidak boleh ikut
 * melihat rincian presensi unit lain cuma karena namanya ada di berkas yang
 * dia unggah.
 */

const MAKS_UKURAN = 9 * 1024 * 1024; // di bawah bodySizeLimit 10mb (next.config.mjs)
const MAKS_PEGAWAI_DITAMPILKAN = 200;

export interface RekonsiliasiFormState {
  error?: string;
  namaFile?: string;
  namaSheet?: string;
  periode?: { bulan: number; tahun: number }[];
  ringkasan?: RingkasanBanding;
  pegawai?: HasilBandingPegawai[];
  jumlahTidakDitampilkan?: number;
  dilewati?: { alasan: string; jumlah: number; contoh: string[] }[];
  catatanBerkas?: string[];
}

function kelompokkan(items: { label: string; alasan: string }[]) {
  const urutan: string[] = [];
  const peta = new Map<string, string[]>();
  for (const it of items) {
    if (!peta.has(it.alasan)) {
      peta.set(it.alasan, []);
      urutan.push(it.alasan);
    }
    peta.get(it.alasan)!.push(it.label);
  }
  return urutan.map((alasan) => ({
    alasan,
    jumlah: peta.get(alasan)!.length,
    contoh: peta.get(alasan)!.slice(0, 4),
  }));
}

/**
 * Jam tersimpan sebagai `timestamp` yang komponen UTC-nya adalah jam dinding
 * (lihat `menitKeWaktu` di presensiKeDb.ts) - jadi dibaca balik lewat getUTC*,
 * BUKAN getHours() yang akan menggeser sesuai zona waktu server.
 */
function keMenit(d: Date | null): number | null {
  if (!d) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function isoDari(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function rekonsiliasiAbsensiAction(
  _state: RekonsiliasiFormState,
  formData: FormData
): Promise<RekonsiliasiFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };
    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = {
      nip: user.nip,
      role: user.role,
      satuanKerja: user.satuanKerja,
      aktif: user.aktif,
    };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { error: "Pilih dulu berkas rekap absensi petugas (.xlsx)." };
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      return { error: `"${file.name}" bukan berkas Excel (.xlsx/.xls).` };
    }
    if (file.size > MAKS_UKURAN) {
      return {
        error: `Ukuran berkas ${(file.size / 1024 / 1024).toFixed(1)} MB melebihi batas 9 MB.`,
      };
    }

    // --- 1. Baca berkas -------------------------------------------------------
    const wb = read(new Uint8Array(await file.arrayBuffer()), { type: "array", raw: true });
    // Sheet "Master Presensi" adalah yang berisi rincian harian. Sheet lain di
    // berkas asli ("Rekap Hadir") berisi periode yang berbeda dan sengaja tidak
    // dipakai.
    const namaSheet =
      wb.SheetNames.find((n) => n.toLowerCase().includes("master")) ?? wb.SheetNames[0];
    if (!namaSheet) return { error: "Berkas tidak punya sheet apa pun." };

    const matriks = utils.sheet_to_json<unknown[]>(wb.Sheets[namaSheet], {
      header: 1,
      raw: true,
      defval: null,
    });
    const parsed = parseRekapAbsensiManual(matriks);
    if (parsed.laporan.length === 0) {
      return {
        error:
          parsed.peringatan[0] ??
          `Tidak ada baris presensi yang terbaca di sheet "${namaSheet}". Pastikan yang diunggah berkas rekap absensi petugas.`,
        namaSheet,
      };
    }

    // --- 2. Cocokkan NIP ke Pegawai & saring kewenangan ----------------------
    const semuaNip = parsed.laporan.map((l) => l.nip!).filter(Boolean);
    const pegawai = await prisma.pegawai.findMany({
      where: { nip: { in: semuaNip } },
      select: { id: true, nip: true, nama: true, satuanKerja: true, kelasJabatan: true },
    });
    const petaPegawai = new Map(pegawai.map((p) => [p.nip, p]));

    const dilewati: { label: string; alasan: string }[] = [];
    const diproses: { laporan: (typeof parsed.laporan)[number]; peg: (typeof pegawai)[number] }[] = [];

    for (const l of parsed.laporan) {
      const label = `${l.nama ?? "(tanpa nama)"} (${l.nip})`;
      const peg = l.nip ? petaPegawai.get(l.nip) : undefined;
      if (!peg) {
        dilewati.push({ label, alasan: "NIP tidak ada di data pegawai Gajihub" });
        continue;
      }
      if (!canUploadRekapPresensi(authUser, peg.satuanKerja)) {
        dilewati.push({ label, alasan: `di luar kewenangan kamu (pegawai ${peg.satuanKerja})` });
        continue;
      }
      diproses.push({ laporan: l, peg });
    }

    if (diproses.length === 0) {
      return {
        error: "Tidak ada satu pun pegawai di berkas ini yang bisa kamu bandingkan.",
        namaFile: file.name,
        namaSheet,
        dilewati: kelompokkan(dilewati),
        catatanBerkas: parsed.peringatan,
      };
    }

    // --- 3. Muat konteks periode (kendala, koreksi, hari libur) ---------------
    // Dimuat SEBELUM rekap dihitung, dengan alasan yang sama seperti jalur PDF:
    // pengecualian Pasal 10 ayat (2) dan kalender libur harus sudah di tangan
    // saat kejadiannya dihitung, bukan dikurangkan belakangan.
    const periodeUnik = [
      ...new Set(diproses.map((d) => `${d.laporan.periodeBulan}-${d.laporan.periodeTahun}`)),
    ].map((k) => {
      const [bulan, tahun] = k.split("-").map(Number);
      return { bulan, tahun };
    });

    const konteks = new Map<
      string,
      {
        kendala: Awaited<ReturnType<typeof muatKendalaPeriode>>;
        koreksi: Awaited<ReturnType<typeof muatKoreksiPeriode>>;
        libur: Awaited<ReturnType<typeof muatHariLiburPeriode>>;
      }
    >();
    for (const p of periodeUnik) {
      const [kendala, koreksi, libur] = await Promise.all([
        muatKendalaPeriode(prisma, p.bulan, p.tahun),
        muatKoreksiPeriode(prisma, p.bulan, p.tahun),
        muatHariLiburPeriode(p.bulan, p.tahun),
      ]);
      konteks.set(`${p.bulan}-${p.tahun}`, { kendala, koreksi, libur });
    }

    // --- 4. Ambil sisi Gajihub ------------------------------------------------
    const idPegawai = diproses.map((d) => d.peg.id);
    const [rekapDb, harianDb] = await Promise.all([
      prisma.rekapPresensiPeriode.findMany({
        where: {
          pegawaiId: { in: idPegawai },
          OR: periodeUnik.map((p) => ({ periodeBulan: p.bulan, periodeTahun: p.tahun })),
        },
      }),
      prisma.presensiHarian.findMany({
        where: {
          pegawaiId: { in: idPegawai },
          OR: periodeUnik.map((p) => ({
            tanggal: {
              gte: new Date(Date.UTC(p.tahun, p.bulan - 1, 1)),
              lt: new Date(Date.UTC(p.tahun, p.bulan, 1)),
            },
          })),
        },
        select: {
          pegawaiId: true,
          tanggal: true,
          statusKehadiran: true,
          jamMasuk: true,
          jamKeluar: true,
        },
      }),
    ]);

    const petaRekapDb = new Map(
      rekapDb.map((r) => [`${r.pegawaiId}|${r.periodeBulan}-${r.periodeTahun}`, r])
    );
    const petaHarianDb = new Map<string, HariDibandingkan[]>();
    for (const h of harianDb) {
      const kunci = `${h.pegawaiId}|${h.tanggal.getUTCMonth() + 1}-${h.tanggal.getUTCFullYear()}`;
      const arr = petaHarianDb.get(kunci) ?? [];
      arr.push({
        tanggalIso: isoDari(h.tanggal),
        status: h.statusKehadiran,
        jamMasukMenit: keMenit(h.jamMasuk),
        jamKeluarMenit: keMenit(h.jamKeluar),
      });
      petaHarianDb.set(kunci, arr);
    }

    // --- 5. Bandingkan --------------------------------------------------------
    const hasil: HasilBandingPegawai[] = [];
    for (const { laporan, peg } of diproses) {
      const kunciPeriode = `${laporan.periodeBulan}-${laporan.periodeTahun}`;
      const ctx = konteks.get(kunciPeriode)!;
      const label = `${peg.nama} (${peg.nip})`;

      // Mesin yang SAMA dengan jalur PDF & tarikan e-Presensi - itu yang
      // membuat perbandingannya berarti. Kalau sisi petugas dihitung rumus
      // lain, beda hasil bisa datang dari beda rumus, bukan beda data.
      const rekapSisiPetugas = rekapDariLaporanPdf(
        laporan,
        JADWAL_KERJA_DEFAULT,
        ctx.kendala.untukNip(peg.nip),
        ctx.koreksi.untukNip(peg.nip),
        ctx.libur
      );

      const rekapDbBaris = petaRekapDb.get(`${peg.id}|${kunciPeriode}`);
      const hariDb = petaHarianDb.get(`${peg.id}|${kunciPeriode}`) ?? [];
      if (!rekapDbBaris) {
        dilewati.push({
          label,
          alasan: `Gajihub belum punya rekap presensi periode ${laporan.periodeBulan}/${laporan.periodeTahun} - tarik dulu presensinya`,
        });
        continue;
      }

      const rekapGajihub: BarisRekapPresensi = {
        nip: peg.nip,
        jumlahHariAlpha: rekapDbBaris.jumlahHariAlpha,
        jumlahTidakPresensi: rekapDbBaris.jumlahTidakPresensi,
        totalMenitTerlambat: rekapDbBaris.totalMenitTerlambat,
        totalMenitPulangCepat: rekapDbBaris.totalMenitPulangCepat,
        totalMenitMeninggalkanKantor: rekapDbBaris.totalMenitMeninggalkanKantor,
        jumlahTidakIkutUpacara: rekapDbBaris.jumlahTidakIkutUpacara,
        jumlahHariKerja: rekapDbBaris.jumlahHariKerja,
        jumlahHariHadir: rekapDbBaris.jumlahHariHadir,
        jumlahHariWfo: rekapDbBaris.jumlahHariWfo,
        jumlahHariWfhWfa: rekapDbBaris.jumlahHariWfhWfa,
        jumlahHariDiklat: rekapDbBaris.jumlahHariDiklat,
        jumlahHariDinasLuar: rekapDbBaris.jumlahHariDinasLuar,
        jumlahHariTugasBelajar: rekapDbBaris.jumlahHariTugasBelajar,
        jenisCutiAktif: rekapDbBaris.jenisCutiAktif as BarisRekapPresensi["jenisCutiAktif"],
        bulanCutiKeberapa: rekapDbBaris.bulanCutiKeberapa,
        jumlahHariCuti: rekapDbBaris.jumlahHariCuti,
        totalJamLembur: rekapDbBaris.totalJamLembur,
        totalJamLemburHariLibur: rekapDbBaris.totalJamLemburHariLibur,
        jumlahHariMakanLembur: rekapDbBaris.jumlahHariMakanLembur,
        jumlahHariMakanLemburHariLibur: rekapDbBaris.jumlahHariMakanLemburHariLibur,
      };

      hasil.push(
        bandingkanSatuPegawai({
          nip: peg.nip,
          nama: peg.nama,
          satuanKerja: peg.satuanKerja,
          kelasJabatan: peg.kelasJabatan ?? null,
          petugas: {
            rekap: rekapSisiPetugas.rekap,
            hari: rekapSisiPetugas.hari.map((h) => ({
              tanggalIso: h.tanggalIso,
              // WAJIB lewat STATUS_HARIAN: hasil analisis memakai KategoriHari
              // ("TIDAK_HADIR", "WFH_WFA") sementara database memakai enum
              // StatusKehadiran ("ALPHA", "WFH"). Tanpa pemetaan ini SETIAP
              // hari alpa dan setiap hari WFH akan terbaca sebagai beda.
              status: STATUS_HARIAN[h.kategori],
              jamMasukMenit: h.jamMasukMenit,
              jamKeluarMenit: h.jamKeluarMenit,
            })),
          },
          gajihub: { rekap: rekapGajihub, hari: hariDb },
        })
      );
    }

    if (hasil.length === 0) {
      return {
        error:
          "Semua pegawai di berkas ini belum punya rekap presensi di Gajihub untuk periodenya - tarik dulu presensi periode itu, baru bandingkan.",
        namaFile: file.name,
        namaSheet,
        dilewati: kelompokkan(dilewati),
        catatanBerkas: parsed.peringatan,
      };
    }

    // Yang paling besar taruhannya di atas: rupiah dulu, lalu jumlah beda.
    hasil.sort(
      (a, b) =>
        Math.abs(b.selisihRupiah ?? 0) - Math.abs(a.selisihRupiah ?? 0) ||
        b.bedaHarian.filter((x) => x.berdampak).length -
          a.bedaHarian.filter((x) => x.berdampak).length ||
        a.nama.localeCompare(b.nama)
    );

    const catatanBerkas = [...parsed.peringatan];
    if (parsed.dilewati.length > 0) {
      catatanBerkas.push(
        `${parsed.dilewati.length} baris di berkas tidak terbaca (contoh: baris ${parsed.dilewati
          .slice(0, 3)
          .map((d) => `${d.baris} - ${d.alasan}`)
          .join("; ")}).`
      );
    }

    return {
      namaFile: file.name,
      namaSheet,
      periode: periodeUnik,
      ringkasan: ringkasBanding(hasil),
      pegawai: hasil.slice(0, MAKS_PEGAWAI_DITAMPILKAN),
      jumlahTidakDitampilkan: Math.max(0, hasil.length - MAKS_PEGAWAI_DITAMPILKAN),
      dilewati: kelompokkan(dilewati),
      catatanBerkas,
    };
  } catch (e) {
    return { error: `Gagal membaca berkas: ${e instanceof Error ? e.message : String(e)}` };
  }
}
