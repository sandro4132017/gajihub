import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaGajiInduk, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";
import { SearchableSelect } from "../../SearchableSelect";
import { UploadGajiIndukForm } from "./UploadGajiIndukForm";
import { HonorariumForm } from "./HonorariumForm";
import { PencarianDebounce } from "../../PencarianDebounce";

export const dynamic = "force-dynamic";

/**
 * RIWAYAT GAJI PEGAWAI (gaji induk) - PPABP upload file ADK gaji dari GPP/Web
 * Gaji, hasilnya jadi bagian "PENGHASILAN"/"POTONGAN" di slip gaji pegawai
 * (/saya/slip-gaji). Lihat model GajiInduk di prisma/schema.prisma buat
 * batasan & TODO(confirm)-nya.
 */

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

/** Batas baris yang ditampilkan - satu periode Setjen saja sudah 350 baris. */
const MAKS_BARIS_TAMPIL = 200;

export default async function RiwayatGajiPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; q?: string }>;
}) {
  const { bulan, tahun, satker, q } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaGajiInduk(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola riwayat gaji pegawai." />;
  }

  // Periode yang benar-benar sudah punya data - dipakai buat dropdown dan
  // buat menentukan periode default (yang terbaru), supaya PPABP tidak
  // mendarat di halaman kosong setelah upload.
  const periodeTersedia = await prisma.gajiInduk.groupBy({
    by: ["periodeTahun", "periodeBulan"],
    _count: { _all: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
  });

  const periodeDefault = periodeTersedia[0];
  const periodeBulan = bulan ? Number(bulan) : periodeDefault?.periodeBulan;
  const periodeTahun = tahun ? Number(tahun) : periodeDefault?.periodeTahun;
  const adaPeriode = Number.isInteger(periodeBulan) && Number.isInteger(periodeTahun);

  const filterPegawai: Prisma.PegawaiWhereInput = {};
  if (satker) filterPegawai.satuanKerja = satker;
  if (q?.trim()) {
    filterPegawai.OR = [
      { nama: { contains: q.trim(), mode: "insensitive" } },
      { nip: { contains: q.trim() } },
    ];
  }

  const where: Prisma.GajiIndukWhereInput = adaPeriode
    ? { periodeBulan: periodeBulan!, periodeTahun: periodeTahun!, ...(Object.keys(filterPegawai).length > 0 ? { pegawai: filterPegawai } : {}) }
    : { id: "___tidak-ada___" };

  const [satuanKerjaRows, agregat, barisList] = await Promise.all([
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
    prisma.gajiInduk.aggregate({
      where,
      _count: { _all: true },
      _sum: { gajiBersih: true, totalPenghasilan: true, totalPotongan: true, honorarium: true },
    }),
    prisma.gajiInduk.findMany({
      where,
      take: MAKS_BARIS_TAMPIL,
      orderBy: { pegawai: { nama: "asc" } },
      include: {
        pegawai: { select: { id: true, nip: true, nama: true, satuanKerja: true } },
        diunggahOleh: { select: { nama: true, nip: true } },
      },
    }),
  ]);

  const jumlahBaris = agregat._count._all;
  const sumberFile = [...new Set(barisList.map((b) => b.sourceFileName).filter(Boolean))];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Riwayat Gaji Pegawai</h1>
      <p className="mt-1 text-sm text-muted">
        Gaji induk (gaji pokok + tunjangan melekat + potongan) hasil upload ADK dari GPP/Web Gaji. Angkanya dipakai apa
        adanya di slip gaji pegawai - Gajihub tidak menghitung ulang gaji pokok/tunjangan keluarga.
      </p>

      <UploadGajiIndukForm />

      {periodeTersedia.length === 0 ? (
        <div className="card mt-6 p-5">
          <p className="font-bold text-ink">Belum ada data gaji induk</p>
          <p className="mt-1 text-sm text-muted">
            Upload file ADK gaji dulu di atas. Sebelum ada datanya, slip gaji pegawai cuma menampilkan Tunjangan
            Kinerja, Uang Makan, dan Uang Lembur - tanpa bagian gaji pokok &amp; tunjangan.
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
              <input
                type="number"
                name="tahun"
                defaultValue={String(periodeTahun ?? "")}
                className="field-input w-24 py-1.5"
              />
            </div>
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
            <div className="min-w-[180px] flex-1">
              <label className="field-label">Cari nama atau NIP</label>
              <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
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
                  href={`/ppabp/gaji-induk?bulan=${p.periodeBulan}&tahun=${p.periodeTahun}`}
                  className="font-semibold text-teal-deep underline"
                >
                  {NAMA_BULAN[p.periodeBulan - 1] ?? p.periodeBulan} {p.periodeTahun}
                </Link>{" "}
                ({p._count._all})
              </span>
            ))}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Pegawai</p>
              <p className="mt-1 text-lg font-extrabold text-ink">{jumlahBaris}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Jumlah penghasilan</p>
              <p className="mt-1 font-mono text-sm font-bold text-ink">{formatRupiah(agregat._sum.totalPenghasilan ?? 0)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Jumlah potongan</p>
              <p className="mt-1 font-mono text-sm font-bold text-ink">{formatRupiah(agregat._sum.totalPotongan ?? 0)}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted">Total gaji bersih</p>
              <p className="mt-1 font-mono text-sm font-bold text-ink">{formatRupiah(agregat._sum.gajiBersih ?? 0)}</p>
            </div>
          </div>

          {sumberFile.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Sumber data: <span className="font-mono">{sumberFile.join(", ")}</span>
              {barisList[0]?.diunggahOleh && <> - diunggah {barisList[0].diunggahOleh.nama}</>}
            </p>
          )}

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-4 py-2.5">Pegawai</th>
                  <th className="px-4 py-2.5">Gaji pokok</th>
                  <th className="px-4 py-2.5">Penghasilan</th>
                  <th className="px-4 py-2.5">Potongan</th>
                  <th className="px-4 py-2.5">Gaji bersih</th>
                  <th className="px-4 py-2.5">Honorarium</th>
                </tr>
              </thead>
              <tbody>
                {barisList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted">
                      Tidak ada data gaji untuk filter ini.
                    </td>
                  </tr>
                )}
                {barisList.map((b) => (
                  <tr key={b.id} className="border-b border-line-2 align-top">
                    <td className="col-nama px-4 py-2.5">
                      <span className="font-semibold text-ink">{b.pegawai.nama}</span>
                      <span className="block font-mono text-xs text-muted">{b.pegawai.nip}</span>
                      <span className="block text-xs text-muted">{b.pegawai.satuanKerja}</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{formatRupiah(b.gajiPokok)}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{formatRupiah(b.totalPenghasilan)}</td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{formatRupiah(b.totalPotongan)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-ink">{formatRupiah(b.gajiBersih)}</td>
                    <td className="px-4 py-2.5">
                      <HonorariumForm gajiIndukId={b.id} honorarium={b.honorarium} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {jumlahBaris > barisList.length && (
            <p className="mt-2 text-xs text-muted">
              Menampilkan {barisList.length} dari {jumlahBaris} baris - persempit dengan filter satuan kerja atau
              pencarian nama/NIP.
            </p>
          )}

          <div className="card mt-6 border-l-4 border-l-gold p-4">
            <p className="text-sm font-bold text-ink">Kolom Honorarium diisi manual</p>
            <p className="mt-1 text-sm text-muted">
              File ADK dari GPP tidak punya kolom honorarium, jadi setelah upload nilainya selalu Rp 0. Isi di kolom
              paling kanan kalau pegawai yang bersangkutan menerima honorarium pada periode ini - angkanya langsung
              muncul di slip gajinya. Upload ulang file GPP TIDAK menghapus honorarium yang sudah diisi.
            </p>
            <p className="mt-2 text-xs text-muted">
              TODO(confirm): sumber resmi data honorarium (kemungkinan dari SPJ kegiatan, bukan dari GPP) belum
              ditetapkan - sementara ini murni input manual PPABP.
            </p>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-muted">
        Slip gaji yang dilihat pegawai ada di <Link href="/saya" className="font-semibold text-teal-deep underline">Data Saya</Link>{" "}
        masing-masing.
      </p>
    </main>
  );
}
