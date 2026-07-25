import { prisma } from "../../lib/prisma";
import { evaluasiApproval } from "../../approval/approvalEngine";
import { DEFAULT_TOTAL_JENJANG_APPROVAL_UANG_LEMBUR } from "../../approval/approvalUangLemburService";
import type { KeputusanApproval } from "../../approval/types";
import { ApprovalForm } from "../ApprovalForm";
import { ajukanApprovalUangLemburAction } from "../actions";
import { FilterBar } from "../FilterBar";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

function StatusBadge({ label, warna }: { label: string; warna: "hijau" | "amber" | "merah" | "abu" }) {
  const kelas = {
    hijau: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    merah: "bg-red-100 text-red-800",
    abu: "bg-gray-100 text-gray-700",
  }[warna];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${kelas}`}>
      {label}
    </span>
  );
}

export default async function UangLemburPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = satuanKerjaRows.map((r) => r.satuanKerja);

  const kalkulasiList = await prisma.uangLembur.findMany({
    where: {
      periodeBulan: bulan ? Number(bulan) : undefined,
      periodeTahun: tahun ? Number(tahun) : undefined,
      pegawai: satker ? { satuanKerja: satker } : undefined,
    },
    include: { pegawai: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { pegawai: { nama: "asc" } }],
  });

  const approvalLogSemua = await prisma.approvalLog.findMany({
    where: { referensiTipe: "UANG_LEMBUR", referensiId: { in: kalkulasiList.map((k) => k.id) } },
    orderBy: { timestampAksi: "asc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-xl font-semibold">Uang Lembur</h1>
      <p className="mt-1 text-sm text-gray-500">
        Hasil kalkulasi uang lembur dari job scheduler, siap direview dan disetujui berjenjang.
      </p>

      <FilterBar satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />

      <div className="mt-8 space-y-4">
        {kalkulasiList.length === 0 && (
          <p className="text-sm text-gray-500">
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
            <div key={kalkulasi.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-medium">{kalkulasi.pegawai.nama}</p>
                  <p className="text-sm text-gray-500">
                    NIP {kalkulasi.pegawai.nip} - Periode {kalkulasi.periodeBulan}/{kalkulasi.periodeTahun}
                  </p>
                  <p className="text-xs text-gray-400">{kalkulasi.totalJamLembur} jam lembur</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatRupiah(kalkulasi.totalUangLembur)}</p>
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
                <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                  Catatan validasi: {kalkulasi.catatanAnomali}
                </p>
              )}

              {logSiklusIni.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-gray-500">
                  {logSiklusIni.map((l) => (
                    <li key={l.id}>
                      Jenjang {l.jenjang} - {l.approverNama} ({l.approverJabatan}): {l.keputusan}
                      {l.catatan ? ` - "${l.catatan}"` : ""}
                    </li>
                  ))}
                </ul>
              )}

              {!sudahApproved && evaluasi.outcome === "MENUNGGU_APPROVAL" && evaluasi.jenjangBerikutnya && (
                <ApprovalForm
                  action={ajukanApprovalUangLemburAction}
                  calculationId={kalkulasi.id}
                  jenjangBerikutnya={evaluasi.jenjangBerikutnya}
                />
              )}

              {!sudahApproved && evaluasi.outcome === "PERLU_REVISI" && (
                <p className="mt-3 text-xs text-gray-500">
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
