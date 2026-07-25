import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUploadAnggaranRealisasi, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { UploadAnggaranForm } from "./UploadAnggaranForm";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function AnggaranRealisasiPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canUploadAnggaranRealisasi(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola Anggaran & Realisasi." />;
  }

  const [satuanKerjaRows, anggaranList] = await Promise.all([
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
    prisma.anggaranRealisasi.findMany({ orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { satuanKerja: "asc" }] }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Anggaran & Realisasi Belanja Pegawai</h1>
      <p className="mt-1 text-sm text-muted">
        Satu baris = total pagu/realisasi per satuan kerja+periode (belum dipecah per jenis belanja Tukin/Uang
        Makan/Uang Lembur - lihat TODO(confirm) di CLAUDE.md).
      </p>

      <UploadAnggaranForm satuanKerjaList={satuanKerjaRows.map((r) => r.satuanKerja)} />

      <div className="card mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">Satuan Kerja</th>
              <th className="px-4 py-2.5">Periode</th>
              <th className="px-4 py-2.5">Pagu</th>
              <th className="px-4 py-2.5">Realisasi</th>
              <th className="px-4 py-2.5">%</th>
            </tr>
          </thead>
          <tbody>
            {anggaranList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted">
                  Belum ada data Anggaran & Realisasi.
                </td>
              </tr>
            )}
            {anggaranList.map((a) => (
              <tr key={a.id} className="border-b border-line-2">
                <td className="px-4 py-2.5 font-semibold text-ink">{a.satuanKerja}</td>
                <td className="px-4 py-2.5 text-ink-2">
                  {a.periodeBulan}/{a.periodeTahun}
                </td>
                <td className="px-4 py-2.5 font-mono text-ink-2">{formatRupiah(a.pagu)}</td>
                <td className="px-4 py-2.5 font-mono text-ink-2">{formatRupiah(a.realisasi)}</td>
                <td className="px-4 py-2.5 font-mono text-ink-2">{a.pagu > 0 ? ((a.realisasi / a.pagu) * 100).toFixed(1) : "0"}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
