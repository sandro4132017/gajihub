import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canMonitorKesehatanSistem, canKonfigurasiAdapter, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { HALAMAN } from "../../layoutHalaman";

export const dynamic = "force-dynamic";

// Sumber data eksternal beserta cara ambilnya. Kolom "status" menjawab satu
// pertanyaan saja: apakah datanya masuk sendiri lewat koneksi, atau menunggu
// orang mengunggah/mengunduh berkas.
//
// SIAP & e-Presensi diakses READ-ONLY - keduanya sistem produksi yang sedang
// melayani pegawai, dan Gajihub tidak pernah menulis apa pun ke sana.
const ADAPTER_LIST = [
  {
    sistem: "SIAP",
    adapter: "Koneksi langsung (baca saja)",
    status: "Tersambung",
    catatan: "Identitas, jabatan, dan kelas jabatan pegawai. Ditarik lewat sinkronisasi data pegawai.",
  },
  {
    sistem: "e-Presensi",
    adapter: "Koneksi langsung (baca saja)",
    status: "Tersambung",
    catatan: "Kehadiran harian, jam masuk/pulang, dan cuti. Ditarik per periode dari menu Presensi.",
  },
  {
    sistem: "e-Kinerja BKN",
    adapter: "Unggah rekap",
    status: "Manual",
    catatan: "Predikat kinerja diunggah dari rekap portal BKN - belum ada koneksi langsung.",
  },
  {
    sistem: "Web Gaji Kemenkeu",
    adapter: "Berkas ADK",
    status: "Manual",
    catatan: "Berkas Excel/TXT diunduh dari menu Export ADK, lalu diunggah ke Web Gaji.",
  },
  {
    sistem: "SAKTI",
    adapter: "-",
    status: "Belum ada",
    catatan: "SPP/SP2D - di luar cakupan integrasi saat ini.",
  },
] as const;

export default async function SistemPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canMonitorKesehatanSistem(authUser) || !canKonfigurasiAdapter(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus Admin." />;
  }

  const [totalPegawai, totalUser, totalAuditTrail, auditTerakhir, tukinTerbaru] = await Promise.all([
    prisma.pegawai.count(),
    prisma.user.count(),
    prisma.auditTrail.count(),
    prisma.auditTrail.findMany({ orderBy: { timestamp: "desc" }, take: 10 }),
    prisma.tukinCalculation.findFirst({ orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }], select: { periodeBulan: true, periodeTahun: true, calculatedAt: true } }),
  ]);

  return (
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Konfigurasi & Kesehatan Sistem</h1>
      <p className="mt-1 text-sm text-muted">
        Ringkasan isi database dan cara Gajihub mengambil data dari sistem lain.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total pegawai</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">{totalPegawai.toLocaleString("id-ID")}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total akun User</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">{totalUser}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total audit trail</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">{totalAuditTrail.toLocaleString("id-ID")}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Periode kalkulasi terbaru</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">
            {tukinTerbaru ? `${tukinTerbaru.periodeBulan}/${tukinTerbaru.periodeTahun}` : "-"}
          </p>
        </div>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <h2 className="p-4 pb-0 text-sm font-bold text-ink">Konfigurasi Adapter</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="col-nama px-4 py-2.5">Sistem Eksternal</th>
              <th className="px-4 py-2.5">Cara Ambil Data</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {ADAPTER_LIST.map((a) => (
              <tr key={a.sistem} className="border-b border-line-2">
                <td className="col-nama px-4 py-2.5 font-semibold text-ink">{a.sistem}</td>
                <td className="px-4 py-2.5 text-xs text-ink-2">{a.adapter}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`chip ${
                      a.status === "Tersambung" ? "chip-navy" : a.status === "Manual" ? "chip-draft" : "chip-wait"
                    }`}
                  >
                    {a.status}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">{a.catatan}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-4 pt-2 text-xs text-muted">
          Sambungan ke sistem luar diatur lewat konfigurasi server, bukan dari halaman ini.
        </p>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <h2 className="p-4 pb-0 text-sm font-bold text-ink">Aktivitas Terbaru (Audit Trail)</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">Waktu</th>
              <th className="px-4 py-2.5">Entitas</th>
              <th className="px-4 py-2.5">Aksi</th>
              <th className="px-4 py-2.5">Aktor</th>
            </tr>
          </thead>
          <tbody>
            {auditTerakhir.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted">
                  Belum ada aktivitas tercatat.
                </td>
              </tr>
            )}
            {auditTerakhir.map((a) => (
              <tr key={a.id} className="border-b border-line-2">
                <td className="px-4 py-2.5 font-mono text-xs text-ink-2">{a.timestamp.toLocaleString("id-ID")}</td>
                <td className="px-4 py-2.5 text-ink-2">{a.entitas}</td>
                <td className="px-4 py-2.5">
                  <span className="chip chip-navy">{a.aksi}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{a.aktor}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
