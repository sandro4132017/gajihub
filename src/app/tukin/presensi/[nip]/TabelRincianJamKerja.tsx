import type { ReactNode } from "react";
import { jamDariMenit, type BarisRincianJamKerja } from "../../../../business-logic/rincianJamKerjaHarian";
import { lemburTeks } from "../../../presensiTampilan";

/**
 * Tabel rincian JAM KERJA harian - bentuk yang selama ini direkap petugas di
 * "Jam Absensi.xlsx". Menjawab pertanyaan yang berbeda dari tabel presensi
 * biasa: bukan "apa yang dilanggar", tapi "jam kerja hari itu terpenuhi atau
 * tidak".
 *
 * Angkanya disusun `rincianJamKerjaHarian.ts` (PURE) - komponen ini cuma
 * memformat. Rumusnya dibongkar dari berkas asli petugas, lihat kepala modul
 * itu untuk angka kecocokannya.
 */

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export interface BarisTabelRincianJamKerja {
  tanggal: Date;
  statusLabel: string;
  rincian: BarisRincianJamKerja;
  /** Pecahan dari bobot kehadiran (0,0099 = 0,99%). */
  potonganPersen: number;
  /** Kejadian Pasal 13 ayat (2) hari itu - ikut menyusun % potongan. */
  kejadianTidakPresensi: number;
  /**
   * Jam lembur yang TEREKAM hari itu (desimal, dari PresensiHarian.jamLembur).
   *
   * Sengaja berdampingan dengan kolom kekurangan jam kerja: keduanya mengukur
   * hal yang berlawanan pada hari yang sama, dan di berkas petugas keduanya
   * tidak pernah berada di satu halaman - jadi tidak ada yang pernah melihat
   * bahwa seseorang bisa kurang jam kerja DAN tercatat lembur di hari itu juga.
   */
  jamLembur: number;
  keteranganLibur: string | null;
  dikoreksiManual: boolean;
  /**
   * Kolom mana yang jamnya berasal dari koreksi manual, bukan dari e-Presensi.
   * Dipisah per kolom karena koreksi boleh menyentuh salah satunya saja.
   *
   * Tabel ini memang SUDAH memajang jam hasil koreksi (halamannya menyuapkan
   * jam efektif), jadi tanpa penanda ini tidak ada apa pun di layar yang
   * membedakan angka hasil ketukan mesin dari angka yang diketik orang.
   */
  masukDikoreksi: boolean;
  keluarDikoreksi: boolean;
}

/**
 * "-" untuk sel yang memang tidak punya angka - jangan pernah tulis 0.
 *
 * Jam yang melewati tengah malam (mis. tap masuk 23:26 + 8,5 jam) ditulis
 * sebagai jam hari berikutnya + penanda "+1", bukan "32:26". Berkas petugas
 * membungkusnya diam-diam jadi "08:26" karena Excel menyimpannya sebagai
 * pecahan hari - terbaca seperti pagi hari yang sama, dan itu menyesatkan.
 */
function jam(menit: number | null) {
  if (menit === null) return <span className="text-muted">-</span>;
  const lewatTengahMalam = menit >= 24 * 60;
  return (
    <span className="whitespace-nowrap font-mono">
      {jamDariMenit(menit % (24 * 60))}
      {lewatTengahMalam && <span className="ml-0.5 text-[11px] text-red">+1</span>}
    </span>
  );
}

/**
 * Membungkus jam yang berasal dari koreksi manual supaya beda dari jam yang
 * datang sendiri dari mesin absensi.
 *
 * Emas, sama dengan chip "dikoreksi" di kolom status dan sel jam di tabel
 * presensi - satu arti, satu warna, di semua tempat yang memajang hari ini.
 */
function JamKoreksi({ teks, dikoreksi }: { teks: ReactNode; dikoreksi: boolean }) {
  if (!dikoreksi) return <>{teks}</>;
  return (
    <span
      className="rounded bg-gold-tint px-1 font-semibold text-gold-deep"
      title="Jam ini diketik manual oleh petugas absensi, bukan ketukan e-Presensi. Alasannya ada di tabel presensi (tampilan bawaan)."
    >
      {teks}
    </span>
  );
}

function menitTeks(n: number | null, tandaiKalauAda = false) {
  if (n === null) return <span className="text-muted">-</span>;
  if (n === 0) return <span className="text-muted">0</span>;
  return <span className={`font-mono ${tandaiKalauAda ? "text-red" : ""}`}>{n}</span>;
}

export function TabelRincianJamKerja({ baris }: { baris: BarisTabelRincianJamKerja[] }) {
  // Batas kolom antar kelompok: fakta presensi | jam acuan | hasil hitungan.
  const pisah = "border-l border-line";

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5">Tanggal</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Jam masuk</th>
            <th className={`px-3 py-2.5 ${pisah}`}>Jam harus pulang</th>
            <th className="px-3 py-2.5">Jam pulang</th>
            <th className="px-3 py-2.5">Lembur</th>
            <th className={`px-3 py-2.5 ${pisah}`}>Terlambat</th>
            {/* "Menit kerja", BUKAN "Jam kerja" - isinya menit (450 = 7,5 jam)
                dan bisa melebihi 450. Judul berbunyi jam di atas angka 450
                akan terbaca 450 jam. */}
            <th className="px-3 py-2.5">Menit kerja</th>
            <th className="px-3 py-2.5">Kekurangan</th>
            <th className="px-3 py-2.5">Menit kekurangan</th>
            <th className="px-3 py-2.5">% Potongan</th>
          </tr>
        </thead>
        <tbody>
          {baris.length === 0 && (
            <tr>
              <td colSpan={11} className="px-3 py-6 text-center text-muted">
                Periode ini belum dilakukan sinkronisasi.
              </td>
            </tr>
          )}
          {baris.map((b) => {
            const r = b.rincian;
            const hariKe = b.tanggal.getUTCDay();
            return (
              <tr key={r.tanggalIso} className={`border-b border-line-2 ${r.hariLibur ? "bg-surface-2" : ""}`}>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-semibold text-ink">
                    {String(b.tanggal.getUTCDate()).padStart(2, "0")}/
                    {String(b.tanggal.getUTCMonth() + 1).padStart(2, "0")}
                  </span>
                  <span className="ml-1.5 text-xs text-muted">{NAMA_HARI[hariKe]}</span>
                  {b.keteranganLibur && (
                    <span className="ml-1.5 rounded bg-red-tint px-1 text-[11px] text-ink-2">
                      {b.keteranganLibur}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-2 whitespace-nowrap">
                  {b.statusLabel}
                  {b.dikoreksiManual && (
                    <span className="ml-1.5 rounded bg-gold-tint px-1 text-[11px] text-ink-2">dikoreksi</span>
                  )}
                </td>
                <td className="px-3 py-2 text-ink-2">
                  <JamKoreksi teks={jam(r.jamMasukMenit)} dikoreksi={b.masukDikoreksi} />
                </td>
                {/* batasLemburMenit - kewajiban 7,5 jam yang UTUH, dan sejak
                    2026-09-21 juga titik mulai jam lembur. Yang datang 09:10
                    berbunyi 17:40, bukan 17:00.

                    BUKAN jamHarusPulangMenit: yang itu belum kena lantai jam
                    pulang wajib, jadi bagi yang tap 06:00 ia berbunyi 14:30 -
                    jam yang tidak berlaku bagi siapa pun.

                    BUKAN pula batasCheckoutMenit: yang itu ber-batas atas
                    17:00 / Jumat 17:30 karena tugasnya menghitung POTONGAN,
                    dan batas atas itu yang menjaga menit keterlambatan tidak
                    ditagih dua kali. Di kolom ini yang dijawab "kapan
                    kewajiban hari ini selesai", bukan "berapa yang dipotong".

                    Null (hari libur / tap tidak wajar) jadi "-" sendirinya. */}
                <td className={`px-3 py-2 text-ink-2 ${pisah}`}>{jam(r.batasLemburMenit)}</td>
                <td className="px-3 py-2 text-ink-2">
                  <JamKoreksi teks={jam(r.jamKeluarMenit)} dikoreksi={b.keluarDikoreksi} />
                </td>
                {/* Lembur DI LUAR blok "tap tidak wajar" di bawah: ketukan yang
                    tidak dipercaya membatalkan jam turunan, tapi lembur datang
                    dari baris Lembur tersendiri di e-Presensi, bukan dari
                    ketukan itu. Mengosongkannya berarti menghapus jam yang
                    benar-benar tercatat. */}
                <td className="px-3 py-2 text-xs">
                  {b.jamLembur > 0 ? (
                    <span className="font-mono text-ink">{lemburTeks(b.jamLembur)}</span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
                {/* Ketukan yang tidak dipercaya mesin yang membayar: EMPAT
                    kolom turunannya diganti satu keterangan. Yang perlu
                    diketahui pembaca cuma bahwa angkanya tidak bisa dihitung,
                    dan apa yang ditagih sebagai gantinya. Kolom % Potongan
                    TETAP tampil: itu angka tersimpan, yang benar-benar
                    dipotong. */}
                {r.tapTidakWajar ? (
                  <td className={`px-3 py-2 ${pisah}`} colSpan={4}>
                    <span
                      className="rounded bg-gold-tint px-1.5 py-0.5 text-[11px] font-semibold text-gold-deep"
                      title="Jam masuk/pulang di baris ini tidak mungkin - mustahil sebagai kedatangan, mustahil sebagai kepulangan, atau satu ketukan tersalin ke dua kolom. Terlambat & pulang cepat TIDAK ditagih per menit; hari ini dihitung 1 kejadian tidak melakukan presensi (Pasal 13 ayat (2))."
                    >
                      Tap tidak wajar
                    </span>
                    <span className="ml-2 text-[11px] text-muted">
                      ditagih 1 kejadian Pasal 13 ayat (2), bukan per menit
                    </span>
                  </td>
                ) : (
                  <>
                    <td className={`px-3 py-2 ${pisah}`}>{menitTeks(r.hariLibur ? null : r.menitTerlambat, true)}</td>
                    <td className="px-3 py-2">{menitTeks(r.menitKerja)}</td>
                    <td className="px-3 py-2">{menitTeks(r.kekuranganJamKerjaMenit, true)}</td>
                    <td className="px-3 py-2">{menitTeks(r.totalMenitKekuranganHarian, true)}</td>
                  </>
                )}
                <td className="px-3 py-2">
                  {b.potonganPersen > 0 ? (
                    <span className="font-mono text-red">
                      {(b.potonganPersen * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%
                    </span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
