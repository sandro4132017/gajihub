/**
 * Bagian murni form perintah lembur (tanpa prisma, tanpa React): pilihan
 * anggota yang aman dikirim ke komponen klien, dan keadaan kolom tanggal.
 */

import { batasKirimPerintah } from "../../business-logic/perintahLembur";

/** Isi yang boleh sampai ke klien: TANPA NIP. */
export interface AnggotaPilihan {
  id: string;
  nama: string;
  /** "" kalau nama unik; selain itu "(1)", "(2)", ... Bukan NIP. */
  penanda: string;
}

export function labelAnggota(a: AnggotaPilihan): string {
  return a.penanda ? `${a.nama} ${a.penanda}` : a.nama;
}

/**
 * Siapkan pilihan anggota. Label hanya NAMA, tanpa jabatan (keputusan user
 * 2026-11-23); nama yang kembar diberi penanda urutan netral "(1)", "(2)".
 */
export function buatPilihanAnggota(
  sumber: { id: string; nama: string }[],
): AnggotaPilihan[] {
  const kunci = (s: { nama: string }) => s.nama.trim().toLowerCase();
  const jumlah = new Map<string, number>();
  for (const s of sumber) jumlah.set(kunci(s), (jumlah.get(kunci(s)) ?? 0) + 1);
  const urutan = new Map<string, number>();
  return sumber.map((s) => {
    const k = kunci(s);
    const ke = (urutan.get(k) ?? 0) + 1;
    urutan.set(k, ke);
    return {
      id: s.id,
      nama: s.nama,
      penanda: (jumlah.get(k) ?? 0) > 1 ? `(${ke})` : "",
    };
  });
}

export interface KeadaanTanggal {
  kosong: boolean;
  terkunci: boolean;
  alasan: string | undefined;
}

/** Keadaan kolom tanggal: kosong, di luar rentang, atau lewat batas kirim. */
export function keadaanTanggal(o: {
  tanggal: string;
  hariIni: string;
  berlakuMulai: string;
  sekarang: Date;
  /** Teks tanggal siap tampil untuk `berlakuMulai`. */
  berlakuMulaiTeks: string;
}): KeadaanTanggal {
  if (o.tanggal === "") return { kosong: true, terkunci: true, alasan: "Pilih tanggal lembur." };
  const tanggalMin = o.hariIni >= o.berlakuMulai ? o.hariIni : o.berlakuMulai;
  if (o.tanggal < tanggalMin) {
    return {
      kosong: false,
      terkunci: true,
      alasan:
        o.tanggal < o.hariIni
          ? "Tanggal yang sudah lewat tidak bisa diberi perintah."
          : `SPKL baru berlaku mulai ${o.berlakuMulaiTeks}.`,
    };
  }
  const gerbang = batasKirimPerintah(o.tanggal, o.sekarang);
  return { kosong: false, terkunci: !gerbang.boleh, alasan: gerbang.boleh ? undefined : gerbang.alasan };
}
