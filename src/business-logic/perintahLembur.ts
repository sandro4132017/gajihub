/**
 * Logika murni perintah lembur (SPKL): batas kirim, validasi isi, bentrok.
 * Nol I/O - data masuk lewat parameter.
 */

/**
 * Batas jam kirim perintah pada hari lemburnya, WIB.
 * Dasar: keputusan user 2026-11-19.
 */
export const JAM_BATAS_KIRIM_WIB = 15;

/**
 * Batas kewajaran jam per anggota per perintah (satu hari = 24 jam), BUKAN
 * batas resmi.
 * TODO(confirm): batas jam lembur resmi per hari belum dikonfirmasi.
 */
export const BATAS_JAM_PER_PERINTAH = 24;

// WIB tidak mengenal DST: offset tetap +7 (pola sama dengan src/auth/akunPenguji.ts).
const OFFSET_WIB_MS = 7 * 60 * 60 * 1000;

export interface HasilBatasKirim {
  boleh: boolean;
  alasan?: string;
}

/**
 * Perintah boleh dikirim bila `sekarang` <= tanggal lembur pukul 15:00:00 WIB.
 * Batas INKLUSIF: tepat 15:00:00.000 masih diterima, 15:00:00.001 ditolak.
 * Tanggal yang akan datang selalu boleh; tanggal lampau ditolak. Hasilnya
 * tidak bergantung zona waktu proses (semua hitungan dalam epoch UTC).
 */
export function batasKirimPerintah(tanggalIso: string, sekarang: Date): HasilBatasKirim {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggalIso);
  if (!m) return { boleh: false, alasan: "Tanggal lembur tidak valid." };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const cek = new Date(Date.UTC(y, mo - 1, d));
  if (cek.getUTCFullYear() !== y || cek.getUTCMonth() !== mo - 1 || cek.getUTCDate() !== d) {
    return { boleh: false, alasan: "Tanggal lembur tidak valid." };
  }
  const batas = Date.UTC(y, mo - 1, d, JAM_BATAS_KIRIM_WIB) - OFFSET_WIB_MS;
  if (sekarang.getTime() <= batas) return { boleh: true };
  return {
    boleh: false,
    alasan: `Perintah lembur harus dikirim paling lambat pukul ${String(JAM_BATAS_KIRIM_WIB).padStart(2, "0")}.00 WIB pada hari lemburnya.`,
  };
}

/** Tanggal hari ini menurut WIB, `YYYY-MM-DD`; tidak bergantung zona waktu proses. */
export function tanggalIsoWib(sekarang: Date): string {
  return new Date(sekarang.getTime() + OFFSET_WIB_MS).toISOString().slice(0, 10);
}

/**
 * Sisa waktu menuju batas kirim (ms), dihitung dari jam yang diberikan
 * pemanggil. Nol atau negatif = batas sudah lewat (batas inklusif: tepat di
 * batas masih 0 ms tersisa dan masih boleh, jadi pemanggil memakai
 * `batasKirimPerintah` untuk keputusan, ini hanya untuk tampilan). null =
 * tanggal tidak sah.
 */
export function sisaMenujuBatasMs(tanggalIso: string, sekarang: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggalIso);
  if (!m) return null;
  const batas = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), JAM_BATAS_KIRIM_WIB) - OFFSET_WIB_MS;
  return batas - sekarang.getTime();
}

/** "2 jam 05 menit", "4 menit 09 detik"; ms <= 0 menjadi "0 detik". */
export function formatSisaWaktu(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const jam = Math.floor(total / 3600);
  const menit = Math.floor((total % 3600) / 60);
  const detik = total % 60;
  if (jam >= 24) return `${Math.floor(jam / 24)} hari ${jam % 24} jam`;
  if (jam > 0) return `${jam} jam ${String(menit).padStart(2, "0")} menit`;
  if (menit > 0) return `${menit} menit ${String(detik).padStart(2, "0")} detik`;
  return `${detik} detik`;
}

export interface AnggotaPerintahInput {
  pegawaiId: string;
  jam: number;
}

export interface PerintahInput {
  anggota: AnggotaPerintahInput[];
  uraianTugas: string;
}

/** Daftar galat yang bisa ditampilkan; kosong = sah. */
export function validasiPerintah(input: PerintahInput): string[] {
  const galat: string[] = [];
  if (input.anggota.length < 1) galat.push("Pilih minimal satu anggota.");

  const terlihat = new Set<string>();
  let adaDuplikat = false;
  let jamTakSah = false;
  for (const a of input.anggota) {
    if (terlihat.has(a.pegawaiId)) adaDuplikat = true;
    terlihat.add(a.pegawaiId);
    if (!Number.isInteger(a.jam) || a.jam < 1 || a.jam > BATAS_JAM_PER_PERINTAH) jamTakSah = true;
  }
  if (adaDuplikat) galat.push("Ada anggota yang dipilih lebih dari sekali.");
  if (jamTakSah) {
    galat.push(`Jam lembur tiap anggota harus bilangan bulat 1 sampai ${BATAS_JAM_PER_PERINTAH}.`);
  }
  if (input.uraianTugas.trim() === "") galat.push("Uraian tugas wajib diisi.");
  return galat;
}

/**
 * Pegawai di `anggotaBaru` yang sudah punya perintah TERKIRIM pada tanggal yang
 * sama. Keputusan default: satu perintah per pegawai per tanggal.
 */
export function cariBentrok(
  anggotaBaru: string[],
  sudahTerkirim: { pegawaiId: string }[],
): string[] {
  const ada = new Set(sudahTerkirim.map((x) => x.pegawaiId));
  return [...new Set(anggotaBaru.filter((id) => ada.has(id)))];
}
