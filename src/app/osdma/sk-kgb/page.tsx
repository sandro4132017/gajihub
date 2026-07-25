import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canApproveSkKgb, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { SetujuTolakForm } from "../SetujuTolakForm";
import { approveSkKgbAction } from "./actions";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { DIAJUKAN: "amber", DISETUJUI: "hijau", DITOLAK: "merah" } as const;

export default async function OsdmaSkKgbPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canApproveSkKgb(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang memberikan approval SK KGB." />;
  }

  const skKgbList = await prisma.skKgb.findMany({ include: { pegawai: true }, orderBy: { createdAt: "desc" } });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Approval SK KGB</h1>
      <p className="mt-1 text-sm text-muted">Lintas satuan kerja - menyetujui langsung memperbarui golongan pegawai.</p>

      <div className="mt-6 space-y-4">
        {skKgbList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada SK KGB diajukan.</p>}
        {skKgbList.map((sk) => (
          <div key={sk.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{sk.pegawai.nama}</p>
                <p className="text-sm text-muted">
                  NIP {sk.pegawai.nip} - {sk.pegawai.satuanKerja}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {sk.nomorSk} - golongan {sk.golonganLama} &rarr; {sk.golonganBaru} - TMT {new Date(sk.tmtKgb).toLocaleDateString("id-ID")}
                </p>
              </div>
              <StatusBadge label={sk.status} warna={WARNA_STATUS[sk.status as keyof typeof WARNA_STATUS] ?? "abu"} />
            </div>
            {sk.status === "DIAJUKAN" && <SetujuTolakForm action={approveSkKgbAction} idFieldName="skKgbId" idValue={sk.id} />}
          </div>
        ))}
      </div>
    </main>
  );
}
