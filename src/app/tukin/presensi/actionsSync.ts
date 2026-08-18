"use server";

// ============================================================================
// Server Action tombol "Tarik data presensi" di /tukin/presensi.
//
// Memakai modul yang SAMA dengan jalur CLI (src/jobs/importPresensiEpresensi.ts):
//   - src/adapters/EpresensiAdapter.ts  (menarik & menganalisis)
//   - src/jobs/simpanRekapPresensi.ts   (menulis)
// Jadi angka yang dihasilkan tombol ini dan skrip CLI tidak bisa berbeda.
//
// BEDA PENTING dari jalur CLI: di sini kewenangan dicek PER PEGAWAI
// (canUploadRekapPresensi terhadap satuan kerja pegawainya), persis seperti
// jalur upload PDF - satu tarikan berisi pegawai lintas unit, dan Kasubag TU
// hanya boleh menyimpan pegawai unitnya sendiri. Yang di luar kewenangan
// DILEWATI dengan alasan eksplisit, bukan gagal diam-diam.
// ============================================================================

import { revalidatePath } from "next/cache";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { ambilUserSesi } from "../../../auth/getSessionAccount";
import { canUploadRekapPresensi, type AuthUser } from "../../../auth/permissions";
import { tarikPresensiPeriode } from "../../../adapters/EpresensiAdapter";
import { simpanHasilPresensi } from "../../../jobs/simpanRekapPresensi";
import { muatKendalaPeriode, muatKoreksiPeriode } from "../../../lib/kendalaPresensi";
import { muatHariLiburPeriode } from "../../../lib/hariLibur";

export interface SinkronPresensiFormState {
  error?: string;
  ringkasan?: {
    periodeBulan: number;
    periodeTahun: number;
    totalPegawaiSumber: number;
    tersimpan: number;
    dilewati: { alasan: string; jumlah: number }[];
    /** Tanggal kendala e-Presensi yang berlaku di periode ini (Pasal 10 ayat (2)). */
    tanggalKendala: string[];
    /** Total kejadian Pasal 13 ayat (2) yang dibatalkan karenanya. */
    kejadianDikecualikan: number;
    /** Baris koreksi jam manual yang ikut diterapkan di periode ini. */
    koreksiJamDipakai: number;
  };
}

export async function tarikPresensiEpresensiAction(
  _state: SinkronPresensiFormState,
  formData: FormData
): Promise<SinkronPresensiFormState> {
  try {
    const akun = await getSessionAccount();
    if (!akun) return { error: "Sesi login sudah habis - silakan login ulang." };

    const user = await ambilUserSesi();
    if (!user) return { error: "Akun tidak terdaftar sebagai User." };
    const authUser: AuthUser = { nip: user.nip, role: user.role, satuanKerja: user.satuanKerja, aktif: user.aktif };

    const bulan = Number(formData.get("bulan"));
    const tahun = Number(formData.get("tahun"));
    if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12 || !Number.isInteger(tahun) || tahun < 2000) {
      return { error: "Periode tidak valid - pilih bulan 1-12 dan tahun yang benar." };
    }

    // Penanda kendala e-Presensi (Pasal 10 ayat (2)) dimuat SEBELUM tarikan,
    // lalu dioper ke dalamnya - pengecualiannya terjadi di fungsi yang sama
    // yang menghitung kejadiannya, bukan dikurangkan belakangan.
    const kendala = await muatKendalaPeriode(prisma, bulan, tahun);
    const koreksi = await muatKoreksiPeriode(prisma, bulan, tahun);
    const hariLibur = await muatHariLiburPeriode(bulan, tahun);
    const tarikan = await tarikPresensiPeriode(
      bulan,
      tahun,
      kendala.untukNip,
      koreksi.untukNip,
      hariLibur
    );

    const pegawaiDb = await prisma.pegawai.findMany({
      where: { nip: { in: tarikan.pegawai.map((p) => p.nip) } },
      select: { id: true, nip: true, satuanKerja: true },
    });
    const peta = new Map(pegawaiDb.map((p) => [p.nip, p]));

    const alasanDilewati = new Map<string, number>();
    const catat = (alasan: string) => alasanDilewati.set(alasan, (alasanDilewati.get(alasan) ?? 0) + 1);
    for (const d of tarikan.dilewati) catat(d.alasan);

    let tersimpan = 0;
    let kejadianDikecualikan = 0;
    for (const p of tarikan.pegawai) {
      const pegawai = peta.get(p.nip);
      if (!pegawai) {
        catat("NIP belum ada di data Pegawai Gajihub");
        continue;
      }
      if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja)) {
        catat(`di luar kewenangan kamu (pegawai ${pegawai.satuanKerja})`);
        continue;
      }
      // Dihitung dari yang BENAR-BENAR tersimpan, bukan dari seluruh tarikan -
      // pegawai di luar kewenangan tidak ikut ditulis, jadi tidak boleh ikut
      // dilaporkan sebagai "sudah dikecualikan".
      kejadianDikecualikan += p.hasil.kejadianDikecualikanKendala;
      await simpanHasilPresensi(prisma, {
        pegawaiId: pegawai.id,
        periodeBulan: bulan,
        periodeTahun: tahun,
        hasil: p.hasil,
        diunggahOlehId: user.id,
        sourceSystem: "e-Presensi (sinkronisasi)",
      });
      tersimpan++;
    }

    revalidatePath("/tukin/presensi");
    revalidatePath("/tukin");

    return {
      ringkasan: {
        periodeBulan: bulan,
        periodeTahun: tahun,
        totalPegawaiSumber: tarikan.totalPegawaiSumber,
        tersimpan,
        dilewati: [...alasanDilewati]
          .map(([alasan, jumlah]) => ({ alasan, jumlah }))
          .sort((a, b) => b.jumlah - a.jumlah),
        tanggalKendala: [...new Set(kendala.penanda.map((k) => k.tanggalIso))].sort(),
        kejadianDikecualikan,
        koreksiJamDipakai: koreksi.jumlah,
      },
    };
  } catch (err) {
    // Kegagalan koneksi ke e-Presensi/SIAP paling mungkin terjadi di sini
    // (jaringan kantor/VPN). Tampilkan apa adanya supaya bisa ditelusuri,
    // jangan ditelan jadi "terjadi kesalahan".
    return { error: `Gagal menarik data dari e-Presensi: ${err instanceof Error ? err.message : String(err)}` };
  }
}
