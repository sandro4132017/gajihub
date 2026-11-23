import { BATAS_NAMA_PER_PESAN } from "./pengingatAbsen";

// Murni - tanpa I/O. Bahan pesan grup WhatsApp untuk SPKL HARIAN: satu pesan
// per satker per tanggal, memuat semua perintah lembur TERKIRIM hari itu,
// dikelompokkan per Kepala Tim. Penanda format hanya yang dikenali WhatsApp:
// *tebal*, _miring_, dan butir "•" (sama dengan pengingatAbsen).
//
// TANPA NIP: nama boleh disebut (keputusan user, sama dengan pengingat absen),
// nomor induk tidak.

export interface AnggotaPesanLembur {
  nama: string;
  /** Jam lembur yang diperintahkan (bilangan bulat). */
  jam: number;
}

export interface KelompokPesanSpkl {
  kepalaTimNama: string;
  uraian: string;
  anggota: AnggotaPesanLembur[];
}

const BATAS_URAIAN = 300;

/**
 * Uraian tugas diketik bebas oleh Kepala Tim. Di pesan grup ia dijadikan SATU
 * baris, dan deretan 18 angka (bentuk NIP) dibuang supaya salah ketik/tempel
 * tidak membocorkan nomor induk ke grup.
 */
function bersihkanUraian(teks: string): string {
  const satuBaris = teks.replace(/\s+/g, " ").trim().replace(/\d{18}/g, "[nomor dihapus]");
  return satuBaris.length <= BATAS_URAIAN ? satuBaris : `${satuBaris.slice(0, BATAS_URAIAN).trimEnd()}...`;
}

/**
 * Satu pesan SPKL harian. null = tidak ada anggota sama sekali, jadi TIDAK ADA
 * pesan yang dikirim. Batas `BATAS_NAMA_PER_PESAN` berlaku atas TOTAL nama di
 * semua kelompok; sisanya disebut satu baris di akhir. Baris "ditandatangani
 * secara elektronik" hanya bila `bertte` (sementara lembur tanpa TTE).
 */
export function susunPesanSpklHarian({
  tanggalTeks,
  satuanKerja,
  kelompok,
  bertte,
}: {
  /** Sudah diformat, mis. "Kamis, 10 Desember 2026". */
  tanggalTeks: string;
  satuanKerja: string;
  kelompok: KelompokPesanSpkl[];
  bertte: boolean;
}): string | null {
  const total = kelompok.reduce((n, k) => n + k.anggota.length, 0);
  if (total === 0) return null;

  const isi: string[] = [];
  let sisaKuota = BATAS_NAMA_PER_PESAN;
  for (const k of kelompok) {
    if (k.anggota.length === 0 || sisaKuota <= 0) continue;
    const uraian = netralkanFormat(bersihkanUraian(k.uraian));
    isi.push(`*Pemberi perintah: ${netralkanFormat(k.kepalaTimNama)}*`);
    if (uraian) isi.push(`Tugas: ${uraian}`);
    for (const a of k.anggota.slice(0, sisaKuota)) {
      isi.push(`• ${netralkanFormat(a.nama)} — *${a.jam} jam*`);
    }
    sisaKuota -= Math.min(sisaKuota, k.anggota.length);
    isi.push("");
  }
  const tertampil = Math.min(total, BATAS_NAMA_PER_PESAN);
  if (total > tertampil) isi.push(`_...dan ${total - tertampil} pegawai lainnya_`, "");

  return [
    "📋 *SPKL HARIAN — PERINTAH LEMBUR*",
    `*Gajihub • ${tanggalTeks}*`,
    "",
    `Satuan kerja: ${netralkanFormat(satuanKerja)}`,
    `Jumlah pegawai: ${total}`,
    "",
    ...isi,
    ...(bertte ? ["SPKL ini sudah *ditandatangani secara elektronik*.", ""] : []),
    "*Gajihub — SPKL harian dapat diunduh di aplikasi.*",
  ].join("\n");
}

/**
 * Teks dari data (nama, uraian) tidak boleh membawa penanda format WhatsApp
 * (* _ ~ `): satu "*" di uraian bisa menebalkan separuh pesan. Penanda
 * dibuang, isi teksnya tetap.
 */
export function netralkanFormat(teks: string): string {
  return teks.replace(/[*_~`]/g, "");
}
