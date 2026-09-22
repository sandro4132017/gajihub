import { prisma } from "../../../lib/prisma";
import type { PegawaiAdkHarian } from "../../../business-logic/adkHarian";
import { satkerTerkirim, whereIkutAdk } from "./satkerTerkirim";
import type { JenisPegawaiAdk } from "./jenisPegawaiAdk";

/**
 * Baris ADK Uang Lembur satu periode - SATU-SATUNYA tempat barisnya disusun.
 *
 * Kembarannya `dataUangMakanHarian.ts`, dan sengaja dibuat seragam: kedua
 * berkas dikirim ke tempat yang sama, lewat gerbang yang sama, dan diperiksa
 * orang yang sama. Aturan yang berbeda di antara keduanya berarti satu periode
 * bisa menghasilkan ADK Uang Makan berisi unit A tapi ADK Uang Lembur tidak -
 * dan selisihnya baru ketahuan sesudah dua-duanya diunggah ke Web Gaji.
 *
 * ISI BERKASNYA = FAKTA HARIAN, bukan rupiah: `NIP <tab> YYYY-MM-DD <tab> jam`.
 * Dibuktikan dari `Excel/Template-ADK-Lembur.xlsm` (sheet "hasil", 111 baris)
 * dan `Excel/Template-ADK-Lembur-txt.txt` yang isinya sama persis. Web Gaji
 * yang mengubahnya jadi rupiah dari grade pegawai.
 *
 * SUMBER JAMNYA `PresensiHarian.jamLembur`, bukan `UangLembur.totalJamLembur`:
 * angka bulanan tidak bisa dipecah balik jadi tanggal-tanggal tanpa mengarang
 * data. Keduanya tetap dicocokkan lewat `selisih` di bawah.
 */
export interface DataUangLemburHarian {
  pegawai: PegawaiAdkHarian[];
  /** Pegawai dari unit terkirim yang tidak punya satupun hari - barisnya kosong di berkas. */
  tanpaHari: number;
  totalBaris: number;
  /** Jumlah jam seluruh baris di berkas - angka yang akan dibayar Web Gaji. */
  totalJam: number;
  /**
   * Pegawai yang jumlah JAM di berkas berbeda dari `totalJamLembur` yang
   * tersimpan di rekap bulanan.
   *
   * Seharusnya selalu sama: pembulatan lembur terjadi PER HARI di hulu
   * (Metode A), jadi menjumlahkan jam harian mestinya menghasilkan angka yang
   * sama persis dengan totalnya. Kalau berbeda, rekap bulanannya dihitung
   * sebelum presensinya berubah - dan yang dibayar Web Gaji adalah jam di
   * berkas ini, bukan angka yang tersimpan. Wajib kelihatan sebelum dikirim.
   */
  selisih: { nip: string; nama: string; diBerkas: number; tersimpan: number }[];
  /**
   * Pegawai yang PUNYA jam lembur tercatat tapi TIDAK punya baris
   * `UangLembur` - jamnya tidak ikut ke berkas sama sekali.
   *
   * Ini sisi seberang `selisih`, dan yang lebih berbahaya: `selisih` soal
   * angka yang beda, ini soal orang yang HILANG. Sebabnya biasanya kalkulasi
   * unit belum dijalankan ulang sesudah presensinya masuk. Tanpa panel ini,
   * jam lembur yang sah lenyap dari berkas tanpa satu pun tanda.
   */
  tanpaKalkulasi: { nip: string; nama: string; jam: number }[];
}

export async function dataUangLemburHarian(
  bulan: number,
  tahun: number,
  /** Batasi ke satu satuan kerja - IRISAN dengan daftar unit terkirim, bukan penggantinya. */
  satuanKerja?: string | null,
  /** Penyaringan PNS/P3K - lihat ./jenisPegawaiAdk.ts. `null` = semua. */
  jenis?: JenisPegawaiAdk | null
): Promise<DataUangLemburHarian> {
  // Gerbang yang SAMA PERSIS dengan ADK Tukin & Uang Makan - lihat
  // ./satkerTerkirim.ts. Menggantikan gerbang lama `status: "APPROVED"` per
  // baris, yang sudah tidak berlaku sejak approval berjenjang dihapus
  // (2026-09-02) dan karenanya selalu menghasilkan berkas kosong.
  const semuaTerkirim = await satkerTerkirim(prisma, bulan, tahun);
  const satkerBoleh = satuanKerja ? semuaTerkirim.filter((s) => s === satuanKerja) : semuaTerkirim;
  const rows = await prisma.uangLembur.findMany({
    where: whereIkutAdk(bulan, tahun, satkerBoleh, jenis ?? null),
    include: { pegawai: { select: { id: true, nip: true, nama: true } } },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
  const akhir = new Date(Date.UTC(tahun, bulan, 1));

  // AKHIR PEKAN TIDAK DIBUANG di sini - beda dari uang makan, dan bedanya
  // mendasar: lembur hari libur memang hak yang dibayar (tarifnya justru lebih
  // tinggi). Yang menyaring hari mana yang berhak sudah terjadi di hulu, di
  // presensiPdfKeRekap.ts; di sini tinggal menyetorkan apa yang tercatat.
  const harian = await prisma.presensiHarian.findMany({
    where: {
      pegawaiId: { in: rows.map((r) => r.pegawai.id) },
      tanggal: { gte: awal, lt: akhir },
      jamLembur: { gt: 0 },
    },
    select: { pegawaiId: true, tanggal: true, jamLembur: true },
    orderBy: { tanggal: "asc" },
  });

  const perPegawai = new Map<string, { tanggalIso: string; jam: number }[]>();
  for (const h of harian) {
    const arr = perPegawai.get(h.pegawaiId) ?? [];
    arr.push({ tanggalIso: h.tanggal.toISOString().slice(0, 10), jam: h.jamLembur });
    perPegawai.set(h.pegawaiId, arr);
  }

  const pegawai: PegawaiAdkHarian[] = rows.map((r) => ({
    nip: r.pegawai.nip,
    nama: r.pegawai.nama,
    hari: perPegawai.get(r.pegawai.id) ?? [],
  }));

  const jumlahJam = (id: string) => (perPegawai.get(id) ?? []).reduce((n, h) => n + h.jam, 0);

  const selisih = rows
    .map((r) => ({
      nip: r.pegawai.nip,
      nama: r.pegawai.nama,
      diBerkas: jumlahJam(r.pegawai.id),
      tersimpan: r.totalJamLembur,
    }))
    .filter((s) => s.diBerkas !== s.tersimpan);

  // Pegawai berjam-lembur yang barisnya TIDAK ada di rekap bulanan. Dicari
  // lewat query terpisah - mereka justru yang tidak muncul di `rows`, jadi
  // tidak mungkin diturunkan dari sana.
  const sudahPunyaBaris = new Set(rows.map((r) => r.pegawai.id));
  const lemburTanpaBaris = await prisma.presensiHarian.groupBy({
    by: ["pegawaiId"],
    where: {
      tanggal: { gte: awal, lt: akhir },
      jamLembur: { gt: 0 },
      pegawai: { satuanKerja: { in: satkerBoleh } },
    },
    _sum: { jamLembur: true },
  });
  const idTertinggal = lemburTanpaBaris.filter((g) => !sudahPunyaBaris.has(g.pegawaiId));
  const pegawaiTertinggal = idTertinggal.length
    ? await prisma.pegawai.findMany({
        where: { id: { in: idTertinggal.map((g) => g.pegawaiId) } },
        select: { id: true, nip: true, nama: true },
      })
    : [];
  const petaJamTertinggal = new Map(idTertinggal.map((g) => [g.pegawaiId, g._sum.jamLembur ?? 0]));
  const tanpaKalkulasi = pegawaiTertinggal
    .map((p) => ({ nip: p.nip, nama: p.nama, jam: petaJamTertinggal.get(p.id) ?? 0 }))
    .sort((a, b) => b.jam - a.jam);

  return {
    pegawai,
    tanpaHari: pegawai.filter((p) => p.hari.length === 0).length,
    totalBaris: pegawai.reduce((n, p) => n + p.hari.length, 0),
    totalJam: pegawai.reduce((n, p) => n + p.hari.reduce((m, h) => m + (h.jam ?? 0), 0), 0),
    selisih,
    tanpaKalkulasi,
  };
}
