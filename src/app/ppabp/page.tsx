import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewDashboardLintasUnit, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";
import { DashboardLintasUnit } from "../DashboardLintasUnit";

export const dynamic = "force-dynamic";

export default async function PpabpDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const params = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  // `!akun` ikut diuji walau `authUser` sudah menjaminnya - tanpa itu TypeScript
  // tidak bisa mempersempit `akun` waktu namanya dipakai di bawah.
  if (!akun || !authUser || !canViewDashboardLintasUnit(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus PPABP/Pimpinan/Admin." />;
  }

  return <DashboardLintasUnit searchParams={params} authUser={authUser} readOnly={false} nama={akun.nama} />;
}
