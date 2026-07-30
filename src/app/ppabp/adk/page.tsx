import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { SearchableSelect } from "../../SearchableSelect";
import { canGenerateAdk, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";
import { kelompokkanPerBank } from "../../../business-logic/rekeningPegawai";

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

  // Bank yang BENAR-BENAR ada di data periode ini - tombol per bank
  // diturunkan dari sini, BUKAN dari daftar bank yang dihardcode. Kalau
  // banknya berubah/nambah, UI ikut sendiri dan tidak ada tombol mati.
  //
  // SAKTI SPP cuma bisa memproses SPP per bank, jadi pemisahan ini bukan
  // kenyamanan - tanpa itu filenya tidak terpakai.
  const tukinPeriode = await prisma.tukinCalculation.findMany({
    where: { periodeBulan: Number(periodeBulan), periodeTahun: Number(periodeTahun), status: "APPROVED" },
    select: { pegawaiId: true },
  });
  const rekeningTukin = await prisma.rekeningPegawai.findMany({
    where: { jenisPembayaran: "TUKIN", pegawaiId: { in: tukinPeriode.map((t) => t.pegawaiId) } },
    select: { pegawaiId: true, kodeBankSpan: true, namaBank: true },
  });
  const bankTukin = kelompokkanPerBank(rekeningTukin);
  const tanpaRekening = tukinPeriode.length - rekeningTukin.length;

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

      {bankTukin.length === 0 ? (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">Belum ada rekening tukin untuk periode ini</p>
          <p className="mt-1 text-sm text-muted">
            Tanpa data rekening, kolom rekening di ADK akan kosong dan Web Gaji tidak bisa memproses pembayarannya -
            dan file tidak bisa dipisah per bank, padahal SAKTI SPP hanya memproses per bank. Upload dulu di{" "}
            <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
              Rekening Pegawai
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="card mt-4 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Bank penerima tukin periode ini</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {bankTukin.map((b) => (
              <li key={b.kodeBankSpan}>
                {b.namaBank} <span className="font-mono text-xs text-muted">({b.kodeBankSpan})</span>:{" "}
                <span className="font-semibold text-ink">{b.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
          {tanpaRekening > 0 && (
            <p className="mt-2 rounded-lg bg-gold-tint px-3 py-2 text-sm text-ink-2">
              <span className="font-semibold">{tanpaRekening} pegawai</span> berstatus APPROVED tapi rekening tukinnya
              belum terdaftar - mereka TIDAK masuk file per bank manapun, dan kolom rekeningnya kosong di file
              &quot;semua bank&quot;. Lengkapi di{" "}
              <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
                Rekening Pegawai
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="card mt-4 divide-y divide-line-2">
        <BarisAdk
          judul="ADK Tunjangan Kinerja - semua bank"
          keterangan="Format daftar bayar 22 kolom. Berisi semua bank sekaligus - untuk pengecekan internal, BUKAN untuk diproses di SAKTI."
          href={`/ppabp/adk/tukin?${query}`}
        />
        {bankTukin.map((b) => (
          <BarisAdk
            key={b.kodeBankSpan}
            judul={`ADK Tukin - ${b.namaBank}`}
            keterangan={`${b.jumlah} pegawai - kode bank SPAN ${b.kodeBankSpan}. Inilah yang dipakai untuk SPP di SAKTI.`}
            href={`/ppabp/adk/tukin?${query}&bank=${encodeURIComponent(b.kodeBankSpan)}`}
          />
        ))}
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
