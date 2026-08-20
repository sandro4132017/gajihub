import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaGajiInduk, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { PencarianDebounce } from "../../PencarianDebounce";
import { UploadBasisDataGajiForm } from "./UploadBasisDataGajiForm";

export const dynamic = "force-dynamic";

/**
 * BASIS DATA GAJI - identitas pembayaran versi Web Gaji Kemenkeu.
 *
 * Alasan halaman ini ada: nama di Web Gaji ditulis berbeda dari SIAP (umumnya
 * karena gelar), dan yang berlaku di berkas pembayaran adalah penulisan Web
 * Gaji. `Pegawai.nama` tidak bisa dipakai maupun dikoreksi untuk keperluan
 * ini - kolom itu cermin SIAP dan ditimpa ulang tiap sinkronisasi.
 */
const MAKS_BARIS_TAMPIL = 200;

const samakan = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

export default async function BasisDataGajiPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; beda?: string }>;
}) {
  const { q, beda } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaGajiInduk(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola basis data gaji." />;
  }

  const cari = q?.trim();
  const hanyaBeda = beda === "1";

  const [jumlahIdentitas, totalAktif, tercakupAktif, terbaru, list] = await Promise.all([
    prisma.identitasWebGaji.count(),
    prisma.pegawai.count({ where: { statusPegawai: "AKTIF" } }),
    prisma.identitasWebGaji.count({ where: { pegawai: { statusPegawai: "AKTIF" } } }),
    prisma.identitasWebGaji.findFirst({
      orderBy: { diunggahPada: "desc" },
      select: { diunggahPada: true, sourceFileName: true, diunggahOleh: { select: { nama: true } } },
    }),
    prisma.identitasWebGaji.findMany({
      where: cari
        ? {
            pegawai: {
              OR: [{ nama: { contains: cari, mode: "insensitive" } }, { nip: { contains: cari } }],
            },
          }
        : {},
      // Tanpa kata kunci, halaman ini tetap perlu bisa dibuka walau isinya
      // ribuan baris - jadi dipotong, dan jumlah sebenarnya disebut di atas.
      take: hanyaBeda ? 2000 : MAKS_BARIS_TAMPIL,
      orderBy: { pegawai: { nama: "asc" } },
      select: {
        id: true,
        nama: true,
        jenisPegawai: true,
        kodeSatker: true,
        namaSatuanKerja: true,
        pegawai: { select: { nip: true, nama: true, satuanKerja: true } },
      },
    }),
  ]);

  const tampil = hanyaBeda ? list.filter((r) => samakan(r.nama) !== samakan(r.pegawai.nama)) : list;
  const belumTercakup = Math.max(0, totalAktif - tercakupAktif);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link href="/ppabp" className="text-sm font-semibold text-teal-deep hover:underline">
        &larr; Kembali ke Dashboard PPABP
      </Link>
      <h1 className="mt-2 text-xl font-extrabold tracking-tight text-ink">Basis Data Gaji (Web Gaji Kemenkeu)</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted">
        Nama pegawai di berkas <strong>ADK</strong> diambil dari sini, bukan dari SIAP. Penulisan di Web Gaji berbeda
        (umumnya karena gelar), dan yang dikenali saat pembayaran adalah penulisan Web Gaji. Nama versi SIAP tetap
        dipakai di seluruh halaman lain - kolom itu tidak diubah.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Identitas tersimpan</p>
          <p className="mt-0.5 font-mono text-2xl font-bold text-ink">{jumlahIdentitas.toLocaleString("id-ID")}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pegawai aktif tercakup</p>
          <p className="mt-0.5 font-mono text-2xl font-bold text-ink">
            {tercakupAktif.toLocaleString("id-ID")}
            <span className="text-base font-normal text-muted"> / {totalAktif.toLocaleString("id-ID")}</span>
          </p>
        </div>
        <div className={`card p-4 ${belumTercakup > 0 ? "border-gold/50 bg-gold-tint" : ""}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Memakai nama SIAP (cadangan)</p>
          <p className="mt-0.5 font-mono text-2xl font-bold text-ink">{belumTercakup.toLocaleString("id-ID")}</p>
        </div>
      </div>

      {terbaru && (
        <p className="mt-2 text-xs text-muted">
          Unggahan terakhir: <strong>{terbaru.sourceFileName ?? "(tanpa nama berkas)"}</strong> oleh{" "}
          {terbaru.diunggahOleh.nama}, {terbaru.diunggahPada.toLocaleString("id-ID")}
        </p>
      )}

      <UploadBasisDataGajiForm />

      <div className="card mt-6 p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <label className="field-label">Cari nama atau NIP</label>
            <PencarianDebounce defaultValue={cari ?? ""} placeholder="Ketik nama atau NIP..." />
          </div>
          {hanyaBeda && <input type="hidden" name="beda" value="1" />}
          <button type="submit" className="btn btn-secondary">
            Cari
          </button>
          <Link
            href={hanyaBeda ? `/ppabp/basis-data-gaji${cari ? `?q=${encodeURIComponent(cari)}` : ""}` : `/ppabp/basis-data-gaji?beda=1${cari ? `&q=${encodeURIComponent(cari)}` : ""}`}
            className="btn btn-secondary"
          >
            {hanyaBeda ? "Tampilkan semua" : "Hanya yang beda dari SIAP"}
          </Link>
        </form>
      </div>

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">NIP</th>
              <th className="col-nama px-3 py-2.5">Nama di SIAP</th>
              <th className="col-nama px-3 py-2.5">Nama di Web Gaji (dipakai ADK)</th>
              <th className="px-3 py-2.5">Jenis</th>
              <th className="px-3 py-2.5">Kode satker</th>
            </tr>
          </thead>
          <tbody>
            {tampil.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted">
                  {jumlahIdentitas === 0
                    ? "Belum ada data - unggah berkas basis data gaji di atas."
                    : "Tidak ada baris yang cocok dengan pencarian ini."}
                </td>
              </tr>
            )}
            {tampil.map((r) => {
              const beda = samakan(r.nama) !== samakan(r.pegawai.nama);
              return (
                <tr key={r.id} className="border-b border-line-2">
                  <td className="px-3 py-2.5 font-mono text-xs text-muted">{r.pegawai.nip}</td>
                  <td className={`col-nama px-3 py-2.5 ${beda ? "text-muted" : "text-ink-2"}`}>{r.pegawai.nama}</td>
                  <td className="col-nama px-3 py-2.5 font-semibold text-ink">{r.nama}</td>
                  <td className="px-3 py-2.5 text-ink-2">{r.jenisPegawai ?? "-"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-ink-2">
                    {r.kodeSatker ?? "-"}
                    {r.namaSatuanKerja && (
                      <span className="block font-sans text-xs text-muted">{r.namaSatuanKerja}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!hanyaBeda && jumlahIdentitas > tampil.length && (
        <p className="mt-2 text-xs text-muted">
          Menampilkan {tampil.length.toLocaleString("id-ID")} dari {jumlahIdentitas.toLocaleString("id-ID")} baris -
          pakai pencarian untuk mempersempit.
        </p>
      )}
    </main>
  );
}
