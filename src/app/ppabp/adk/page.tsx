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
        Kalkulasi yang sudah <strong>APPROVED</strong> untuk diunggah manual ke Web Gaji (belum ada koneksi API
        resmi). Tersedia dua format: <strong>Excel</strong> (.xlsx) dan <strong>TXT</strong> (tab-separated, dengan
        baris total di akhir) - isinya identik, cuma bungkusnya beda.
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
        <BarisAdk
          judul="ADK Tunjangan Kinerja"
          keterangan="Format daftar bayar 22 kolom, sama dengan ADK Tukin resmi."
          href={`/ppabp/adk/tukin?${query}`}
        />
        <BarisAdk
          judul="ADK Uang Makan"
          keterangan="Hari kerja, hari dibayar, tarif per golongan, dan totalnya."
          href={`/ppabp/adk/uang-makan?${query}`}
        />
        <BarisAdk
          judul="ADK Uang Lembur"
          keterangan="Jam hari kerja & hari libur dipisah, plus uang makan lemburnya."
          href={`/ppabp/adk/uang-lembur?${query}`}
        />
      </div>
    </main>
  );
}

/**
 * Satu baris jenis ADK dengan DUA tombol format. Keduanya menunjuk ke Route
 * Handler yang sama, cuma beda `?format=` - jadi isinya dijamin identik
 * (barisnya disusun sekali di src/business-logic/adk.ts).
 *
 * Tetap `<a href>` biasa, bukan tombol ber-JavaScript, supaya download tetap
 * jalan tanpa JS - konsisten dengan halaman lain di proyek ini.
 */
function BarisAdk({ judul, keterangan, href }: { judul: string; keterangan: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-bold text-ink">{judul}</p>
        <p className="text-xs text-muted">{keterangan}</p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <a href={`${href}&format=xlsx`} className="btn btn-primary btn-sm">
          Excel (.xlsx)
        </a>
        <a href={`${href}&format=txt`} className="btn btn-ghost btn-sm">
          TXT
        </a>
      </div>
    </div>
  );
}
