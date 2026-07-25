import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canReviewPerubahanDataMaster, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";

export const dynamic = "force-dynamic";

function StatTile({ label, nilai, href }: { label: string; nilai: number; href: string }) {
  return (
    <Link href={href} className="rounded-xl border border-line bg-surface-2 p-4 transition hover:border-teal-deep">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-extrabold text-ink">{nilai}</p>
      <p className="mt-1 text-xs font-semibold text-teal-deep">Lihat &rarr;</p>
    </Link>
  );
}

export default async function OsdmaDashboardPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  // canReviewPerubahanDataMaster dipakai sebagai guard landing page ini -
  // fungsi paling umum buat "OSDMA berwenang atas perubahan data master",
  // guard per-fitur yang lebih spesifik tetap dicek di masing-masing
  // halaman (canApproveBandingFinal/canApproveSkKgb/dst).
  if (!authUser || !canReviewPerubahanDataMaster(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus OSDMA." />;
  }

  const [bandingMenunggu, skKgbMenunggu, skHukdisMenunggu] = await Promise.all([
    prisma.banding.count({ where: { status: "MENUNGGU_APPROVAL_FINAL" } }),
    prisma.skKgb.count({ where: { status: "DIAJUKAN" } }),
    prisma.skHukumanDisiplin.count({ where: { status: "DIAJUKAN" } }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard OSDMA</h1>
      <p className="mt-1 text-sm text-muted">Approval final lintas satuan kerja & pemutakhiran SK pegawai.</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <StatTile label="Banding menunggu final" nilai={bandingMenunggu} href="/osdma/banding" />
        <StatTile label="SK KGB menunggu" nilai={skKgbMenunggu} href="/osdma/sk-kgb" />
        <StatTile label="SK Hukuman Disiplin menunggu" nilai={skHukdisMenunggu} href="/osdma/sk-hukuman-disiplin" />
      </div>

      <div className="mt-6">
        <Link href="/osdma/update-sk" className="btn btn-primary">
          Update SK Struktural/Fungsional
        </Link>
      </div>
    </main>
  );
}
