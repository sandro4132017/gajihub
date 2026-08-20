import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaGajiInduk, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { UploadRekeningForm } from "./UploadRekeningForm";
import { PencarianDebounce } from "../../PencarianDebounce";

export const dynamic = "force-dynamic";

/**
 * REKENING PEGAWAI - data rekening penerima pembayaran, dipisah per jenis
 * (Tukin / Gaji) karena keduanya memang lewat bank berbeda. Dibutuhkan Web
 * Gaji untuk memproses pembayaran, dan SAKTI SPP memprosesnya PER BANK.
 */
const MAKS_BARIS_TAMPIL = 200;

export default async function RekeningPage({
  searchParams,
}: {
  searchParams: Promise<{ jenis?: string; q?: string }>;
}) {
  const { jenis, q } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaGajiInduk(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola data rekening pegawai." />;
  }

  const jenisAktif = jenis === "GAJI" ? "GAJI" : "TUKIN";
  const where = {
    jenisPembayaran: jenisAktif,
    ...(q?.trim()
      ? {
          pegawai: {
            OR: [{ nama: { contains: q.trim(), mode: "insensitive" as const } }, { nip: { contains: q.trim() } }],
          },
        }
      : {}),
  };

  const [perBank, jumlah, list, totalPegawai] = await Promise.all([
    prisma.rekeningPegawai.groupBy({
      by: ["kodeBankSpan", "namaBank"],
      where: { jenisPembayaran: jenisAktif },
      _count: { _all: true },
      orderBy: { _count: { kodeBankSpan: "desc" } },
    }),
    prisma.rekeningPegawai.count({ where }),
    prisma.rekeningPegawai.findMany({
      where,
      take: MAKS_BARIS_TAMPIL,
      orderBy: { pegawai: { nama: "asc" } },
      include: { pegawai: { select: { nip: true, nama: true, satuanKerja: true } } },
    }),
    prisma.pegawai.count(),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Rekening Pegawai</h1>
      <p className="mt-1 text-sm text-muted">
        Rekening penerima pembayaran, dibutuhkan Web Gaji untuk memproses pembayaran. Disimpan{" "}
        <strong>terpisah per jenis</strong> - sudah dibuktikan dari data asli bahwa tukin dan gaji lewat bank yang
        berbeda, dan tidak ada satu pun rekening yang sama.
      </p>

      <UploadRekeningForm />

      <div className="card mt-6 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Sebaran bank per jenis pembayaran</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["TUKIN", "GAJI"] as const).map((j) => (
            <Link
              key={j}
              href={`/ppabp/rekening?jenis=${j}`}
              className={`chip ${j === jenisAktif ? "chip-navy" : "chip-draft"}`}
            >
              {j === "TUKIN" ? "Tunjangan Kinerja" : "Gaji"}
            </Link>
          ))}
        </div>
        {perBank.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Belum ada rekening {jenisAktif} yang diupload. Tanpa ini, kolom rekening di Export ADK akan kosong dan Web
            Gaji tidak bisa memproses pembayarannya.
          </p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-ink-2">
            {perBank.map((b) => (
              <li key={b.kodeBankSpan}>
                {b.namaBank} <span className="font-mono text-xs text-muted">({b.kodeBankSpan})</span>:{" "}
                <span className="font-semibold text-ink">{b._count._all} pegawai</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">
          Total {perBank.reduce((a, b) => a + b._count._all, 0)} dari {totalPegawai} pegawai punya rekening {jenisAktif}.
        </p>
      </div>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="jenis" value={jenisAktif} />
        <div className="min-w-[240px] flex-1">
          <label className="field-label">Cari nama atau NIP</label>
          <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Cari
        </button>
      </form>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="col-nama px-4 py-2.5">Pegawai</th>
              <th className="px-4 py-2.5">Bank</th>
              <th className="px-4 py-2.5">Nomor Rekening</th>
              <th className="col-nama px-4 py-2.5">Nama Rekening</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Tidak ada rekening {jenisAktif} untuk filter ini.
                </td>
              </tr>
            )}
            {list.map((r) => (
              <tr key={r.id} className="border-b border-line-2">
                <td className="col-nama px-4 py-2.5">
                  <span className="font-semibold text-ink">{r.pegawai.nama}</span>
                  <span className="block font-mono text-xs text-muted">{r.pegawai.nip}</span>
                </td>
                <td className="px-4 py-2.5 text-ink-2">
                  {r.namaBank}
                  <span className="block font-mono text-xs text-muted">{r.kodeBankSpan}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-ink-2">{r.nomorRekening}</td>
                <td className="col-nama px-4 py-2.5 text-ink-2">{r.namaRekening ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {jumlah > list.length && (
        <p className="mt-2 text-xs text-muted">
          Menampilkan {list.length} dari {jumlah} baris - persempit dengan pencarian nama/NIP.
        </p>
      )}

      <div className="card mt-6 border-l-4 border-l-gold p-4">
        <p className="text-sm font-bold text-ink">Data rekening bank = data pribadi finansial</p>
        <p className="mt-1 text-sm text-muted">
          Sebelumnya kolom rekening sengaja tidak disimpan. Keputusan itu dicabut karena Web Gaji memang
          membutuhkannya. Konsekuensinya database ini sekarang menyimpan rekening bank ribuan pegawai, sementara
          aplikasinya masih jalan di HTTP dengan password = NIP. Ini WAJIB diamankan sebelum dibuka ke jaringan yang
          lebih luas.
        </p>
      </div>
    </main>
  );
}
