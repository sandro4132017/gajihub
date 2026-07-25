import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canApproveBandingFinal, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { SetujuTolakForm } from "../SetujuTolakForm";
import { approveBandingFinalAction } from "./actions";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { MENUNGGU_APPROVAL_FINAL: "amber", DISETUJUI: "hijau", DITOLAK: "merah" } as const;
const LABEL_STATUS = { MENUNGGU_APPROVAL_FINAL: "Menunggu approval final", DISETUJUI: "Disetujui", DITOLAK: "Ditolak" } as const;

export default async function OsdmaBandingPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canApproveBandingFinal(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang memberikan approval final banding." />;
  }

  // Cuma banding yang sudah lolos jenjang 1 (verifikasi Kasubag TU) yang
  // relevan buat OSDMA - status DIAJUKAN (masih di jenjang 1) sengaja tidak
  // ditampilkan di sini, itu urusan Kasubag TU (src/app/kasubag/banding/).
  const bandingList = await prisma.banding.findMany({
    where: { status: { in: ["MENUNGGU_APPROVAL_FINAL", "DISETUJUI", "DITOLAK"] } },
    include: { pegawai: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Approval Final Banding</h1>
      <p className="mt-1 text-sm text-muted">Jenjang 2 - lintas satuan kerja, sudah lolos verifikasi Kasubag TU.</p>

      <div className="mt-6 space-y-4">
        {bandingList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada banding yang menunggu approval final.</p>}
        {bandingList.map((b) => (
          <div key={b.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{b.pegawai.nama}</p>
                <p className="text-sm text-muted">
                  NIP {b.pegawai.nip} - {b.pegawai.satuanKerja} - {b.referensiTipe} - Periode {b.periodeBulan}/{b.periodeTahun}
                </p>
              </div>
              <StatusBadge label={LABEL_STATUS[b.status as keyof typeof LABEL_STATUS] ?? b.status} warna={WARNA_STATUS[b.status as keyof typeof WARNA_STATUS] ?? "abu"} />
            </div>
            <p className="mt-2 text-sm text-ink-2">{b.alasan}</p>
            {b.status === "MENUNGGU_APPROVAL_FINAL" && (
              <SetujuTolakForm action={approveBandingFinalAction} idFieldName="bandingId" idValue={b.id} />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
