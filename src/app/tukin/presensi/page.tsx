import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import {
  canBukaHalamanPredikatKinerja,
  canKelolaKendalaEpresensi,
  canKelolaHariLibur,
  canUploadRekapPresensi,
  type AuthUser,
} from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";
import { SearchableSelect } from "../../SearchableSelect";
import { periodePunyaRekapPresensi, resolvePeriode } from "../../periodeDefault";
import { UploadPresensiForm } from "./UploadPresensiForm";
import { UploadPresensiPdfForm } from "./UploadPresensiPdfForm";
import { SinkronisasiPresensi } from "./SinkronisasiPresensi";
import { PencarianDebounce } from "../../PencarianDebounce";
import { Paginasi, hitungPaginasi } from "../../Paginasi";
import { BadgePejabatEselon } from "../../BadgePejabatEselon";
import { uraiJenisCuti, LABEL_JENIS_CUTI } from "../../../business-logic/jenisCuti";
import { SumberAcuan } from "../../SumberAcuan";

export const dynamic = "force-dynamic";

export default async function PresensiTukinPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; q?: string; satker?: string; hal?: string; per?: string }>;
}) {
  const { bulan, tahun, q, satker, hal, per } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola data presensi." />;
  }

  // Kasubag TU ikut boleh (unitnya sendiri) - cakupan per pegawai dicek ulang
  // di action rekonsiliasinya, jadi berkas lintas unit tetap tersaring.
  const bolehRekonsiliasi = canUploadRekapPresensi(authUser, authUser.satuanKerja ?? "");

  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  // Halaman ini isinya rekap presensi, jadi periode defaultnya diambil dari
  // periode yang benar-benar punya rekap - bukan bulan berjalan, yang rekapnya
  // baru ada setelah bulannya lewat dan disinkronkan.
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaRekapPresensi(satkerWajib ?? undefined)
  );

  // KASUBAG_TU tetap DIPAKSA ke unitnya - `?satker=` dari luar diabaikan,
  // bukan cuma disembunyikan dropdown-nya. Role lintas satker (PPABP/ADMIN)
  // boleh memilih; kosong berarti semua unit.
  const satkerEfektif = satkerWajib ?? (satker?.trim() || null);

  const filterPegawai: Prisma.PegawaiWhereInput = {};
  if (satkerEfektif) filterPegawai.satuanKerja = satkerEfektif;
  if (q?.trim()) {
    filterPegawai.OR = [{ nama: { contains: q.trim(), mode: "insensitive" } }, { nip: { contains: q.trim() } }];
  }

  const where: Prisma.RekapPresensiPeriodeWhereInput = {
    periodeBulan,
    periodeTahun,
    ...(Object.keys(filterPegawai).length > 0 ? { pegawai: filterPegawai } : {}),
  };

  const jumlahLiburPeriode = await prisma.hariLiburNasional.count({
    where: {
      tanggal: {
        gte: new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1)),
        lt: new Date(Date.UTC(periodeTahun, periodeBulan, 1)),
      },
    },
  });
  const jumlahKendalaPeriode = await prisma.kendalaEpresensi.count({
    where: {
      tanggal: {
        gte: new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1)),
        lt: new Date(Date.UTC(periodeTahun, periodeBulan, 1)),
      },
    },
  });

  // Jumlah baris dihitung DULU supaya paginasi tahu total halamannya; sesudah
  // itu yang ditarik dari database HANYA satu halaman (skip/take), bukan
  // ribuan baris yang lalu dipotong di memori.
  const jumlahBaris = await prisma.rekapPresensiPeriode.count({ where });
  const paginasi = hitungPaginasi(jumlahBaris, hal, per);

  // Filter yang sedang berlaku WAJIB ikut terbawa saat pindah halaman -
  // kalau tidak, halaman 2 diam-diam menampilkan periode/satker yang berbeda.
  const paramPaginasi = new URLSearchParams();
  if (periodeBulan) paramPaginasi.set("bulan", String(periodeBulan));
  if (periodeTahun) paramPaginasi.set("tahun", String(periodeTahun));
  if (satker && !satkerWajib) paramPaginasi.set("satker", satker);
  if (q?.trim()) paramPaginasi.set("q", q.trim());

  const [rekapList, satuanKerjaRows] = await Promise.all([
    prisma.rekapPresensiPeriode.findMany({
      where,
      skip: paginasi.mulai,
      take: paginasi.perHalaman,
      orderBy: { pegawai: { nama: "asc" } },
      include: { pegawai: { select: { nip: true, nama: true, satuanKerja: true, kelasJabatan: true } } },
    }),
    // Daftar untuk dropdown - cuma diambil kalau memang ada yang bisa memilih.
    satkerWajib
      ? Promise.resolve([] as { satuanKerja: string }[])
      : prisma.pegawai.findMany({
          distinct: ["satuanKerja"],
          select: { satuanKerja: true },
          orderBy: { satuanKerja: "asc" },
        }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href="/tukin"
        className="inline-flex items-center gap-2 text-sm font-bold text-teal-deep transition hover:text-biru"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span className="underline underline-offset-2">Kembali</span>
      </Link>

      <h1 className="mt-3 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Presensi
        {/* Dasar hukumnya pindah ke sini - dulu memakan satu baris penuh di
            deskripsi. Tetap terbaca kapan pun diperlukan (auditor/Itjen),
            tanpa harus dibaca tiap halaman dibuka. */}
        <SumberAcuan
          acuan={[
            { aturan: "Pasal 5 ayat (2) huruf b", tentang: "Kehadiran berbobot 30% dari Tunjangan Kinerja" },
            { aturan: "Pasal 13", tentang: "Tarif potongan: alpha 3%/hari, lupa absen 1%/kali, telat & pulang cepat 0,01%/menit" },
            { aturan: "Pasal 9", tentang: "Jam kerja 07:30-16:00 (Jumat 16:30), toleransi terlambat 60 menit" },
            { aturan: "Pasal 14", tentang: "Persentase yang dibayarkan selama cuti" },
            { aturan: "Pasal 10 ayat (2)", tentang: "Presensi manual kalau presensi elektronik mengalami kendala" },
          ]}
          catatan="Semuanya Permenaker 15/2024 - Sumber data: database e-Presensi (READ ONLY)."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">Komponen 30% Tunjangan Kinerja (Tukin)</p>
      <p className="mt-2 text-sm text-biru">
        Kelola data kehadiran: sinkronisasi e-Presensi, rekap presensi, dan validasi data kehadiran.
      </p>
      {satkerWajib && (
        <p className="mt-1 text-sm text-muted">
          Kamu hanya melihat pegawai di <strong className="text-ink">{satkerWajib}</strong>.
        </p>
      )}

      {/* Jalur UTAMA - tarik langsung dari database e-Presensi. Panel kendala,
          kalender libur, dan dua jalur manual (PDF & template Excel) semuanya
          di BAWAH: yang dipakai tiap periode tidak boleh terdorong turun oleh
          yang dibuka beberapa kali setahun. */}
      <SinkronisasiPresensi defaultBulan={periodeBulan} defaultTahun={periodeTahun} />

      <form method="get" className="card mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="w-full text-xs text-muted">
          Pilih periode dan kriteria untuk menampilkan data pada tabel di bawah.
        </div>
        <div>
          <label className="field-label">Bulan</label>
          <SearchableSelect
            name="bulan"
            className="w-36"
            options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
            defaultValue={String(periodeBulan)}
          />
        </div>
        <div>
          <label className="field-label">Tahun</label>
          <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-28 py-1.5" />
        </div>
        {/* Dropdown satuan kerja cuma dirender untuk yang memang boleh
            memilih. Buat KASUBAG_TU tidak ada gunanya - unitnya sudah dipaksa
            di sisi query, jadi menampilkannya cuma memberi kesan bisa diubah. */}
        {!satkerWajib && (
          <div>
            <label className="field-label">Satuan kerja</label>
            <SearchableSelect
              name="satker"
              className="min-w-[240px]"
              options={satuanKerjaRows
                .map((r) => r.satuanKerja)
                .filter((s): s is string => Boolean(s?.trim()))
                .map((s) => ({ value: s, label: s }))}
              defaultValue={satkerEfektif ?? ""}
              emptyLabel="Semua satuan kerja"
            />
          </div>
        )}
        <div className="min-w-[200px] flex-1">
          <label className="field-label">Cari nama atau NIP</label>
          <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Terapkan
        </button>
      </form>

      <div className="mt-6">
        <h2 className="text-lg font-extrabold tracking-tight text-navy">
          Rekap Presensi Periode {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} {periodeTahun}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="grid size-7 flex-none place-items-center rounded-lg bg-teal-tint text-teal-deep">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M15 21V9h4a2 2 0 0 1 2 2v10" />
                <path d="M9 7h2M9 11h2M9 15h2" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Satuan Kerja</span>
              <span className="block max-w-[22rem] truncate font-bold text-ink" title={satkerEfektif ?? undefined}>
                {satkerEfektif ?? "Semua satuan kerja"}
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm">
            <span className="grid size-7 flex-none place-items-center rounded-lg bg-teal-tint text-teal-deep">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span>
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">Jumlah Pegawai</span>
              <span className="block font-bold text-ink">{jumlahBaris}</span>
            </span>
          </span>
        </div>
      </div>
      <div className="card mt-3 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                <th className="col-nama px-3 py-2.5">Pegawai</th>
                <th className="px-3 py-2.5">Hari kerja</th>
                <th className="px-3 py-2.5">WFO</th>
                <th className="px-3 py-2.5">WFH/WFA</th>
                <th className="px-3 py-2.5">Dinas luar</th>
                <th className="px-3 py-2.5">Alpha</th>
                <th className="px-3 py-2.5">Lupa absen</th>
                <th className="px-3 py-2.5">Telat</th>
                <th className="px-3 py-2.5">Plg cepat</th>
                <th className="px-3 py-2.5">Cuti</th>
              </tr>
            </thead>
            <tbody>
              {rekapList.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-muted">
                    Belum ada rekap presensi untuk periode ini. Tarik dulu di panel Sinkronisasi di atas - tanpa
                    presensi, kalkulasi Tukin akan melewati pegawai yang bersangkutan.
                  </td>
                </tr>
              )}
              {rekapList.map((r) => {
                // Nol ditampilkan pucat, bukan dihilangkan: kolom kosong tidak
                // bisa dibedakan dari data yang belum masuk.
                const kosong = (n: number) => (n === 0 ? "text-line" : "text-ink-2");
                const cuti = uraiJenisCuti(r.jenisCutiAktif);
                const bulanCuti = cuti?.bulanKeberapa ?? r.bulanCutiKeberapa;
                const labelCuti = cuti
                  ? `${LABEL_JENIS_CUTI[cuti.jenis]}${bulanCuti ? ` (bln ke-${bulanCuti})` : ""}`
                  : null;
                return (
                  <tr key={r.id} className="border-b border-line-2">
                    <td className="col-nama px-3 py-2.5">
                      <Link
                        href={`/tukin/presensi/${r.pegawai.nip}?bulan=${periodeBulan}&tahun=${periodeTahun}`}
                        className="font-semibold text-teal-deep underline"
                      >
                        {r.pegawai.nama}
                      </Link>
                      <BadgePejabatEselon kelasJabatan={r.pegawai.kelasJabatan} />
                      <span className="block font-mono text-xs text-muted">{r.pegawai.nip}</span>
                      <span className="block text-xs text-muted">{r.sourceSystem}</span>
                    </td>
                    <td className="px-3 py-2.5 font-mono font-bold text-ink">{r.jumlahHariKerja}</td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.jumlahHariWfo)}`}>{r.jumlahHariWfo}</td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.jumlahHariWfhWfa)}`}>{r.jumlahHariWfhWfa}</td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.jumlahHariDinasLuar)}`}>
                      {r.jumlahHariDinasLuar}
                      {/* Diklat digabung ke sel yang sama, bukan kolom sendiri -
                          perlakuannya identik (hadir, tapi tidak dapat uang
                          makan) dan angkanya jarang terisi. */}
                      {r.jumlahHariDiklat > 0 && (
                        <span className="block text-xs text-muted">+{r.jumlahHariDiklat} diklat</span>
                      )}
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${r.jumlahHariAlpha > 0 ? "font-bold text-red" : "text-line"}`}>
                      {r.jumlahHariAlpha}
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.jumlahTidakPresensi)}`}>
                      {r.jumlahTidakPresensi}x
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.totalMenitTerlambat)}`}>
                      {r.totalMenitTerlambat} mnt
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.totalMenitPulangCepat)}`}>
                      {r.totalMenitPulangCepat} mnt
                    </td>
                    <td className={`px-3 py-2.5 font-mono ${kosong(r.jumlahHariCuti)}`}>
                      {r.jumlahHariCuti}
                      {/* Jenisnya ikut disebut - "3 hari cuti" tidak cukup buat
                          menilai, karena Pasal 14 memotong berbeda-beda per
                          jenis (cuti tahunan 0%, CLTN 100%). */}
                      {labelCuti && <span className="block text-xs text-muted">{labelCuti}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line-2 px-4 py-3 sm:px-6">
          <Paginasi
            basePath="/tukin/presensi"
            params={paramPaginasi}
            info={paginasi}
            totalBaris={jumlahBaris}
            labelBaris="pegawai"
          />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line-2 bg-surface-2 p-3.5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Keterangan kolom</p>
        <dl className="mt-2 grid gap-x-8 gap-y-1.5 text-xs text-muted sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-ink-2">Lupa absen</dt>
            <dd>tidak melakukan presensi masuk atau pulang</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-ink-2">Dinas luar &amp; diklat</dt>
            <dd>tetap dihitung hadir, tapi tidak dapat uang makan</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-ink-2">Cuti</dt>
            <dd>total hari semua jenis - jenisnya disebut di bawah angkanya, karena Pasal 14 memotong berbeda per jenis</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0 font-bold text-ink-2">Tidak berkolom</dt>
            <dd>meninggalkan kantor &amp; tidak ikut upacara tetap dihitung, tapi e-Presensi tidak mencatatnya (selalu 0 kecuali diisi lewat template Excel)</dd>
          </div>
        </dl>
        <p className="mt-2.5 border-t border-line-2 pt-2 text-xs text-muted">
          Klik nama pegawai untuk melihat rincian per tanggal.
        </p>
      </div>

      {/* ------------------------------------------------------------------
          PENGATURAN PERIODE - dibuka beberapa kali setahun, bukan tiap hari
          ------------------------------------------------------------------ */}
      {(canKelolaKendalaEpresensi(authUser) || canKelolaHariLibur(authUser) || bolehRekonsiliasi) && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Pasal 10 ayat (2) - kalau e-Presensi bermasalah, kegagalan
              mencatat presensi bukan kelalaian pegawainya. */}
          {canKelolaKendalaEpresensi(authUser) && (
            <div className="card flex flex-col p-5">
              <p className="text-base font-extrabold text-navy">Data e-Presensi Bermasalah</p>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">
                {jumlahKendalaPeriode > 0 ? (
                  <>
                    <strong className="text-ink">{jumlahKendalaPeriode} tanggal</strong> di{" "}
                    <strong className="text-ink">
                      {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
                    </strong>{" "}
                    sudah ditandai kendala - potongan &quot;tidak melakukan presensi&quot; di tanggal itu tidak diterapkan.
                  </>
                ) : (
                  <>
                    Tidak ada tanggal bermasalah di{" "}
                    <strong className="text-ink">
                      {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
                    </strong>
                    . Kalau absen gagal massal karena sistemnya, tandai tanggalnya sekali - tidak perlu mengoreksi
                    pegawai satu per satu.
                  </>
                )}
              </p>
              <Link
                href={`/tukin/presensi/kendala?bulan=${periodeBulan}&tahun=${periodeTahun}`}
                className="btn btn-secondary mt-4 self-start"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                Periksa Data Bermasalah
              </Link>
            </div>
          )}

          {/* Tanpa kalender ini "hari libur" cuma Sabtu/Minggu, jadi lembur di
              tanggal merah dibayar 1x (harusnya 2x) dan hari itu ikut jadi
              batas atas uang makan. */}
          {canKelolaHariLibur(authUser) && (
            <div className="card flex flex-col p-5">
              <p className="text-base font-extrabold text-navy">Kalender Hari Libur</p>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">
                {jumlahLiburPeriode > 0 ? (
                  <>
                    <strong className="text-ink">{jumlahLiburPeriode} tanggal merah</strong> di{" "}
                    <strong className="text-ink">
                      {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
                    </strong>{" "}
                    sudah ditetapkan - lembur di tanggal itu dibayar tarif hari libur, dan tidak dihitung hari kerja.
                  </>
                ) : (
                  <>
                    Belum ada tanggal merah di{" "}
                    <strong className="text-ink">
                      {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
                    </strong>
                    . Kalender berlaku se-tahun - tanggal yang ditetapkan di bulan lain tetap tersimpan, cuma tidak
                    jatuh di periode ini.
                  </>
                )}
              </p>
              <Link
                href={`/tukin/presensi/hari-libur?bulan=${periodeBulan}&tahun=${periodeTahun}`}
                className="btn btn-secondary mt-4 self-start"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                Kelola Kalender Libur
              </Link>
            </div>
          )}

          {/* Alat masa TRANSISI: selama petugas masih merekap di Excel,
              berkas itulah yang menentukan pembayaran. Kartu ini yang membuat
              kedua sumber bisa diadu per hari sebelum jalur manualnya
              dimatikan. */}
          {bolehRekonsiliasi && (
            <div className="card flex flex-col p-5">
              <p className="text-base font-extrabold text-navy">Bandingkan Rekap Petugas</p>
              <p className="mt-1 flex-1 text-sm leading-relaxed text-muted">
                Unggah berkas rekap absensi manual yang masih dipakai petugas, lalu lihat baris mana yang berbeda
                dari data Gajihub beserta perkiraan dampak rupiahnya. Tidak mengubah data apa pun.
              </p>
              <Link href="/tukin/presensi/rekonsiliasi" className="btn btn-secondary mt-4 self-start">
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 7H7a4 4 0 0 0-4 4M3 17h14a4 4 0 0 0 4-4" />
                  <path d="m17 3 4 4-4 4M7 21l-4-4 4-4" />
                </svg>
                Bandingkan Rekap
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------
          CARA CADANGAN - dipakai kalau jalur utama tidak bisa
          ------------------------------------------------------------------ */}
      <div className="mt-10 border-t border-line pt-5">
        <p className="text-sm font-bold text-ink">Cara lain mengisi presensi</p>
        <p className="mt-0.5 text-xs text-muted">
          Keduanya <strong>cadangan</strong>, jarang dipakai. Selama panel Sinkronisasi di atas berhasil menarik data,
          tidak perlu membuka bagian ini.
        </p>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-teal-deep">
            Upload PDF &quot;Laporan Detail Presensi Harian&quot; dari e-Presensi
          </summary>
          <div className="card mt-2 border-l-4 border-l-line p-4">
            <p className="text-sm font-bold text-ink">Kapan ini dipakai?</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>
                <strong>Server e-Presensi tidak terjangkau</strong> dari mesin ini (jaringan/VPN bermasalah, atau
                aplikasinya dijalankan di luar jaringan kantor) - PDF-nya masih bisa diunduh sendiri lewat web
                e-Presensi lalu diunggah ke sini.
              </li>
              <li>
                <strong>Perlu satu-dua pegawai saja</strong>, bukan satu periode penuh - mis. memeriksa ulang satu
                orang tanpa menarik ribuan baris.
              </li>
              <li>
                <strong>Isinya sama</strong> dengan tarikan langsung: PDF diubah jadi rekap lewat aturan Pasal 13 yang{" "}
                <em>sama persis</em>, jadi angkanya tidak bisa berbeda dari jalur sinkronisasi.
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted">
              Periode diambil dari ISI berkas, jadi satu unggahan boleh berisi beberapa periode sekaligus.
            </p>
          </div>
          <UploadPresensiPdfForm />
        </details>

        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-teal-deep">
            Isi template Excel sendiri (buat koreksi angka yang tidak ada di e-Presensi)
          </summary>
          <div className="card mt-2 border-l-4 border-l-line p-4">
            <p className="text-sm text-muted">
              Dipakai buat angka yang <strong>memang tidak tercatat di e-Presensi</strong> - menit meninggalkan kantor
              dan jumlah tidak ikut upacara. Keduanya selalu 0 lewat jalur sinkronisasi maupun PDF, karena datanya tidak
              ada di sumber manapun.
            </p>
          </div>
          <UploadPresensiForm defaultBulan={periodeBulan} defaultTahun={periodeTahun} />

          <div className="card mt-4 border-l-4 border-l-gold p-4">
            <p className="text-sm font-bold text-ink">Aturan pengisian kolom lembur</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
              <li>
                <strong>Hari WFH/WFA tidak dihitung lembur</strong> - walau jam absen keluarnya melewati jam kerja. Jam
                lembur yang diisi harus sudah mengecualikan hari-hari itu.
              </li>
              <li>
                <strong>Di hari kerja, lembur dihitung sejak jam kerja berakhir</strong> - pukul 16.00 (Jumat 16.30),
                tanpa jeda. Pulang pukul 20.00 berarti 4 jam lembur; jam 16.00-17.00 sudah ikut terhitung. Pegawai yang
                pulang tepat pukul 16.00 mendapat 0 jam lembur. Di hari libur tidak ada jam pulang wajib - dihitung
                penuh sejak jam masuk.
              </li>
              <li>
                <strong>Jam lembur hari libur / tanggal merah diisi di kolom terpisah</strong> - tarifnya dibayar 2x
                tarif per jam biasa.
              </li>
              <li>
                <strong>Hari makan lembur</strong> = jumlah hari yang lemburnya mencapai 2 jam{" "}
                <em>berturut-turut</em> (SBM 2026 hal. 51, penjelasan item 23.2), paling banyak 1 kali per hari. Lembur
                1 jam pagi + 1 jam sore TIDAK memenuhi syarat walau totalnya 2 jam. <strong>Diukur dari jam pulang
                wajib</strong> - pulang pukul 17.00 berarti 1 jam lembur dan belum berhak; berhak mulai pukul 18.00.
              </li>
            </ul>
          </div>
        </details>
      </div>
    </main>
  );
}