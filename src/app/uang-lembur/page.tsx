import { prisma } from "../../lib/prisma";
import { evaluasiApproval } from "../../approval/approvalEngine";
import { DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR } from "../../approval/approvalUangLemburService";
import type { KeputusanApproval } from "../../approval/types";
import { ApprovalForm } from "../ApprovalForm";
import { ajukanApprovalUangLemburAction } from "../actions";
import { FilterBar } from "../FilterBar";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import { StatusBadge } from "../StatusBadge";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function UangLemburPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

  // Guard sama dengan Dashboard Tukin (lihat src/app/tukin/page.tsx) -
  // KASUBAG_TU discope ke unit kerjanya sendiri, PEGAWAI diarahkan ke
  // dashboard self-service (/saya).
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

  const kalkulasiList = await prisma.uangLembur.findMany({
    where: {
      periodeBulan: bulan ? Number(bulan) : undefined,
      periodeTahun: tahun ? Number(tahun) : undefined,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { pegawai: { nama: "asc" } }],
  });

  const approvalLogSemua = await prisma.approvalLog.findMany({
    where: { referensiTipe: "UANG_LEMBUR", referensiId: { in: kalkulasiList.map((k) => k.id) } },
    orderBy: { timestampAksi: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Uang Lembur</h1>
      <p className="mt-1 text-sm text-muted">
        Hasil kalkulasi uang lembur dari job scheduler, siap direview dan disetujui berjenjang.
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satkerEfektif} />

      <div className="mt-8 space-y-4">
        {kalkulasiList.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Tidak ada data untuk filter ini. Kalau memang belum ada data sama sekali, jalankan job scheduler dulu (npx tsx src/jobs/runUangLemburJobDemo.ts).
          </p>
        )}

        {kalkulasiList.map((kalkulasi) => {
          const logSiklusIni = approvalLogSemua.filter(
            (l) => l.referensiId === kalkulasi.id && l.timestampAksi >= kalkulasi.calculatedAt
          );
          const evaluasi = evaluasiApproval(
            logSiklusIni.map((l) => ({ jenjang: l.jenjang, keputusan: l.keputusan as KeputusanApproval })),
            DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR
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
                  <p className="text-xs text-muted/80">{kalkulasi.totalJamLembur} jam lembur</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-bold text-ink">{formatRupiah(kalkulasi.totalUangLembur)}</p>
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

              {/* PIMPINAN: read-only, lihat catatan sama di src/app/tukin/page.tsx */}
              {!sudahApproved && authUser.role !== "PIMPINAN" && evaluasi.outcome === "MENUNGGU_APPROVAL" && evaluasi.jenjangBerikutnya && (
                <ApprovalForm
                  action={ajukanApprovalUangLemburAction}
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
