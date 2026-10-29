import { prisma } from "../../../lib/prisma";
import { canViewRekapUnitKerja, canEditDataPegawai } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { SearchableSelect } from "../../../components/forms/SearchableSelect";
import { PencarianDebounce } from "../../../components/forms/PencarianDebounce";
import { Paginasi, hitungPaginasi } from "../../../components/tables/Paginasi";
import { SumberAcuan } from "../../../components/shared/SumberAcuan";
import { BadgePejabatEselon } from "../../../components/shared/BadgePejabatEselon";
import Link from "next/link";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { FiEdit2, FiUsers, FiUserCheck, FiUserX, FiSearch } from "react-icons/fi";

export const dynamic = "force-dynamic";

/**
 * Kolom Jenis: CPNS / PNS / PPPK dari SIAP (PEGAWAI.STATUSPEGAWAIID), lihat
 * src/business-logic/jenisPegawai.ts. Data kepegawaian diambil dari SIAP,
 * bukan dari berkas basis data gaji (keputusan user 2026-10-27). Kosong
 * berarti sinkronisasi pegawai belum dijalankan sejak kolomnya ada - TIDAK
 * ditebak dari golongan.
 */
function JenisPegawai({ nilai }: { nilai: string | null }) {
  if (!nilai) return <span className="text-xs text-muted">Belum disinkronkan</span>;
  return <span className="chip chip-navy text-xs font-semibold">{nilai}</span>;
}

export default async function RosterPegawaiUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; q?: string; nonaktif?: string; hal?: string; per?: string }>;
}) {
  const { satker, q, nonaktif, hal, per } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  if (!satkerEfektif) {
    return (
      <main className={`${HALAMAN} space-y-6`}>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Pegawai Unit</h1>
          <p className="mt-1 text-sm text-biru">
            Pilih satuan kerja terlebih dahulu untuk melihat daftar pegawai unit.
          </p>
        </div>
        <SatkerPicker satuanKerjaList={satuanKerjaList} />
      </main>
    );
  }

  if (!canViewRekapUnitKerja(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat rekap pegawai unit ini." />;
  }

  // Default hanya AKTIF. Pegawai yang sudah pensiun/berhenti TETAP ADA di
  // database (mereka berhak atas tukin bulan yang sudah dikerjakan), tapi
  // roster unit yang memuat mereka bikin jumlahnya salah dan membingungkan.
  // Disembunyikan lewat DEFAULT, bukan lewat query yang tidak bisa dibuka -
  // ada tombol "Tampilkan yang sudah tidak aktif" di bawah, supaya tidak ada
  // pegawai yang lenyap tanpa jejak dari sudut pandang Kasubag TU.
  const tampilkanNonaktif = nonaktif === "1";
  const [pegawaiList, jumlahAktifTotal, jumlahNonaktif, jumlahTanpaKelas] = await Promise.all([
    prisma.pegawai.findMany({
      where: {
        satuanKerja: satkerEfektif,
        ...(tampilkanNonaktif ? {} : { statusPegawai: "AKTIF" }),
        ...(q
          ? {
              OR: [
                { nama: { contains: q, mode: "insensitive" } },
                { nip: { contains: q } },
                { jabatan: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { nama: "asc" },
    }),
    prisma.pegawai.count({ where: { satuanKerja: satkerEfektif, statusPegawai: "AKTIF" } }),
    prisma.pegawai.count({ where: { satuanKerja: satkerEfektif, statusPegawai: { not: "AKTIF" } } }),
    prisma.pegawai.count({
      where: { satuanKerja: satkerEfektif, statusPegawai: "AKTIF", kelasJabatan: null },
    }),
  ]);

  // PAGINASI. Unit terbesar di data ini berisi 227 pegawai (Balai Bekasi),
  // dan 54 dari 84 unit melewati 50 orang - daftar utuh dalam satu halaman
  // menjadikan halaman ini gulungan panjang tanpa ujung.
  //
  // Bawaannya 50 baris, bukan 10 seperti UKURAN_HALAMAN_DEFAULT: ini roster
  // yang dibaca menyeluruh ("siapa saja di unit saya"), bukan tabel hasil
  // pencarian yang dibaca sebaris.
  const paginasi = hitungPaginasi(pegawaiList.length, hal, per ?? "50");
  const pegawaiHalamanIni = pegawaiList.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams({ satker: satkerEfektif });
  if (q) paramPaginasi.set("q", q);
  if (tampilkanNonaktif) paramPaginasi.set("nonaktif", "1");

  // Tombol Edit cuma muncul kalau memang berwenang - halaman /pegawai
  // memeriksanya lagi per baris, jadi ini soal tidak menawarkan pintu yang
  // akan ditolak, bukan soal keamanan.
  const bolehEdit = canEditDataPegawai(authUser, satkerEfektif);

  const urlHanyaAktif = `/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const urlSemuaStatus = `/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}&nonaktif=1${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. KEPALA HALAMAN
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
              Pegawai Unit
              <SumberAcuan
                judulKeterangan="Tentang Roster Pegawai Unit"
                keterangan={[
                  "Daftar pegawai yang terdaftar pada satuan kerja ini sebagai dasar perhitungan Tunjangan Kinerja, Uang Makan, dan Uang Lembur.",
                  "Secara bawaan hanya menampilkan pegawai berstatus AKTIF.",
                  "Pegawai yang sudah pensiun/berhenti sengaja tidak dihapus dari database agar histori pembayaran bulan sebelumnya tetap utuh.",
                  "Perubahan kelas jabatan, golongan, atau pemindahan unit kerja dilakukan melalui halaman Data Pegawai.",
                ]}
                acuan={[
                  { aturan: "Data Master SIAP", tentang: "Identitas NIP, nama, jabatan, dan golongan pegawai" },
                  { aturan: "SK Grading / Kelas Jabatan", tentang: "Penentu tarif Tukin Pokok (Kelas 1 s.d. 17)" },
                ]}
              />
            </h1>
            <span className="chip chip-navy text-xs font-semibold">{satkerEfektif}</span>
          </div>
          <p className="mt-0.5 text-sm font-bold text-ink">
            Roster Kepegawaian Satuan Kerja &middot; {jumlahAktifTotal} Pegawai Aktif
          </p>
          <p className="mt-1.5 text-sm text-biru">
            Pantau daftar pegawai aktif, jabatan, golongan, dan kelengkapan kelas jabatan di unit kerja Anda.
          </p>
        </div>

        {bolehEdit && (
          <Link
            href={`/pegawai?satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-secondary inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-2xs"
          >
            <FiEdit2 className="size-3.5" />
            <span>Kelola Data Pegawai</span>
          </Link>
        )}
      </div>

      {/* ====================================================================
          2. METRIK RINGKASAN ROSTER UNIT
          ==================================================================== */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        <a
          href={urlHanyaAktif}
          className={`flex items-center justify-between rounded-2xl border p-4 shadow-2xs transition ${
            !tampilkanNonaktif
              ? "border-navy bg-surface ring-2 ring-navy/10"
              : "border-line bg-surface hover:border-biru"
          }`}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Pegawai Aktif</p>
            <p className="mt-1 font-mono text-2xl font-black text-ink">
              {jumlahAktifTotal.toLocaleString("id-ID")}{" "}
              <span className="text-xs font-semibold text-muted">orang</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted">Ikut dalam siklus kalkulasi</p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-teal-tint text-navy">
            <FiUserCheck className="size-5" />
          </div>
        </a>

        <div
          className={`flex items-center justify-between rounded-2xl border p-4 shadow-2xs ${
            jumlahTanpaKelas > 0
              ? "border-amber-300 bg-gold-tint/40 dark:border-amber-800"
              : "border-line bg-surface"
          }`}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Kelengkapan Kelas Jabatan</p>
            <p className="mt-1 font-mono text-2xl font-black text-ink">
              {(jumlahAktifTotal - jumlahTanpaKelas).toLocaleString("id-ID")}{" "}
              <span className="text-xs font-semibold text-muted">/ {jumlahAktifTotal}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-muted">
              {jumlahTanpaKelas > 0 ? (
                <span className="font-semibold text-gold-deep">
                  {jumlahTanpaKelas} pegawai aktif belum punya kelas jabatan
                </span>
              ) : (
                "Seluruh pegawai aktif memiliki kelas jabatan"
              )}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
            <FiUsers className="size-5" />
          </div>
        </div>

        <a
          href={tampilkanNonaktif ? urlHanyaAktif : urlSemuaStatus}
          className={`flex items-center justify-between rounded-2xl border p-4 shadow-2xs transition ${
            tampilkanNonaktif
              ? "border-navy bg-surface ring-2 ring-navy/10"
              : "border-line bg-surface hover:border-biru"
          }`}
        >
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Pensiun / Nonaktif</p>
            <p className="mt-1 font-mono text-2xl font-black text-ink">
              {jumlahNonaktif.toLocaleString("id-ID")}{" "}
              <span className="text-xs font-semibold text-muted">orang</span>
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-teal-deep underline">
              {tampilkanNonaktif ? "Sembunyikan dari tabel" : "Klik untuk tampilkan di tabel"}
            </p>
          </div>
          <div className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
            <FiUserX className="size-5" />
          </div>
        </a>
      </div>

      {/* ====================================================================
          3. FILTER & PENCARIAN
          ==================================================================== */}
      <form
        method="get"
        className="rounded-2xl border border-line bg-surface p-4 shadow-2xs flex flex-wrap items-end gap-3"
      >
        {satuanKerjaList.length > 1 ? (
          <div className="min-w-[240px]">
            <label className="field-label">Satuan kerja</label>
            <SearchableSelect
              name="satker"
              className="w-full"
              options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
              defaultValue={satkerEfektif}
            />
          </div>
        ) : (
          <input type="hidden" name="satker" value={satkerEfektif} />
        )}

        {tampilkanNonaktif && <input type="hidden" name="nonaktif" value="1" />}

        <div className="min-w-[220px] flex-1">
          <label className="field-label">Cari nama, NIP, atau jabatan</label>
          <PencarianDebounce defaultValue={q} placeholder="Ketik nama, NIP, atau jabatan..." />
        </div>

        <button type="submit" className="btn btn-primary inline-flex items-center gap-1.5">
          <FiSearch className="size-4" />
          <span>Cari</span>
        </button>

        {q && (
          <a
            href={tampilkanNonaktif ? urlSemuaStatus.replace(`&q=${encodeURIComponent(q)}`, "") : `/kasubag/pegawai?satker=${encodeURIComponent(satkerEfektif)}`}
            className="btn btn-ghost text-xs font-semibold"
          >
            Reset
          </a>
        )}
      </form>

      {/* ====================================================================
          4. TABEL ROSTER PEGAWAI UNIT
          ==================================================================== */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold tracking-tight text-navy">
            Daftar Pegawai {satkerEfektif}
          </h2>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span>
              Menampilkan <strong className="text-ink">{pegawaiList.length}</strong> pegawai
              {tampilkanNonaktif ? " (termasuk nonaktif/pensiun)" : " aktif"}
            </span>
          </div>
        </div>

        <div className="card mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-4 py-3">Pegawai</th>
                  <th className="px-4 py-3">NIP</th>
                  <th className="px-4 py-3">Jabatan</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Golongan</th>
                  <th className="px-4 py-3">Kelas</th>
                  {bolehEdit && <th className="px-4 py-3">Aksi</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {pegawaiList.length === 0 && (
                  <tr>
                    <td colSpan={bolehEdit ? 7 : 6} className="px-4 py-8 text-center text-muted">
                      Tidak ada pegawai yang cocok dengan pencarian ini.
                    </td>
                  </tr>
                )}
                {pegawaiHalamanIni.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-surface-2/50">
                    <td className="col-nama px-4 py-3">
                      <div className="font-semibold text-ink">
                        <Link
                          href={`/tukin/presensi/${encodeURIComponent(p.nip)}?dari=pegawai&satker=${encodeURIComponent(satkerEfektif)}`}
                          className="underline-offset-4 hover:text-biru hover:underline"
                        >
                          {p.nama}
                        </Link>
                        <BadgePejabatEselon kelasJabatan={p.kelasJabatan} />
                      </div>
                      {/* Kolom Status dicabut (permintaan user 2026-10-27).
                          Statusnya tetap terlihat untuk yang TIDAK aktif -
                          muncul saat "Pensiun / Nonaktif" ditampilkan. */}
                      {p.statusPegawai !== "AKTIF" && (
                        <span className="chip chip-wait mt-1 text-[11px]">{p.statusPegawai}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-2">{p.nip}</td>
                    <td className="px-4 py-3 text-ink-2">
                      {p.jabatan ? (
                        <span className="line-clamp-2 max-w-md text-xs sm:text-sm">{p.jabatan}</span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <JenisPegawai nilai={p.jenisPegawai} />
                    </td>
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-ink-2">
                      {p.golongan ? (
                        <span className="inline-flex rounded-md border border-line bg-surface-2 px-2 py-0.5">
                          {p.golongan}
                        </span>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono">
                      {p.kelasJabatan !== null && p.kelasJabatan !== undefined ? (
                        <span className="inline-flex items-center justify-center rounded-lg bg-teal-tint/60 px-2.5 py-0.5 text-xs font-bold text-navy">
                          Kelas {p.kelasJabatan}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-gold-tint px-2 py-0.5 text-[11px] font-semibold text-gold-deep">
                          Belum diisi
                        </span>
                      )}
                    </td>
                    {bolehEdit && (
                      <td className="px-4 py-3">
                        {/* Menuju /pegawai - SATU-SATUNYA tempat data pegawai
                            diubah. Halaman ini sengaja tetap baca-saja: form
                            sunting yang disalin ke dua tempat cepat atau lambat
                            berbeda aturannya. */}
                        <Link
                          href={`/pegawai?pegawaiId=${p.id}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-semibold text-teal-deep shadow-2xs transition hover:border-teal-deep hover:bg-teal-tint/30"
                        >
                          <FiEdit2 className="size-3" />
                          <span>Edit</span>
                        </Link>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line-2 px-4 py-3 sm:px-6">
            <Paginasi
              basePath="/kasubag/pegawai"
              params={paramPaginasi}
              info={paginasi}
              totalBaris={pegawaiList.length}
              labelBaris="pegawai"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
