import { BATAS_NAMA_PER_PESAN } from "./pengingatAbsen";

// Murni - tanpa I/O. Bahan pesan grup WhatsApp untuk perintah lembur yang sudah
// TERKIRIM. Penanda format hanya yang dikenali WhatsApp: *tebal*, _miring_, dan
// butir "•" (sama dengan pengingatAbsen).
//
// TANPA NIP: nama boleh disebut (keputusan user, sama dengan pengingat absen),
// nomor induk tidak.

export interface AnggotaPesanLembur {
  nama: string;
  /** Jam lembur yang diperintahkan (bilangan bulat). */
  jam: number;
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

/** null = tidak ada anggota, jadi TIDAK ADA pesan yang dikirim. */
export function susunPesanPerintahLembur({
  tanggalTeks,
  kepalaTimNama,
  satuanKerja,
  nomorSurat,
  uraianTugas,
  anggota,
}: {
  /** Sudah diformat, mis. "Kamis, 10 Desember 2026". */
  tanggalTeks: string;
  kepalaTimNama: string;
  satuanKerja: string;
  nomorSurat: string | null;
  uraianTugas: string;
  anggota: AnggotaPesanLembur[];
}): string | null {
  if (anggota.length === 0) return null;

  const tampil = anggota
    .slice(0, BATAS_NAMA_PER_PESAN)
    .map((a) => `• ${netralkanFormat(a.nama)} — *${a.jam} jam*`);
  if (anggota.length > BATAS_NAMA_PER_PESAN) {
    tampil.push(`_...dan ${anggota.length - BATAS_NAMA_PER_PESAN} pegawai lainnya_`);
  }

  const uraian = netralkanFormat(bersihkanUraian(uraianTugas));
  const nomor = netralkanFormat(nomorSurat?.trim() ?? "");

  return [
    "📋 *PERINTAH LEMBUR*",
    `*Gajihub • ${tanggalTeks}*`,
    "",
    `Satuan kerja: ${netralkanFormat(satuanKerja)}`,
    ...(nomor ? [`Nomor surat: ${nomor}`] : []),
    `Diperintahkan oleh: ${netralkanFormat(kepalaTimNama)}`,
    ...(uraian ? [`Tugas: ${uraian}`] : []),
    "",
    "👤 *Pegawai yang diperintahkan:*",
    ...tampil,
    "",
    "Perintah ini sudah *ditandatangani secara elektronik*.",
    "",
    "*Gajihub — Surat perintah lembur dapat dilihat di aplikasi.*",
  ].join("\n");
}

/**
 * Teks dari data (nama, uraian, nomor surat) tidak boleh membawa penanda
 * format WhatsApp (* _ ~ `): satu "*" di uraian bisa menebalkan separuh pesan.
 * Penanda dibuang, isi teksnya tetap.
 */
export function netralkanFormat(teks: string): string {
  return teks.replace(/[*_~`]/g, "");
}
