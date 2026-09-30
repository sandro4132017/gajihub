import {
  ISTIRAHAT_MENIT,
  JADWAL_KERJA_DEFAULT,
  batasCheckoutMenit,
} from "./presensiPdfKeRekap";

/** Status e-Presensi yang berarti "tidak wajib tap hari ini". */
export const STATUS_BERKETERANGAN = [
  "Cuti",
  "Dinas Keluar",
  "Diklat",
  "Tugas Belajar",
  "Izin",
] as const;

/**
 * Batas panjang daftar nama dalam satu pesan.
 *
 * Bukan angka sembarang: pesan WhatsApp berisi seratus nama tidak terbaca
 * siapa pun, dan justru memperbesar sebaran data tanpa menambah gunanya.
 * Sisanya disebut sebagai jumlah, bukan dipotong diam-diam.
 */
export const BATAS_NAMA_PER_PESAN = 40;

export interface PegawaiUnit {
  nip: string;
  nama: string;
}

/** Ketukan hari ini - bentuk yang sama dengan keluaran `ambilAbsenHariIni()`. */
export interface KetukanPegawai {
  status: string | null;
  jamMasukMenit: number | null;
  jamKeluarMenit: number | null;
}

export interface BarisBelumCheckout {
  nama: string;
  /** Jam paling cepat dia boleh tap pulang, "HH:MM". */
  bolehPulang: string;
}

export interface DaftarPengingat {
  /** Belum ada ketukan masuk, DAN tidak berstatus cuti/dinas/diklat. */
  belumCheckin: string[];
  /** Sudah tap masuk, belum tap pulang. */
  belumCheckout: BarisBelumCheckout[];
  /** Yang dilewati karena berketerangan sah - dilaporkan sebagai jumlah. */
  berketerangan: number;
  totalAktif: number;
  sudahCheckin: number;
}

export function jamTeksDariMenit(menit: number): string {
  const j = Math.floor(menit / 60) % 24;
  const m = menit % 60;
  return `${String(j).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Susun kedua daftar dari roster unit + ketukan hari ini.
 *
 * `indeksHari` (0 Minggu ... 6 Sabtu) menentukan jam pulang wajib & istirahat,
 * dan itulah yang membuat "boleh pulang" bergeser mengikuti jam kedatangan.
 *
 * ORANG YANG TIDAK PUNYA BARIS SAMA SEKALI masuk `belumCheckin`, dan itu
 * terpaksa: e-Presensi baru membuat baris ketika seseorang tap, jadi orang yang
 * cutinya belum tercatat di sistem itu tidak bisa dibedakan dari orang yang
 * memang belum tap. Diukur 29 September 2026: Cuti = 0 baris se-kementerian
 * pada pukul 10:41 padahal ±480 pegawai belum punya baris. Itu sebabnya kalimat
 * penutup pesan bukan hiasan.
 */
export function susunDaftarPengingat({
  roster,
  perNip,
  indeksHari,
  sekarangMenit,
  hariLibur,
}: {
  roster: PegawaiUnit[];
  perNip: Map<string, KetukanPegawai>;
  indeksHari: number;
  /**
   * Jam sekarang menurut server e-Presensi. Kalau diisi, `belumCheckout` HANYA
   * memuat orang yang jam boleh pulangnya SUDAH LEWAT.
   *
   * KENAPA PENTING: jam boleh pulang bergeser mengikuti jam kedatangan, jadi
   * pada pukul 16:05 ada orang yang memang baru boleh pulang 17:00. Menyebut
   * namanya di grup saat itu berarti menamai orang yang belum melakukan apa pun
   * yang salah. Diukur pada data nyata pukul 11:30: tanpa saringan ini daftarnya
   * memuat 40 nama - seluruh orang yang hadir hari itu.
   *
   * Dibiarkan undefined = tampilkan semua yang belum tap pulang.
   */
  sekarangMenit?: number;
  /**
   * true = tanggal merah / cuti bersama menurut `HariLiburNasional`.
   *
   * Sabtu & Minggu TIDAK perlu diisi di sini - jadwalnya sudah menyebut
   * dirinya sendiri lewat `jamPulangWajibMenit` yang null. Yang tidak bisa
   * diturunkan dari jadwal cuma tanggal merah, karena letaknya berpindah tiap
   * tahun dan sumbernya tabel, bukan rumus.
   */
  hariLibur?: boolean;
}): DaftarPengingat {
  const berket = new Set<string>(STATUS_BERKETERANGAN);
  const jamPulangWajib = JADWAL_KERJA_DEFAULT.jamPulangWajibMenit[indeksHari] ?? null;
  const istirahat = ISTIRAHAT_MENIT[indeksHari] ?? 0;

  // TIDAK ADA KEWAJIBAN TAP HARI INI - dan ini yang menentukan apakah nama
  // seseorang boleh disebut sama sekali.
  //
  // `jamPulangWajib === null` berarti Sabtu/Minggu menurut Pasal 9 ayat (2);
  // `hariLibur` berarti tanggal merah atau cuti bersama. Di kedua hari itu
  // pegawai yang tidak punya ketukan bukan sedang lalai - dia memang libur.
  //
  // KENAPA INI PENTING SAMPAI PERLU DITULIS PANJANG: e-Presensi baru membuat
  // baris ketika seseorang tap, jadi pada hari Sabtu SELURUH unit tidak punya
  // baris. Tanpa penjagaan ini pesan checkin hari Sabtu akan menyebut nama
  // semua orang di grup unit sebagai "belum melakukan jam checkin".
  const tidakAdaKewajiban = hariLibur === true || jamPulangWajib === null;

  const belumCheckin: string[] = [];
  const belumCheckout: BarisBelumCheckout[] = [];
  let berketerangan = 0;
  let sudahCheckin = 0;

  for (const p of roster) {
    const k = perNip.get(p.nip);

    if (k && k.status !== null && berket.has(k.status.trim())) {
      berketerangan++;
      continue;
    }

    if (!k || k.jamMasukMenit === null) {
      if (tidakAdaKewajiban) continue;
      belumCheckin.push(p.nama);
      continue;
    }

    sudahCheckin++;
    if (k.jamKeluarMenit === null) {
      // Sama seperti checkin: tanpa kewajiban hari itu, tidak ada yang bisa
      // ditagih. `jamPulangWajib` dipastikan bukan null oleh penjagaan ini.
      if (tidakAdaKewajiban || jamPulangWajib === null) continue;
      // Rumus yang SAMA dipakai mesin yang membayar - diadu ke 1.099 dari
      // 1.133 baris berkas hitung petugas (Biro Keuangan, Juli 2026).
      const bolehPulangMenit = batasCheckoutMenit(k.jamMasukMenit, jamPulangWajib, istirahat);
      if (sekarangMenit !== undefined && bolehPulangMenit > sekarangMenit) continue;
      belumCheckout.push({ nama: p.nama, bolehPulang: jamTeksDariMenit(bolehPulangMenit) });
    }
  }

  return {
    belumCheckin,
    belumCheckout,
    berketerangan,
    totalAktif: roster.length,
    sudahCheckin,
  };
}

/** Daftar berbintang, dipotong di `BATAS_NAMA_PER_PESAN` dengan sisanya disebut. */
function daftarBerbintang(baris: string[]): string[] {
  if (baris.length <= BATAS_NAMA_PER_PESAN) return baris.map((b) => `• ${b}`);
  const tampil = baris.slice(0, BATAS_NAMA_PER_PESAN).map((b) => `• ${b}`);
  tampil.push(`_...dan ${baris.length - BATAS_NAMA_PER_PESAN} pegawai lainnya_`);
  return tampil;
}

const KEPALA = "🔔 *PENGINGAT ABSEN HARIAN*";
const FOOTER = "*Gajihub — Pastikan presensi Anda tercatat dengan benar.*";

/**
 * Kalimat penutup - WAJIB IKUT di kedua pesan, dan bukan sopan-sopanan.
 *
 * Tanpa kalimat ini, daftar nama di grup adalah TUDUHAN: orang yang sedang cuti
 * resmi tapi cutinya belum masuk e-Presensi akan terbaca sebagai membolos di
 * depan seluruh unitnya. Ada test yang menahannya supaya tidak pernah hilang.
 */
const PENUTUP = "Jika sedang *cuti, dinas, atau diklat*, silakan abaikan pesan ini.";

/** null = tidak ada yang perlu diingatkan, jadi TIDAK ADA pesan yang dikirim. */
export function pesanCheckin({
  tanggalTeks,
  batasJam,
  d,
}: {
  /** Sudah diformat, mis. "Selasa, 29 September 2026". */
  tanggalTeks: string;
  /** Batas tap masuk, mis. "08:30". */
  batasJam: string;
  d: DaftarPengingat;
}): string | null {
  // Pesan berisi daftar kosong lebih buruk daripada tidak ada pesan: ia
  // mengajari orang mengabaikan pengingat ini.
  if (d.belumCheckin.length === 0) return null;

  return [
    KEPALA,
    `*Gajihub • ${tanggalTeks}*`,
    "",
    "👤 *Belum melakukan Check-in:*",
    ...daftarBerbintang(d.belumCheckin),
    "",
    `⏰ *Batas Check-in: ${batasJam} WIB*`,
    "",
    PENUTUP,
    "",
    FOOTER,
  ].join("\n");
}

/** null = semua sudah tap pulang, jadi TIDAK ADA pesan yang dikirim. */
export function pesanCheckout({
  tanggalTeks,
  d,
}: {
  tanggalTeks: string;
  d: DaftarPengingat;
}): string | null {
  if (d.belumCheckout.length === 0) return null;

  return [
    KEPALA,
    `*Gajihub • ${tanggalTeks}*`,
    "",
    "👤 *Belum melakukan Check-out:*",
    ...daftarBerbintang(d.belumCheckout.map((b) => `${b.nama} — *${b.bolehPulang} WIB*`)),
    "",
    "🕐 *Jam boleh pulang* tercantum di samping nama masing-masing.",
    "",
    PENUTUP,
    "",
    FOOTER,
  ].join("\n");
}
