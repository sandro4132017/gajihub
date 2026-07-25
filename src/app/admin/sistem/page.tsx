import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canMonitorKesehatanSistem, canKonfigurasiAdapter, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";

export const dynamic = "force-dynamic";

const ADAPTER_LIST = [
  { sistem: "SIAP", adapter: "MockSiapAdapter", status: "Mock", catatan: "Identitas & kelas jabatan - belum ada akses API resmi SIAP." },
  { sistem: "e-Presensi", adapter: "MockPresensiAdapter", status: "Mock", catatan: "Rekap kehadiran - belum ada akses API resmi e-Presensi." },
  { sistem: "e-Kinerja BKN", adapter: "MockEKinerjaAdapter", status: "Mock", catatan: "Predikat kinerja - alur upload manual rekap dari portal BKN, belum ada PKS/MoU API." },
  { sistem: "Web Gaji Kemenkeu", adapter: "-", status: "Belum ada", catatan: "Export ADK manual (CSV) - lihat /ppabp/adk, belum ada koneksi API." },
  { sistem: "SAKTI", adapter: "-", status: "Belum ada", catatan: "SPP/SP2D - di luar cakupan integrasi saat ini." },
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
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Konfigurasi & Kesehatan Sistem</h1>
      <p className="mt-1 text-sm text-muted">
        Monitoring dasar + status adapter - BUKAN kontrol panel penuh, cuma visibilitas yang tersedia dari data yang
        sudah ada (tidak ada uptime/metrik eksternal beneran karena sistem ini prototype/simulasi).
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
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5">Sistem Eksternal</th>
              <th className="px-4 py-2.5">Adapter Aktif</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {ADAPTER_LIST.map((a) => (
              <tr key={a.sistem} className="border-b border-line-2">
                <td className="px-4 py-2.5 font-semibold text-ink">{a.sistem}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink-2">{a.adapter}</td>
                <td className="px-4 py-2.5">
                  <span className={`chip ${a.status === "Mock" ? "chip-wait" : "chip-draft"}`}>{a.status}</span>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">{a.catatan}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="p-4 pt-2 text-xs text-muted">
          Belum ada mekanisme swap adapter dari UI (semua binding masih hardcode di composition root/job scheduler) -
          adapter pattern SUDAH disiapkan buat ini (src/adapters/), tapi belum ada kebutuhan konkret buat toggle-nya
          lewat halaman selama akses API resmi belum tersedia.
        </p>
      </div>

      <div className="card mt-6 overflow-x-auto">
        <h2 className="p-4 pb-0 text-sm font-bold text-ink">Aktivitas Terbaru (Audit Trail)</h2>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
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
