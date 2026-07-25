import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canApproveSkHukumanDisiplin, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { SetujuTolakForm } from "../SetujuTolakForm";
import { approveSkHukdisAction } from "./actions";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { DIAJUKAN: "amber", DISETUJUI: "hijau", DITOLAK: "merah" } as const;

export default async function OsdmaSkHukdisPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canApproveSkHukumanDisiplin(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang memberikan approval SK Hukuman Disiplin." />;
  }

  const skList = await prisma.skHukumanDisiplin.findMany({ include: { pegawai: true }, orderBy: { createdAt: "desc" } });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Approval SK Hukuman Disiplin</h1>
      <p className="mt-1 text-sm text-muted">Lintas satuan kerja.</p>

      <div className="mt-4 rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep">
        TODO(confirm) - alur approval OSDMA untuk SK Hukuman Disiplin ASUMSI dari spesifikasi simulasi, BELUM ada
        konfirmasi resmi dari OSDMA/Biro Hukum. Approval di sini tidak memberi efek potongan Tukin otomatis (Pasal 15
        belum diimplementasikan) - jangan anggap alur ini final buat production.
      </div>

      <div className="mt-6 space-y-4">
        {skList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada SK Hukuman Disiplin diajukan.</p>}
        {skList.map((sk) => (
          <div key={sk.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{sk.pegawai.nama}</p>
                <p className="text-sm text-muted">
                  NIP {sk.pegawai.nip} - {sk.pegawai.satuanKerja}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {sk.nomorSk} - {sk.jenisHukuman} - berlaku sejak {sk.periodeMulaiBulan}/{sk.periodeMulaiTahun}
                </p>
                {sk.keterangan && <p className="mt-1 text-xs text-muted">{sk.keterangan}</p>}
              </div>
              <StatusBadge label={sk.status} warna={WARNA_STATUS[sk.status as keyof typeof WARNA_STATUS] ?? "abu"} />
            </div>
            {sk.status === "DIAJUKAN" && <SetujuTolakForm action={approveSkHukdisAction} idFieldName="skId" idValue={sk.id} />}
          </div>
        ))}
      </div>
    </main>
  );
}
