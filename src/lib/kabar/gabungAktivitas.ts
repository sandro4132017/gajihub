import { kunciHariJakarta, ZONA_KABAR } from "./tampilKabar";
import { labelPeriode } from "./kalimatAudit";
import type { JenisAktivitas, PeriodeAktivitas } from "./kalimatAudit";

/**
 * Menggabungkan baris aktivitas yang bersebelahan menjadi satu kegiatan.
 * MURNI. Tanpa penggabungan, mencentang tiga tabel rekap atau job sinkron yang
 * menulis ratusan baris audit membanjiri panel dan menenggelamkan kejadian
 * penting seperti kirim/kembalikan rekap.
 */

export interface BarisAktivitasMentah {
  id: string;
  entitas: string;
  teks: string;
  jenis: JenisAktivitas;
  kunciGabung: string;
  aktor: string;
  satuanKerja: string | null;
  waktu: Date;
  href: string | null;
  periode?: PeriodeAktivitas;
  jenisTabel?: string;
}

export interface GrupAktivitas {
  /** id baris TERBARU di grup. */
  id: string;
  teks: string;
  jenis: JenisAktivitas;
  jumlah: number;
  /** Waktu baris terbaru. */
  waktu: Date;
  waktuAwal: Date;
  aktor: string;
  satuanKerja: string | null;
  href: string | null;
  /** id baris TERTUA di grup - dasar kursor halaman berikutnya. */
  idTertua: string;
}

export interface OpsiGabung {
  jarakMaksMenit?: number;
  zona?: string;
}

interface Kerja {
  grup: GrupAktivitas;
  baris: BarisAktivitasMentah;
  tabel: Set<string>;
}

function kunciHari(d: Date, zona: string): string {
  if (zona === ZONA_KABAR) return kunciHariJakarta(d);
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(d);
}

function teksGrup(k: Kerja): string {
  const { grup, baris } = k;
  if (grup.jumlah <= 1) return baris.teks;
  if (baris.entitas === "verifikasi_tabel_unit") {
    const lp = labelPeriode(baris.periode);
    const n = Math.max(1, k.tabel.size);
    return `Memeriksa ${n} tabel rekap${lp ? ` ${lp}` : ""} · ${grup.jumlah} kali ubah centang`;
  }
  return `${baris.teks} · ${grup.jumlah} kali`;
}

/**
 * `baris` harus terurut dari TERBARU ke tertua. Dua baris digabung bila aktor,
 * entitas, kunci objek, dan satuan kerja sama, berdampingan, berjarak
 * <= jarakMaksMenit, dan jatuh di hari yang sama. Pengiriman/pengembalian
 * rekap tidak pernah digabung: tiap kejadiannya bermakna sendiri-sendiri.
 */
export function gabungBerurutan(
  baris: readonly BarisAktivitasMentah[],
  opsi: OpsiGabung = {}
): GrupAktivitas[] {
  const jarakMs = (opsi.jarakMaksMenit ?? 15) * 60_000;
  const zona = opsi.zona ?? ZONA_KABAR;
  const hasil: Kerja[] = [];

  for (const b of baris) {
    const akhir = hasil[hasil.length - 1];
    const bisaGabung =
      akhir !== undefined &&
      b.entitas !== "PengirimanUnit" &&
      akhir.baris.entitas === b.entitas &&
      akhir.baris.aktor === b.aktor &&
      akhir.baris.kunciGabung === b.kunciGabung &&
      akhir.baris.satuanKerja === b.satuanKerja &&
      Math.abs(akhir.grup.waktuAwal.getTime() - b.waktu.getTime()) <= jarakMs &&
      kunciHari(akhir.grup.waktuAwal, zona) === kunciHari(b.waktu, zona);

    if (bisaGabung && akhir) {
      akhir.grup.jumlah += 1;
      akhir.grup.waktuAwal = b.waktu;
      akhir.grup.idTertua = b.id;
      if (b.jenisTabel) akhir.tabel.add(b.jenisTabel);
      continue;
    }
    hasil.push({
      baris: b,
      tabel: new Set(b.jenisTabel ? [b.jenisTabel] : []),
      grup: {
        id: b.id,
        teks: b.teks,
        jenis: b.jenis,
        jumlah: 1,
        waktu: b.waktu,
        waktuAwal: b.waktu,
        aktor: b.aktor,
        satuanKerja: b.satuanKerja,
        href: b.href,
        idTertua: b.id,
      },
    });
  }

  return hasil.map((k) => ({ ...k.grup, teks: teksGrup(k) }));
}

export interface KursorAktivitas {
  waktu: Date;
  id: string;
}

/**
 * Batas halaman tidak boleh memotong satu kegiatan menjadi dua. Bila batch
 * baris penuh, grup TERAKHIR mungkin masih berlanjut di batch berikutnya, jadi
 * dibuang dan akan terbaca utuh di halaman depan. Batch yang hanya berisi satu
 * grup tetap dipertahankan supaya kursor selalu maju.
 */
export function potongBatasHalaman(
  grup: readonly GrupAktivitas[],
  batchPenuh: boolean
): { grup: GrupAktivitas[]; kursorBerikut: KursorAktivitas | null } {
  if (!batchPenuh) return { grup: [...grup], kursorBerikut: null };
  const dipakai = grup.length > 1 ? grup.slice(0, -1) : [...grup];
  const tertua = dipakai[dipakai.length - 1];
  if (!tertua) return { grup: [], kursorBerikut: null };
  return { grup: dipakai, kursorBerikut: { waktu: tertua.waktuAwal, id: tertua.idTertua } };
}

export interface KirimanTerkirim {
  satuanKerja: string;
  bulan: number;
  tahun: number;
  dikirimPada: Date;
}

export interface EksporAdk {
  /** `tukin-9-2026`, `uang-makan-9-2026` (bulan tanpa nol depan). */
  entitasId: string;
  /** dataSesudah.satuanKerja: "semua unit terkirim" atau persis nama unit. */
  satuanKerja: string | null;
  timestamp: Date;
}

export const SEMUA_UNIT_TERKIRIM = "semua unit terkirim";

export interface RekapMenunggu {
  bulan: number;
  tahun: number;
  jumlahUnit: number;
}

/**
 * Jenis ADK yang dianggap "memproses" rekap. Uang Lembur tidak termasuk:
 * pembayarannya ditunda sampai tata cara turun.
 * TODO(confirm): definisi "diproses" (unduh ADK Tukin/Uang Makan) belum
 * dikonfirmasi ke PPABP.
 */
const JENIS_EKSPOR_PEMROSES = ["tukin-", "uang-makan-"] as const;

/**
 * Rekap TERKIRIM yang belum diproses PPABP: belum ada unduhan ADK Tukin atau
 * Uang Makan periode itu setelah rekap dikirim yang mencakup unitnya.
 */
export function rekapMenungguProses(
  kiriman: readonly KirimanTerkirim[],
  ekspor: readonly EksporAdk[]
): RekapMenunggu[] {
  const peta = new Map<string, RekapMenunggu>();
  for (const k of kiriman) {
    const akhiran = `-${k.bulan}-${k.tahun}`;
    const sudah = ekspor.some(
      (e) =>
        JENIS_EKSPOR_PEMROSES.some((awalan) => e.entitasId.startsWith(awalan)) &&
        e.entitasId.endsWith(akhiran) &&
        e.timestamp.getTime() > k.dikirimPada.getTime() &&
        (e.satuanKerja === SEMUA_UNIT_TERKIRIM || e.satuanKerja === k.satuanKerja)
    );
    if (sudah) continue;
    const kunci = `${k.tahun}-${k.bulan}`;
    const ada = peta.get(kunci);
    if (ada) ada.jumlahUnit += 1;
    else peta.set(kunci, { bulan: k.bulan, tahun: k.tahun, jumlahUnit: 1 });
  }
  return [...peta.values()].sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);
}
