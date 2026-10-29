import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewDashboardLintasUnit, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../../components/feedback/AksesDitolak";
import { DashboardLintasUnit } from "../../components/dashboard/DashboardLintasUnit";

export const dynamic = "force-dynamic";

export default async function PpabpDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    bulan?: string;
    tahun?: string;
    satker?: string;
    // Milik TABEL monitoring di dashboard, bukan filter halaman - lihat
    // TabelMonitoringSatker.tsx. Harus ikut disebut di sini, kalau tidak
    // nilainya tidak pernah sampai ke komponennya.
    q?: string;
    status?: string;
    hal?: string;
    per?: string;
  }>;
}) {
  const params = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  // `!akun` ikut diuji walau `authUser` sudah menjaminnya - tanpa itu TypeScript
  // tidak bisa mempersempit `akun` waktu namanya dipakai di bawah.
  if (!akun || !authUser || !canViewDashboardLintasUnit(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus PPABP/Pimpinan/Admin." />;
  }

  // Tema palet 2026 diuji coba di halaman ini SAJA (permintaan user
  // 2026-10-22) - lihat blok `[data-tema="palet-2026"]` di globals.css.
  // Dipasang di sini, BUKAN di DashboardLintasUnit, karena komponen itu juga
  // dipakai dashboard Pimpinan yang belum ikut berganti palet.
  // `min-h-full` supaya latar #F6F6F6 menutup seluruh kolom konten, bukan
  // cuma setinggi isinya.
  return (
    <div data-tema="palet-2026" className="min-h-full">
      <DashboardLintasUnit
        searchParams={params}
        authUser={authUser}
        readOnly={false}
        nama={akun.nama}
        basePath="/ppabp"
      />
    </div>
  );
}
