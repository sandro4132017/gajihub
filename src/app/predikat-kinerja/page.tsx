import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canBukaHalamanPredikatKinerja, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";
import { NAMA_BULAN } from "../bulan";
import { SearchableSelect } from "../SearchableSelect";
import { UploadRekapForm } from "./UploadRekapForm";

export const dynamic = "force-dynamic";

/**
 * PREDIKAT KINERJA - upload rekap penilaian dari e-Kinerja BKN, sumber bobot
 * 70% Tukin (Permenaker 15/2024 Pasal 6, konversi lewat Kepsekjen 82/2025).
 *
 * SATU halaman dipakai KASUBAG_TU dan PPABP (pola yang sama dengan
 * /pegawai - bukan dua salinan): yang membedakan cuma cakupan datanya, dan
 * itu diurus fungsi izin. KASUBAG_TU dipaksa ke unitnya sendiri di level
 * QUERY, PPABP/ADMIN lintas satker.
 */

/** Batas baris yang ditampilkan per halaman - satu satker bisa ratusan pegawai. */
const MAKS_BARIS_TAMPIL = 200;

const LABEL_PREDIKAT: Record<string, string> = {
  SANGAT_BAIK: "Sangat Baik",
  BAIK: "Baik",
  PERLU_PERBAIKAN: "Perlu Perbaikan",
  KURANG: "Kurang",
  SANGAT_KURANG: "Sangat Kurang",
};

function ChipPredikat({ predikat }: { predikat: string }) {
  // Warna mengikuti dampaknya ke tukin: 100% hijau, 85% kuning, 60% merah.
  const kelas =
    predikat === "SANGAT_BAIK" || predikat === "BAIK"
      ? "chip-ok"
      : predikat === "PERLU_PERBAIKAN"
        ? "chip-wait"
        : "chip-danger";
  return <span className={`chip ${kelas}`}>{LABEL_PREDIKAT[predikat] ?? predikat}</span>;
}

export default async function PredikatKinerjaPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; q?: string }>;
}) {
  const { bulan, tahun, satker, q } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola predikat kinerja." />;
  }

  // KASUBAG_TU dipaksa ke unitnya sendiri di level QUERY (bukan cuma
  // disembunyikan di UI) - sama pola dengan /pegawai.
  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  if (authUser.role === "KASUBAG_TU" && !satkerWajib) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Predikat Kinerja</h1>
        <div className="card mt-4 border-l-4 border-l-gold p-5">
          <p className="font-bold text-ink">Akun kamu belum punya unit kerja</p>
          <p className="mt-1 text-sm text-muted">
            Role akun kamu Kasubag TU, tapi kolom satuan kerja akunnya masih kosong - jadi tidak ada pegawai yang bisa
            kamu kelola predikatnya. Minta Admin mengisinya lewat <strong>Kelola Assignment Role</strong>.
          </p>
        </div>
      </main>
    );
  }

  const periodeTersedia = await prisma.predikatKinerja.groupBy({
    by: ["periodeTahun", "periodeBulan"],
    where: satkerWajib ? { pegawai: { satuanKerja: satkerWajib } } : {},
    _count: { _all: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
  });

  const periodeDefault = periodeTersedia[0];
  const periodeBulan = bulan ? Number(bulan) : periodeDefault?.periodeBulan;
  const periodeTahun = tahun ? Number(tahun) : periodeDefault?.periodeTahun;
  const adaPeriode = Number.isInteger(periodeBulan) && Number.isInteger(periodeTahun);

  const filterPegawai: Prisma.PegawaiWhereInput = {};
  if (satkerWajib) filterPegawai.satuanKerja = satkerWajib;
  else if (satker) filterPegawai.satuanKerja = satker;
  if (q?.trim()) {
    filterPegawai.OR = [{ nama: { contains: q.trim(), mode: "insensitive" } }, { nip: { contains: q.trim() } }];
  }

  const where: Prisma.PredikatKinerjaWhereInput = adaPeriode
    ? {
        periodeBulan: periodeBulan!,
        periodeTahun: periodeTahun!,
        ...(Object.keys(filterPegawai).length > 0 ? { pegawai: filterPegawai } : {}),
      }
    : { id: "___tidak-ada___" };

  const [satuanKerjaRows, jumlahBaris, sebaran, barisList] = await Promise.all([
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
    prisma.predikatKinerja.count({ where }),
    prisma.predikatKinerja.groupBy({ by: ["predikat"], where, _count: { _all: true } }),
    prisma.predikatKinerja.findMany({
      where,
      take: MAKS_BARIS_TAMPIL,
      orderBy: { pegawai: { nama: "asc" } },
      include: { pegawai: { select: { id: true, nip: true, nama: true, satuanKerja: true, kelasJabatan: true } } },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Predikat Kinerja</h1>
      <p className="mt-1 text-sm text-muted">
        Sumber bobot <strong>70% Tunjangan Kinerja</strong>. Datanya berasal dari file Rekap Penilaian e-Kinerja BKN yang
        diupload di sini - tidak ada yang bisa mengetik predikat secara manual, dan setiap upload tercatat di audit
        trail.
        {satkerWajib && (
          <>
            {" "}
            Kamu hanya melihat pegawai di <strong>{satkerWajib}</strong>.
          </>
        )}
      </p>

      <UploadRekapForm />

      {periodeTersedia.length === 0 ? (
        <div className="card mt-6 p-5">
          <p className="font-bold text-ink">Belum ada data predikat kinerja</p>
          <p className="mt-1 text-sm text-muted">
            Upload file Rekap Penilaian dulu di atas. Tanpa predikat, kalkulasi Tukin akan melewati pegawai yang
            bersangkutan dengan alasan &quot;predikat kinerja periode ini belum diupload&quot;.
          </p>
        </div>
      ) : (
        <>
          <form method="get" className="card mt-6 flex flex-wrap items-end gap-3 p-4">
            <div>
              <label className="field-label">Bulan</label>
              <SearchableSelect
                name="bulan"
                className="w-40"
                options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
                defaultValue={String(periodeBulan ?? "")}
              />
            </div>
            <div>
              <label className="field-label">Tahun</label>
              <input type="number" name="tahun" defaultValue={String(periodeTahun ?? "")} className="field-input w-24 py-1.5" />
            </div>
            {!satkerWajib && (
              <div>
                <label className="field-label">Satuan kerja</label>
                <SearchableSelect
                  name="satker"
                  className="min-w-[240px]"
                  options={satuanKerjaRows.map((r) => ({ value: r.satuanKerja, label: r.satuanKerja }))}
                  defaultValue={satker ?? ""}
                  emptyLabel="Semua satuan kerja"
                />
              </div>
            )}
            <div className="min-w-[180px] flex-1">
              <label className="field-label">Cari nama atau NIP</label>
              <input type="text" name="q" defaultValue={q ?? ""} className="field-input" placeholder="Cari pegawai..." />
            </div>
            <button type="submit" className="btn btn-primary">
              Terapkan
            </button>
          </form>

          <p className="mt-2 text-xs text-muted">
            Periode yang sudah ada datanya:{" "}
            {periodeTersedia.map((p, i) => (
              <span key={`${p.periodeTahun}-${p.periodeBulan}`}>
                {i > 0 && ", "}
                <Link
                  href={`/predikat-kinerja?bulan=${p.periodeBulan}&tahun=${p.periodeTahun}`}
                  className="font-semibold text-teal-deep underline"
                >
                  {NAMA_BULAN[p.periodeBulan - 1] ?? p.periodeBulan} {p.periodeTahun}
                </Link>{" "}
                ({p._count._all})
              </span>
            ))}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="card px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Total pegawai</p>
              <p className="mt-1 text-lg font-extrabold text-ink">{jumlahBaris}</p>
            </div>
            {sebaran.map((s) => (
              <div key={s.predikat} className="card flex items-center gap-2 px-4 py-3">
                <ChipPredikat predikat={s.predikat} />
                <span className="text-lg font-extrabold text-ink">{s._count._all}</span>
              </div>
            ))}
          </div>

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5">Pegawai</th>
                  <th className="px-4 py-2.5">Predikat</th>
                  <th className="px-4 py-2.5">Nilai kinerja</th>
                  <th className="px-4 py-2.5">Sumber</th>
                </tr>
              </thead>
              <tbody>
                {barisList.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted">
                      Tidak ada predikat kinerja untuk filter ini.
                    </td>
                  </tr>
                )}
                {barisList.map((b) => (
                  <tr key={b.id} className="border-b border-line-2 align-top">
                    <td className="px-4 py-2.5">
                      <Link href={`/pegawai?q=${encodeURIComponent(b.pegawai.nip)}`} className="font-semibold text-ink underline">
                        {b.pegawai.nama}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{b.pegawai.nip}</span>
                      <span className="block text-xs text-muted">{b.pegawai.satuanKerja}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <ChipPredikat predikat={b.predikat} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{b.nilaiAngka}%</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {b.sourceSystem}
                      <span className="block">
                        {b.inputMethod === "MANUAL_UPLOAD" ? "upload manual" : "API"} -{" "}
                        {b.sourceSyncedAt.toLocaleDateString("id-ID")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {jumlahBaris > barisList.length && (
            <p className="mt-2 text-xs text-muted">
              Menampilkan {barisList.length} dari {jumlahBaris} baris - persempit dengan filter atau pencarian nama/NIP.
            </p>
          )}

          <div className="card mt-6 border-l-4 border-l-gold p-4">
            <p className="text-sm font-bold text-ink">Predikat berubah? Tukin harus dihitung ulang</p>
            <p className="mt-1 text-sm text-muted">
              Kalkulasi Tukin memakai predikat yang berlaku SAAT dihitung. Kalau kamu meng-upload rekap perbaikan setelah
              Tukin periode itu terlanjur dihitung, hasil lamanya tidak ikut berubah sendiri - hitung ulang lewat{" "}
              <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
                Kalkulasi Unit
              </Link>
              . Perlu diingat menghitung ulang akan mereset siklus approval yang sudah berjalan ke DRAFT.
            </p>
            <p className="mt-2 text-xs text-muted">
              Konversi predikat ke persen mengikuti Lampiran Kepsekjen 82 Tahun 2025: Sangat Baik/Baik 100%, Perlu
              Perbaikan 85%, Kurang/Sangat Kurang 60%.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
