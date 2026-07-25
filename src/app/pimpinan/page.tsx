import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewDashboardLintasUnit, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";
import { DashboardLintasUnit } from "../DashboardLintasUnit";

export const dynamic = "force-dynamic";

/**
 * Dashboard Pimpinan - role matrix: "dashboard lintas unit SAMA seperti
 * PPABP, read-only (tanpa approval/ubah data apapun)". PIMPINAN TIDAK
 * punya fungsi otorisasi lain di permissions.ts selain
 * canViewDashboardLintasUnit (tidak ada canApprove/canUbah apapun buat
 * role ini, SENGAJA - lihat komentar di permissions.ts) - jadi halaman ini
 * SATU-SATUNYA fitur khusus Pimpinan, reuse penuh DashboardLintasUnit
 * dengan readOnly=true (bukan duplikasi logic dari /ppabp/page.tsx).
 */
export default async function PimpinanDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const params = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewDashboardLintasUnit(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus PPABP/Pimpinan/Admin." />;
  }

  return <DashboardLintasUnit searchParams={params} authUser={authUser} readOnly={true} />;
}
