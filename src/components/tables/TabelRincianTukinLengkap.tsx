import Link from "next/link";
import type { ReactNode } from "react";
import type { RekapPresensiPeriode } from "@prisma/client";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../business-logic/tarifTukinPokok";
import { TARIF_POTONGAN_PASAL_13 } from "../../business-logic/tukin";
import { rincianTukinTersimpan, type BarisTukinTersimpan } from "../../business-logic/rincianTukinTersimpan";
import { selCuti, jenisKepegawaian } from "../../business-logic/rekapUnitExcel";
import { LABEL_PREDIKAT } from "../../app/tukin/predikat-kinerja/predikat";
import { BadgePejabatEselon } from "../shared/BadgePejabatEselon";

// ============================================================================
// TABEL RINCIAN TUKIN LENGKAP - gaya rekap Excel Biro Keuangan, satu baris per
// pegawai, 38 kolom (identitas, rekap presensi, 12 kolom cuti Pasal 14, hasil
// kalkulasi).
//
// Dipakai DUA halaman dengan isi yang sama: Kalkulasi Unit (Kasubag TU,
// ?rincian=1) dan Dashboard Tukin (PPABP/Admin, ?rincian=1). Satu komponen
// supaya kedua tabel tidak pernah bercerita beda tentang angka yang sama.
//
// Komponen ini TIDAK menyaring hak akses - pemanggilnya yang menentukan baris
// mana yang boleh tampil (PPABP: hanya unit yang sudah mengirim rekap).
// ============================================================================

export interface BarisRincianTukinLengkap {
  id: string;
  nip: string;
  nama: string;
  golongan: string | null;
  /** Kelas jabatan yang dipakai untuk tarif - pemanggil yang menentukan. */
  kelasJabatan: number | null;
  tukin: BarisTukinTersimpan | null;
  rekap: RekapPresensiPeriode | null;
  predikat: { predikat: string; hasilKerja: string | null; perilakuKerja: string | null } | null;
  /** Sebab angka perlu dihitung ulang (Kasubag TU); null/undefined = tidak basi. */
  basi?: string | null;
}

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

const formatPersen = (nilai: number, desimal = 3) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: desimal }).format(nilai) + "%";

/** Uraian potongan Pasal 13 dari rekap presensi - isi tooltip kolom "% Pot". */
function uraianPotongan(rekap: {
  totalMenitTerlambat: number;
  totalMenitPulangCepat: number;
  totalMenitMeninggalkanKantor: number;
  jumlahTidakPresensi: number;
  jumlahHariAlpha: number;
  jumlahTidakIkutUpacara: number;
}): string {
  const t = TARIF_POTONGAN_PASAL_13;
  const persen = (v: number) => formatPersen(v * 100, 2);
  // Tiga pelanggaran bertarif per menit di Pasal 13 ayat (3) - tidak lebih.
  const menit =
    rekap.totalMenitTerlambat + rekap.totalMenitPulangCepat + rekap.totalMenitMeninggalkanKantor;

  const bagian: string[] = [];
  if (menit > 0) bagian.push(`${menit} menit x 0,01% = ${persen(menit * t.perMenit)}`);
  if (rekap.jumlahTidakPresensi > 0)
    bagian.push(
      `${rekap.jumlahTidakPresensi} lupa absen x 1% = ${persen(rekap.jumlahTidakPresensi * t.perKejadianTidakPresensi)}`
    );
  if (rekap.jumlahHariAlpha > 0)
    bagian.push(`${rekap.jumlahHariAlpha} hari alpha x 3% = ${persen(rekap.jumlahHariAlpha * t.perHariAlpha)}`);
  if (rekap.jumlahTidakIkutUpacara > 0)
    bagian.push(
      `${rekap.jumlahTidakIkutUpacara}x tidak upacara x 3% = ${persen(rekap.jumlahTidakIkutUpacara * t.perKejadianTidakUpacara)}`
    );

  if (bagian.length === 0) return "Tidak ada pelanggaran Pasal 13 pada rekap presensi periode ini.";
  return `Dari rekap presensi saat ini: ${bagian.join("  +  ")}`;
}

function BelumAda({ judul }: { judul: string }) {
  return (
    <span className="text-muted/60" title={judul}>
      -
    </span>
  );
}

// Tanpa text-left/align-bottom: perataan tengah-menengah datang dari aturan
// tabel di globals.css. Utility di sini akan MENIMPA aturan itu.
const th = "whitespace-nowrap px-3 py-2";
const td = "whitespace-nowrap px-3 py-2 font-mono text-ink-2";

export function TabelRincianTukinLengkap({
  baris,
  nomorAwal = 1,
  hrefNama,
  kaki,
}: {
  baris: BarisRincianTukinLengkap[];
  /** Nomor urut baris pertama (paginasi). */
  nomorAwal?: number;
  /** Tautan nama pegawai - ke rincian presensi hariannya. */
  hrefNama: (b: BarisRincianTukinLengkap) => string;
  /** Isi di bawah tabel, mis. paginasi. */
  kaki?: ReactNode;
}) {
  return (
      <div className="card mt-2 overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-[11px] font-bold uppercase tracking-wide text-muted">
              <th className={th}>No.</th>
              <th className={`col-nama kolom-beku ${th}`}>Nama Pegawai</th>
              <th className={th}>NIP</th>
              <th className={th}>GOL</th>
              <th className={th}>Kelas Jabatan</th>
              <th className={th}>Nominal Tukin</th>
              <th className={th}>Status</th>
              <th className={th}>Hari Kerja</th>
              <th className={th}>Hari WFO</th>
              <th className={th}>Hari WFH/WFA</th>
              <th className={th}>Terlambat (Menit)</th>
              <th className={th}>Lupa Absen</th>
              <th className={th}>Alpa</th>
              <th className={th}>Dinas Luar</th>
              <th className={th}>CT Gugur Kandungan</th>
              <th className={th}>CT Gugur Kandungan &gt;1 Bulan</th>
              <th className={th}>Cuti Thn</th>
              <th className={th}>Cuti Melahirkan</th>
              <th className={th}>Cuti Sakit Bulan I</th>
              <th className={th}>Cuti Sakit Bulan II</th>
              <th className={th}>Cuti Sakit Bulan III</th>
              <th className={th}>Cuti Sakit &gt; 3 Bulan</th>
              <th className={th}>CT B/CT AP &lt; 1 Bln</th>
              <th className={th}>CT Bsr Bln I</th>
              <th className={th}>CT Besar Bln II</th>
              <th className={th}>CT Besar Bln III</th>
              <th className={th}>TB</th>
              <th className={th}>Diklat</th>
              <th className={th}>TDK UPC</th>
              <th className={th}>WFO + WFH</th>
              <th className={th}>% Pot</th>
              <th className={th}>Persentase Kehadiran (30%)</th>
              <th className={th}>Nominal Kehadiran</th>
              <th className={th}>Jumlah Potongan Kehadiran</th>
              <th className={th}>Hasil Kerja</th>
              <th className={th}>Perilaku Kerja</th>
              <th className={th}>Capaian Kinerja</th>
              <th className={th}>Persentase Kinerja (70%)</th>
              <th className={th}>Nominal Kinerja</th>
              <th className={th}>Dibayarkan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, i) => {
              const tukin = b.tukin;
              const rekap = b.rekap;
              const predikat = b.predikat;

              const tarifKelas =
                b.kelasJabatan !== null ? TUKIN_POKOK_PER_KELAS_JABATAN[b.kelasJabatan] ?? null : null;
              const rincian = tukin ? rincianTukinTersimpan(tukin, tarifKelas) : null;

              const persenPotongan =
                rincian && rincian.bobotKehadiranPenuh
                  ? ((rincian.potonganKehadiran ?? 0) / rincian.bobotKehadiranPenuh) * 100
                  : null;
              const persenKehadiran =
                rincian && tarifKelas ? (rincian.komponenKehadiran / tarifKelas) * 100 : null;
              const persenKinerja = rincian && tarifKelas ? (rincian.komponenKinerja / tarifKelas) * 100 : null;

              const jenis = jenisKepegawaian(b.golongan);
              const basi = b.basi ?? null;

              return (
                <tr key={b.id} className={`border-b border-line-2 ${basi ? "bg-gold-tint" : "bg-surface"}`}>
                  <td className={`${td} text-muted`}>{nomorAwal + i}</td>
                  <td className="col-nama kolom-beku whitespace-nowrap px-3 py-2">
                    <Link
                      href={hrefNama(b)}
                      className="font-semibold text-teal-deep underline"
                      title={`Lihat rincian presensi harian ${b.nama}`}
                    >
                      {b.nama}
                    </Link>
                    <BadgePejabatEselon kelasJabatan={b.kelasJabatan} />
                    {basi && (
                      <span
                        className="mt-0.5 block text-xs font-semibold text-amber-700 dark:text-amber-400"
                        title={`Data ${basi} berubah setelah Tukin ini dihitung - angkanya masih yang lama.`}
                      >
                        angka basi - {basi} berubah
                      </span>
                    )}
                  </td>
                  <td className={td}>{b.nip}</td>
                  <td className={td}>{b.golongan ?? <BelumAda judul="Golongan belum terisi di data pegawai" />}</td>
                  <td className={td}>
                    {b.kelasJabatan ?? <BelumAda judul="Kelas jabatan belum terisi di data pegawai" />}
                  </td>
                  <td className={td}>{tarifKelas !== null ? formatRupiah(tarifKelas) : <BelumAda judul="Tarif tidak diketahui karena kelas jabatan kosong" />}</td>
                  <td className={td}>{jenis ?? <BelumAda judul="Jenis kepegawaian tidak dapat diturunkan dari format golongan" />}</td>

                  {/* --- Rekap presensi periode ini --- */}
                  <td className={td}>{rekap ? rekap.jumlahHariKerja : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariWfo : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariWfhWfa : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.totalMenitTerlambat : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahTidakPresensi : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariAlpha : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariDinasLuar : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>

                  {/* --- Cuti (Pasal 14) ---
                      12 kolom gaya rekap Excel, diturunkan dari tiga kolom
                      yang benar-benar disimpan. Kalau rekap presensinya belum
                      ada sama sekali, ditandai "-" (data tidak ada); kalau
                      rekapnya ada tapi orangnya tidak cuti, dibiarkan kosong -
                      sama seperti sel kosong di Excel. */}
                  {["GUGUR_1", "GUGUR_2", "TAHUNAN", "MELAHIRKAN", "SAKIT_1", "SAKIT_2", "SAKIT_3", "SAKIT_4", "BESAR_AP_KURANG", "BESAR_1", "BESAR_2", "BESAR_3"].map((k) => (
                    <td key={k} className={td}>
                      {rekap ? selCuti(k, rekap) : <BelumAda judul="Rekap presensi periode ini belum ada" />}
                    </td>
                  ))}

                  <td className={td}>{rekap ? rekap.jumlahHariTugasBelajar : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahHariDiklat : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>{rekap ? rekap.jumlahTidakIkutUpacara : <BelumAda judul="Rekap presensi periode ini belum ada" />}</td>
                  <td className={td}>
                    {rekap ? (
                      rekap.jumlahHariWfo + rekap.jumlahHariWfhWfa
                    ) : (
                      <BelumAda judul="Rekap presensi periode ini belum ada" />
                    )}
                  </td>

                  {/* --- Hasil kalkulasi --- */}
                  <td className={`${td} ${rekap ? "cursor-help underline decoration-dotted" : ""}`} title={rekap ? uraianPotongan(rekap) : undefined}>
                    {persenPotongan !== null ? formatPersen(persenPotongan, 2) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                  </td>
                  <td className={td}>{persenKehadiran !== null ? formatPersen(persenKehadiran) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className={td}>{rincian ? formatRupiah(rincian.komponenKehadiran) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className={td}>
                    {rincian?.potonganKehadiran !== null && rincian?.potonganKehadiran !== undefined
                      ? formatRupiah(rincian.potonganKehadiran)
                      : <BelumAda judul="Butuh kelas jabatan untuk menghitung potongan dalam rupiah" />}
                  </td>

                  {/* Rating penyusun predikat, apa adanya dari file Rekap
                      Penilaian e-Kinerja BKN. Kosong untuk baris yang
                      predikatnya diketik manual - lihat actionsKelola.ts. */}
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {predikat?.hasilKerja ?? (
                      <BelumAda judul={predikat ? "Tidak ada di sumbernya (predikat diinput manual)" : "Predikat kinerja periode ini belum diupload"} />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {predikat?.perilakuKerja ?? (
                      <BelumAda judul={predikat ? "Tidak ada di sumbernya (predikat diinput manual)" : "Predikat kinerja periode ini belum diupload"} />
                    )}
                  </td>

                  <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                    {predikat ? (
                      // Ditulis seperti di rekap Excel ("Sangat Baik"), bukan
                      // nilai mentah enum-nya ("SANGAT_BAIK").
                      LABEL_PREDIKAT[predikat.predikat] ?? predikat.predikat
                    ) : (
                      <BelumAda judul="Predikat kinerja periode ini belum diupload" />
                    )}
                  </td>
                  <td className={td}>{persenKinerja !== null ? formatPersen(persenKinerja) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className={td}>{rincian ? formatRupiah(rincian.komponenKinerja) : <BelumAda judul="Tukin periode ini belum dihitung" />}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono font-semibold text-ink">
                    {tukin ? formatRupiah(tukin.tukinBersih) : <BelumAda judul="Tukin periode ini belum dihitung" />}
                    {rincian?.adaSelisih && (
                      <span
                        className="mt-1 block font-sans text-[11px] font-normal text-amber-700 dark:text-amber-400"
                        title={`Bruto tersimpan ${formatRupiah(rincian.tukinBruto)}, sedangkan kehadiran + kinerja = ${formatRupiah(
                          rincian.komponenKehadiran + rincian.komponenKinerja
                        )}.`}
                      >
                        cek override cuti / tugas belajar
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {kaki && <div className="border-t border-line-2 px-4 py-3 sm:px-6">{kaki}</div>}
      </div>
  );
}
