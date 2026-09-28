import Link from "next/link";
import { BantuanTabel, BarisSumber } from "./BantuanTabel";
import type { JSX } from "react";

/**
 * DAFTAR PERUBAHAN DATA KEPEGAWAIAN - tabel yang ditagih centangnya sebelum
 * rekap unit boleh dikirim ke PPABP.
 *
 * Polanya diambil dari "Daftar Perubahan Pegawai" milik Kemenkeu (sharing
 * session BOT Gaji & Tukin, 23 September 2026): di sana perubahan data
 * kepegawaian bukan sekadar disinkronkan, melainkan jadi daftar tersendiri
 * yang DIUJI dan DISAHKAN berbarengan dengan daftar pembayarannya.
 *
 * Yang dijawab tabel ini dan tidak bisa dijawab AuditTrail: "siapa di UNIT
 * SAYA yang datanya berubah sejak saya menghitung periode ini". Jejak audit
 * menyimpan satu baris berisi seluruh kementerian - benar sebagai riwayat,
 * tidak terpakai sebagai daftar periksa.
 */

export type JenisPerubahan =
  | "PEGAWAI_BARU"
  | "PINDAH_UNIT"
  | "GANTI_STATUS"
  | "KELAS_JABATAN"
  | "JABATAN";

export interface BarisPerubahanPegawai {
  id: string;
  nip: string;
  nama: string;
  jenis: string;
  dari: string | null;
  ke: string | null;
  terdeteksiPada: Date;
  /** Unit ini DITINGGALKAN oleh orang tersebut (dia pindah keluar). */
  keluarDariUnit: boolean;
  /**
   * Perubahan terjadi SESUDAH kalkulasi periode ini dibekukan - artinya angka
   * yang tersimpan dihitung memakai data yang sudah tidak berlaku.
   */
  sesudahHitung: boolean;
}

const LABEL: Record<JenisPerubahan, string> = {
  PEGAWAI_BARU: "Pegawai baru",
  PINDAH_UNIT: "Pindah unit",
  GANTI_STATUS: "Ganti status",
  KELAS_JABATAN: "Kelas jabatan",
  JABATAN: "Jabatan",
};

/**
 * Jenis yang MENGGESER RUPIAH kalau dibiarkan.
 *
 * Kelas jabatan menentukan seluruh tarif tukin pokok, dan perpindahan unit
 * memindahkan seluruh riwayat pembayaran orang itu ke unit lain - keduanya
 * mengubah pembayaran tanpa satu pun kolom lain ikut berubah. Jabatan dan
 * status kepegawaian penting untuk diketahui, tapi tidak dengan sendirinya
 * mengubah angka.
 */
const BERDAMPAK_RUPIAH = new Set<string>(["KELAS_JABATAN", "PINDAH_UNIT", "PEGAWAI_BARU"]);

function tanggalTeks(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function TabelPerubahanPegawai({
  baris,
  periodeBulan,
  periodeTahun,
  namaBulan,
}: {
  baris: readonly BarisPerubahanPegawai[];
  periodeBulan: number;
  periodeTahun: number;
  namaBulan: string;
}): JSX.Element {
  const perluHitungUlang = baris.filter((b) => b.sesudahHitung && BERDAMPAK_RUPIAH.has(b.jenis));

  return (
    <section id="perubahan-pegawai" className="mt-8 scroll-mt-4">
      {/* Keterangan tabel TIDAK LAGI berupa paragraf di bawah judul - pindah
          ke ikon "i", mengikuti Rincian Tukin (permintaan user 2026-09-28).
          Ikonnya di SAMPING heading, bukan di dalamnya: `<details>` itu flow
          content dan heading cuma boleh memuat phrasing content. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h2 className="text-base font-bold text-ink">Daftar Perubahan Data Pegawai</h2>
          <BantuanTabel
            judul="Sumber Data & Acuan"
            label="Sumber data dan acuan tabel Daftar Perubahan Data Pegawai"
          >
            <dl>
              <BarisSumber label="Sumber">
                <strong>SIAP</strong> (dibaca baca-saja). Perubahan terdeteksi dengan membandingkan
                isi SIAP terhadap data Gajihub tiap kali sinkronisasi pegawai dijalankan.
              </BarisSumber>
              <BarisSumber label="Acuan">
                <strong>SK kepegawaian.</strong> Yang mengesahkan perubahan adalah SK-nya, bukan
                baris di tabel ini - cocokkan ke SK sebelum dicentang.
              </BarisSumber>
            </dl>

            <p className="mt-3 text-xs font-bold text-ink">Yang menggeser rupiah</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              <strong>Kelas jabatan</strong> menentukan seluruh tarif Tukin pokok, dan{" "}
              <strong>pindah unit</strong> memindahkan riwayat pembayaran orang itu ke unit baru -
              termasuk periode yang sudah dikirim. Keduanya ditandai warna emas.
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              <strong>Ganti status</strong> dan <strong>jabatan</strong> perlu diketahui, tapi tidak
              dengan sendirinya mengubah angka periode yang sudah lewat.
            </p>

            <p className="mt-2.5 text-xs font-bold text-ink">Tanda &ldquo;setelah dihitung&rdquo;</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Perubahan itu masuk SESUDAH kalkulasi periode ini dibekukan - artinya angka yang
              tersimpan dihitung dari data yang sudah tidak berlaku. Tekan{" "}
              <strong>Hitung sekarang</strong> sebelum mengirim.
            </p>
          </BantuanTabel>
        </div>
        <span className="text-xs text-muted">
          {baris.length} perubahan sejak awal {namaBulan} {periodeTahun}
        </span>
      </div>

      {perluHitungUlang.length > 0 && (
        // DI ATAS tabel, bukan sebagai kolom. Yang membaca sedang memutuskan
        // mengirim atau tidak, dan perubahan yang datang SESUDAH angkanya
        // dibekukan berarti angka itu dihitung dari data yang sudah usang.
        <div className="card mt-2 border-l-4 border-l-gold p-3">
          <p className="text-sm font-bold text-ink">
            {perluHitungUlang.length} perubahan terjadi setelah periode ini dihitung
          </p>
          <p className="mt-1 text-xs text-muted">
            Kelas jabatan dan satuan kerja adalah bahan perhitungan tukin. Angka yang tersimpan
            sekarang dihitung dari data lama - tekan Hitung sekarang sebelum mengirim.
          </p>
        </div>
      )}

      <div className="card mt-2 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama px-4 py-2.5">Nama</th>
                <th className="px-4 py-2.5">Perubahan</th>
                <th className="px-4 py-2.5">Dari</th>
                <th className="px-4 py-2.5">Menjadi</th>
                <th className="px-4 py-2.5">Terdeteksi</th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    {/* Kosong disebut apa adanya sebagai HASIL, bukan sebagai
                        tabel yang gagal terisi - tidak ada perubahan memang
                        keadaan yang paling lazim, dan itu tetap harus
                        dicentang orang. */}
                    Tidak ada perubahan data kepegawaian pada periode ini.
                  </td>
                </tr>
              )}
              {baris.map((b) => {
                const jenis = LABEL[b.jenis as JenisPerubahan] ?? b.jenis;
                return (
                  <tr key={b.id} className="border-b border-line-2">
                    <td className="col-nama px-4 py-2.5">
                      <Link
                        href={`/tukin/presensi/${b.nip}?bulan=${periodeBulan}&tahun=${periodeTahun}`}
                        className="font-semibold text-ink underline decoration-line-2 underline-offset-2"
                      >
                        {b.nama}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{b.nip}</span>
                      {b.keluarDariUnit && (
                        // Orang yang PINDAH KELUAR tetap muncul di daftar unit
                        // lamanya, dan harus ditandai: dia tidak lagi ada di
                        // roster, jadi tanpa penanda ini barisnya terbaca
                        // seperti kesalahan data.
                        <span className="mt-1 inline-block rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
                          keluar dari unit ini
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                          BERDAMPAK_RUPIAH.has(b.jenis)
                            ? "bg-gold-tint text-gold-deep"
                            : "bg-surface-2 text-ink-2"
                        }`}
                      >
                        {jenis}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-2">{b.dari ?? "-"}</td>
                    <td className="px-4 py-2.5 font-semibold text-ink">{b.ke ?? "-"}</td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {tanggalTeks(b.terdeteksiPada)}
                      {b.sesudahHitung && (
                        <span className="mt-1 block whitespace-normal rounded bg-gold-tint px-1.5 py-0.5 text-[11px] font-medium text-gold-deep">
                          setelah dihitung
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
