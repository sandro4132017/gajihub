import { prisma } from "../../../lib/prisma";
import { akhirPekan, type PegawaiAdkHarian } from "../../../business-logic/adkHarian";
import { STATUS_BERHAK_UANG_MAKAN } from "./statusUangMakan";

/**
 * Baris ADK Uang Makan satu periode - SATU-SATUNYA tempat barisnya disusun.
 *
 * Dipakai bareng Route Handler yang menghasilkan berkasnya DAN pratinjau di
 * halaman /ppabp/adk. Kalau keduanya menyusun barisnya sendiri-sendiri, cepat
 * atau lambat pratinjau dan berkas berbeda - dan bedanya baru ketahuan setelah
 * berkas yang salah terkirim ke Web Gaji. Prinsip yang sama sudah dipegang
 * `src/business-logic/adk.ts` untuk ADK Tukin.
 *
 * SUMBER HARINYA `PresensiHarian`, bukan `UangMakan.jumlahHariDibayar`: angka
 * bulanan tidak bisa dipecah balik jadi tanggal-tanggal tanpa mengarang data.
 * Keduanya tetap dicocokkan lewat `selisih` di bawah.
 */
export interface DataUangMakanHarian {
  pegawai: PegawaiAdkHarian[];
  /** Pegawai APPROVED yang tidak punya satupun hari - barisnya kosong di berkas. */
  tanpaHari: number;
  totalBaris: number;
  /**
   * Pegawai yang jumlah tanggalnya BEDA dari `jumlahHariDibayar` yang sudah
   * disetujui. Bukan berarti salah - rekap bulanan bisa dihitung sebelum
   * presensinya berubah - tapi wajib kelihatan sebelum berkasnya dikirim,
   * karena yang dibayar Web Gaji adalah jumlah tanggal di berkas ini, bukan
   * angka yang di-approve.
   */
  selisih: { nip: string; nama: string; diBerkas: number; disetujui: number }[];
}

export async function dataUangMakanHarian(bulan: number, tahun: number): Promise<DataUangMakanHarian> {
  const rows = await prisma.uangMakan.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, status: "APPROVED" },
    include: { pegawai: { select: { id: true, nip: true, nama: true } } },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const harian = await prisma.presensiHarian.findMany({
    where: {
      pegawaiId: { in: rows.map((r) => r.pegawai.id) },
      tanggal: {
        gte: new Date(Date.UTC(tahun, bulan - 1, 1)),
        lt: new Date(Date.UTC(tahun, bulan, 1)),
      },
      statusKehadiran: { in: [...STATUS_BERHAK_UANG_MAKAN] },
    },
    select: { pegawaiId: true, tanggal: true },
    orderBy: { tanggal: "asc" },
  });

  const perPegawai = new Map<string, string[]>();
  for (const h of harian) {
    const iso = h.tanggal.toISOString().slice(0, 10);
    // Akhir pekan dibuang: SBM item 22.1 mendasarkan uang makan pada HARI
    // KERJA. Tanggal merah tidak perlu diurus di sini - di hari itu e-Presensi
    // memang tidak punya satupun baris WFO/WFH, jadi harinya hilang dengan
    // sendirinya (dibuktikan di 1 & 16 Juni 2026: nol hadir).
    if (akhirPekan(iso)) continue;
    const arr = perPegawai.get(h.pegawaiId) ?? [];
    arr.push(iso);
    perPegawai.set(h.pegawaiId, arr);
  }

  const pegawai: PegawaiAdkHarian[] = rows.map((r) => ({
    nip: r.pegawai.nip,
    nama: r.pegawai.nama,
    hari: (perPegawai.get(r.pegawai.id) ?? []).map((tanggalIso) => ({ tanggalIso })),
  }));

  const selisih = rows
    .map((r) => ({
      nip: r.pegawai.nip,
      nama: r.pegawai.nama,
      diBerkas: (perPegawai.get(r.pegawai.id) ?? []).length,
      disetujui: r.jumlahHariDibayar,
    }))
    .filter((s) => s.diBerkas !== s.disetujui);

  return {
    pegawai,
    tanpaHari: pegawai.filter((p) => p.hari.length === 0).length,
    totalBaris: pegawai.reduce((n, p) => n + p.hari.length, 0),
    selisih,
  };
}
