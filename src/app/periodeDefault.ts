import { prisma } from "../lib/prisma";

/**
 * Periode default halaman - dipakai kalau user membuka halaman TANPA ?bulan=&tahun=.
 *
 * KENAPA BUKAN SEKADAR "BULAN BERJALAN": halaman-halaman periode di Gajihub
 * dulu selalu jatuh ke bulan berjalan, dan itu hampir selalu bulan yang BELUM
 * ada datanya - rekap presensi ditarik setelah bulannya lewat, dan predikat
 * kinerja terbit lebih lambat lagi. Akibatnya link sidebar (yang tidak membawa
 * query string) mendarat di halaman kosong, dan halaman kosong tidak bisa
 * dibedakan dari "data hilang". Ini pernah benar-benar terjadi: "saya udah
 * kalkulasi unit, kok belum ada angka data nya di tabel?" - padahal
 * kalkulasinya berhasil, cuma untuk bulan yang berbeda dari yang terbuka.
 *
 * DAN KENAPA BUKAN BULAN BERJALAN WALAU DATANYA SUDAH ADA (diubah 2026-08-18):
 * bulan berjalan itu periode yang BELUM SELESAI. Presensinya baru terisi
 * sebagian - per 18 Agustus, rekap Agustus cuma memuat kehadiran sampai
 * tanggal itu - jadi potongan Pasal 13, hari uang makan, dan jam lembur
 * semuanya masih akan berubah sampai bulannya tutup. Membukanya sebagai
 * tampilan bawaan menyodorkan angka setengah jadi sebagai kalau-kalau sudah
 * final, dan itu angka yang dipakai orang mengambil keputusan bayar.
 *
 * Jadi bawaannya = periode TERBARU yang datanya ada DAN bulannya sudah lewat.
 * Bulan berjalan tetap bisa dibuka, cuma harus dipilih sendiri lewat filter -
 * pilihan sadar, bukan yang kebetulan terbuka.
 *
 * Aturannya bergerak sendiri: begitu masuk September, bawaannya jadi Agustus.
 * TIDAK ADA bulan yang di-hardcode di sini.
 */
export type Periode = { bulan: number; tahun: number };

/**
 * PURE. `tersedia` boleh tidak urut - urutannya ditentukan di sini, bukan oleh
 * pemanggil, supaya dua pemanggil tidak bisa memberi jawaban berbeda untuk data
 * yang sama.
 */
export function pilihPeriodeDefault(
  tersedia: Periode[],
  sekarang: Periode
): Periode {
  // Terbaru = tahun dulu, baru bulan. Periode di masa depan TIDAK dibuang:
  // kalau ada, itu memang data yang sengaja dimasukkan lebih awal, dan
  // menyembunyikannya membuat halamannya tidak bisa dibuka lewat sidebar.
  const terurut = [...tersedia].sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);

  // Bulan BERJALAN dilewati - datanya masih setengah jalan sampai bulannya
  // tutup (lihat catatan panjang di kepala file).
  const bukanBerjalan = terurut.filter(
    (p) => !(p.bulan === sekarang.bulan && p.tahun === sekarang.tahun)
  );

  // Kalau yang ada CUMA bulan berjalan (mis. server baru yang baru sekali
  // menarik presensi), tetap dipakai - halaman kosong tanpa penjelasan lebih
  // buruk daripada angka yang belum final.
  return bukanBerjalan[0] ?? terurut[0] ?? sekarang;
}

/** Periode berjalan menurut jam server. Dipisah supaya gampang di-stub di test. */
export function periodeSekarang(waktu = new Date()): Periode {
  return { bulan: waktu.getMonth() + 1, tahun: waktu.getFullYear() };
}

/**
 * Resolusi periode dari query string + data yang benar-benar ada.
 *
 * Angka dari query string dipakai APA ADANYA kalau waras (bulan 1-12, tahun 4
 * digit) - user yang sudah memilih periode tidak boleh dipindahkan diam-diam,
 * termasuk ke periode kosong: kalau dia membuka Agustus dan Agustus memang
 * kosong, itu jawaban yang benar.
 */
export function resolvePeriode(
  bulan: string | undefined,
  tahun: string | undefined,
  tersedia: Periode[],
  waktu = new Date()
): Periode {
  const b = Number(bulan);
  const t = Number(tahun);
  const bulanSah = Number.isInteger(b) && b >= 1 && b <= 12;
  const tahunSah = Number.isInteger(t) && t >= 1000 && t <= 9999;
  if (bulanSah && tahunSah) return { bulan: b, tahun: t };

  const nowP = periodeSekarang(waktu);
  const dipilih = pilihPeriodeDefault(tersedia, nowP);
  // Salah satu terisi, satunya tidak: yang terisi tetap menang, sisanya diambil
  // dari periode default. Kalau tidak, ?bulan=7 tanpa tahun akan diam-diam
  // berpindah bulan juga.
  return {
    bulan: bulanSah ? b : dipilih.bulan,
    tahun: tahunSah ? t : dipilih.tahun,
  };
}

// --- Pengambil daftar periode per jenis data (I/O, bukan pure) ---
//
// Masing-masing halaman bertanya ke tabel yang memang jadi isi halaman itu.
// Sengaja TIDAK disatukan jadi satu "periode terbaru" global: /tukin/presensi
// punya data untuk 8 periode sementara kalkulasi cuma 2, dan memakai angka yang
// sama untuk keduanya akan memindahkan salah satunya ke periode kosong.

/** Periode yang punya rekap presensi (opsional: cuma untuk satu satuan kerja). */
export async function periodePunyaRekapPresensi(satuanKerja?: string): Promise<Periode[]> {
  const rows = await prisma.rekapPresensiPeriode.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    ...(satuanKerja ? { where: { pegawai: { satuanKerja } } } : {}),
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}

/** Periode yang punya rincian presensi HARIAN untuk satu pegawai. */
export async function periodePunyaPresensiHarian(pegawaiId: string): Promise<Periode[]> {
  const rows = await prisma.$queryRaw<{ bulan: number; tahun: number }[]>`
    SELECT DISTINCT EXTRACT(MONTH FROM tanggal)::int AS bulan,
                    EXTRACT(YEAR  FROM tanggal)::int AS tahun
      FROM presensi_harian
     WHERE pegawai_id = ${pegawaiId}`;
  return rows.map((r) => ({ bulan: Number(r.bulan), tahun: Number(r.tahun) }));
}

/**
 * Periode yang punya predikat kinerja - dipakai halaman Kalkulasi Unit.
 *
 * KENAPA PREDIKAT, BUKAN KALKULASI: kalkulasi adalah HASIL halaman itu, jadi
 * memakainya sebagai penentu default membuat periode yang belum pernah dihitung
 * tidak akan pernah terbuka - persis periode yang paling perlu dibuka.
 * Predikat kinerja adalah komponen yang paling terakhir tersedia (presensi ada
 * untuk semua bulan), jadi periode terbaru yang punya predikat adalah periode
 * terbaru yang benar-benar bisa dihitung.
 */
export async function periodePunyaPredikatKinerja(satuanKerja?: string): Promise<Periode[]> {
  const rows = await prisma.predikatKinerja.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
    ...(satuanKerja ? { where: { pegawai: { satuanKerja } } } : {}),
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}

/** Periode yang punya kalkulasi Tukin - dipakai halaman export ADK. */
export async function periodePunyaTukin(): Promise<Periode[]> {
  const rows = await prisma.tukinCalculation.findMany({
    distinct: ["periodeBulan", "periodeTahun"],
    select: { periodeBulan: true, periodeTahun: true },
  });
  return rows.map((r) => ({ bulan: r.periodeBulan, tahun: r.periodeTahun }));
}
