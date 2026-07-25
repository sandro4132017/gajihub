import { prisma } from "../../lib/prisma";
import { evaluasiApproval } from "../../approval/approvalEngine";
import { DEFAULT_TOTAL_JENJANG_APPROVAL } from "../../approval/approvalTukinService";
import type { KeputusanApproval } from "../../approval/types";
import { ApprovalForm } from "../ApprovalForm";
import { ajukanApprovalTukinAction } from "../actions";
import { FilterBar } from "../FilterBar";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import { StatusBadge } from "../StatusBadge";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function TukinPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

  // Guard eksplisit: PEGAWAI diarahkan ke dashboard self-service sendiri
  // (/saya), bukan halaman approver ini - lihat canViewApproverDashboard +
  // role matrix di CLAUDE.md. TODO(confirm): ADMIN SEKARANG BOLEH lihat
  // halaman ini (privilege penuh, lihat enum Role di schema.prisma) - ini
  // BUKAN desain final untuk production.
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewApproverDashboard(authUser)) {
    return authUser?.role === "PEGAWAI" ? (
      <AksesDitolak
        pesan="Halaman ini untuk approver, bukan pegawai."
        hrefAlternatif="/saya"
        labelAlternatif="Lihat data saya"
      />
    ) : (
      <AksesDitolak pesan="Role kamu tidak berwenang melihat data kalkulasi payroll." />
    );
  }

  // KASUBAG_TU cuma boleh lihat rekap unit kerjanya sendiri (role matrix) -
  // paksa filter ke unitnya, abaikan ?satker= dari query kalau ada.
  const satkerEfektif = resolveSatkerEfektif(authUser, satker);

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  const kalkulasiList = await prisma.tukinCalculation.findMany({
    where: {
      periodeBulan: bulan ? Number(bulan) : undefined,
      periodeTahun: tahun ? Number(tahun) : undefined,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { pegawai: { nama: "asc" } }],
  });

  const approvalLogSemua = await prisma.approvalLog.findMany({
    where: { referensiTipe: "TUKIN", referensiId: { in: kalkulasiList.map((k) => k.id) } },
    orderBy: { timestampAksi: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Tukin</h1>
      <p className="mt-1 text-sm text-muted">
        Hasil kalkulasi tukin dari job scheduler, siap direview dan disetujui berjenjang.
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />

      <div className="mt-8 space-y-4">
        {kalkulasiList.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Tidak ada data untuk filter ini. Kalau memang belum ada data sama sekali, jalankan job scheduler dulu (npx tsx src/jobs/runTukinJobDemo.ts).
          </p>
        )}

        {kalkulasiList.map((kalkulasi) => {
          const logSiklusIni = approvalLogSemua.filter(
            (l) => l.referensiId === kalkulasi.id && l.timestampAksi >= kalkulasi.calculatedAt
          );
          const evaluasi = evaluasiApproval(
            logSiklusIni.map((l) => ({ jenjang: l.jenjang, keputusan: l.keputusan as KeputusanApproval })),
            DEFAULT_TOTAL_JENJANG_APPROVAL
          );

          const sudahApproved = kalkulasi.status === "APPROVED";

          return (
            <div key={kalkulasi.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{kalkulasi.pegawai.nama}</p>
                  <p className="text-sm text-muted">
                    NIP {kalkulasi.pegawai.nip} - Periode {kalkulasi.periodeBulan}/{kalkulasi.periodeTahun}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-bold text-ink">{formatRupiah(kalkulasi.tukinBersih)}</p>
                  {sudahApproved && <StatusBadge label="Disetujui" warna="hijau" />}
                  {!sudahApproved && evaluasi.outcome === "MENUNGGU_APPROVAL" && (
                    <StatusBadge label={`Menunggu jenjang ${evaluasi.jenjangBerikutnya}`} warna="amber" />
                  )}
                  {!sudahApproved && evaluasi.outcome === "PERLU_REVISI" && (
                    <StatusBadge label="Perlu revisi" warna="merah" />
                  )}
                </div>
              </div>

              {kalkulasi.catatanAnomali && (
                <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
                  Catatan validasi: {kalkulasi.catatanAnomali}
                </p>
              )}

              {logSiklusIni.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-muted">
                  {logSiklusIni.map((l) => (
                    <li key={l.id}>
                      Jenjang {l.jenjang} - {l.approverNama} ({l.approverJabatan}): {l.keputusan}
                      {l.catatan ? ` - "${l.catatan}"` : ""}
                    </li>
                  ))}
                </ul>
              )}

              {/* PIMPINAN: role matrix "read-only, tanpa approval/ubah data apapun" -
                  server action sudah menolak PIMPINAN juga, ini cuma biar tombolnya
                  tidak nongol dead-end di UI (lihat DashboardLintasUnit.tsx buat
                  pola readOnly yang sama di dashboard lintas unit PPABP/Pimpinan). */}
              {!sudahApproved && authUser.role !== "PIMPINAN" && evaluasi.outcome === "MENUNGGU_APPROVAL" && evaluasi.jenjangBerikutnya && (
                <ApprovalForm
                  action={ajukanApprovalTukinAction}
                  calculationId={kalkulasi.id}
                  jenjangBerikutnya={evaluasi.jenjangBerikutnya}
                />
              )}

              {!sudahApproved && evaluasi.outcome === "PERLU_REVISI" && (
                <p className="mt-3 text-xs text-muted">
                  Perlu recalculation (job scheduler dijalankan ulang) sebelum bisa diajukan approval lagi.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
