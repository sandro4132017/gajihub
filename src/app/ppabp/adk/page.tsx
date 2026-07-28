import { getSessionAccount } from "../../../auth/getSessionAccount";
import { SearchableSelect } from "../../SearchableSelect";
import { canGenerateAdk, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";

export const dynamic = "force-dynamic";

export default async function ExportAdkPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const { bulan, tahun } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canGenerateAdk(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengekspor ADK." />;
  }

  const periodeBulan = bulan ?? String(new Date().getMonth() + 1);
  const periodeTahun = tahun ?? String(new Date().getFullYear());
  const query = `bulan=${periodeBulan}&tahun=${periodeTahun}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Export ADK</h1>
      <p className="mt-1 text-sm text-muted">
        Export CSV kalkulasi yang sudah APPROVED untuk diunggah manual ke Web Gaji (belum ada koneksi API resmi).
      </p>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label">Bulan</label>
          <SearchableSelect
            name="bulan"
            className="w-40"
            options={NAMA_BULAN.map((nama, index) => ({ value: String(index + 1), label: nama }))}
            defaultValue={String(periodeBulan)}
          />
        </div>
        <div>
          <label className="field-label">Tahun</label>
          <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-24 py-1.5" />
        </div>
        <button type="submit" className="btn btn-primary">
          Terapkan periode
        </button>
      </form>

      <div className="card mt-4 divide-y divide-line-2">
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-ink">ADK Tunjangan Kinerja</p>
            <p className="text-xs text-muted">CSV baris Tukin berstatus APPROVED periode ini.</p>
          </div>
          <a href={`/ppabp/adk/tukin?${query}`} className="btn btn-primary btn-sm">
            Download
          </a>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-ink">ADK Uang Makan</p>
            <p className="text-xs text-muted">CSV baris Uang Makan berstatus APPROVED periode ini.</p>
          </div>
          <a href={`/ppabp/adk/uang-makan?${query}`} className="btn btn-primary btn-sm">
            Download
          </a>
        </div>
        <div className="flex items-center justify-between p-4">
          <div>
            <p className="font-bold text-ink">ADK Uang Lembur</p>
            <p className="text-xs text-muted">CSV baris Uang Lembur berstatus APPROVED periode ini.</p>
          </div>
          <a href={`/ppabp/adk/uang-lembur?${query}`} className="btn btn-primary btn-sm">
            Download
          </a>
        </div>
      </div>
    </main>
  );
}
