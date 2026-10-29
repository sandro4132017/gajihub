import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUsulkanPerubahanRole, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { StatusBadge } from "../../../components/feedback/StatusBadge";
import { LABEL_ROLE, labelRole } from "../../../auth/roleLabel";
import { UsulkanPerubahanRoleForm } from "./UsulkanPerubahanRoleForm";
import { HALAMAN } from "../../../components/layout/layoutHalaman";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { MENUNGGU: "amber", DIEKSEKUSI: "hijau", DITOLAK: "merah" } as const;

export default async function UsulanPerubahanRolePage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canUsulkanPerubahanRole(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengusulkan perubahan role." />;
  }

  const [userList, usulanList] = await Promise.all([
    prisma.user.findMany({ where: { aktif: true }, orderBy: { nama: "asc" } }),
    prisma.usulanPerubahanRole.findMany({ include: { user: true, diusulkanOleh: true, diputuskanOleh: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className={HALAMAN}>
      {/* Kepala halaman berpola sama dengan Presensi & Predikat Kinerja:
          judul navy, satu baris lingkup, satu baris deskripsi. */}
      <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Usulan Perubahan Role</h1>
      <p className="mt-0.5 text-sm font-bold text-ink">Hak akses akun Gajihub</p>
      <p className="mt-2 text-sm text-biru">
        PPABP mengusulkan perubahan role; eksekusinya tetap di tangan Admin.
      </p>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-muted">Ajukan usulan</h2>
      <UsulkanPerubahanRoleForm userList={userList} />

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">
        Riwayat usulan (<span className="font-mono">{usulanList.length}</span>)
      </h2>
      <div className="mt-2 space-y-3">
        {usulanList.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Belum ada usulan perubahan role. Usulan yang diajukan lewat form di atas muncul di sini sampai Admin
            mengeksekusi atau menolaknya.
          </p>
        )}
        {usulanList.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{u.user?.nama ?? "(User tidak ditemukan)"}</p>
                <p className="text-sm text-muted">
                  {labelRole(u.roleSaatIni, u.user?.satuanKerja)} &rarr; {LABEL_ROLE[u.roleDiusulkan] ?? u.roleDiusulkan} - diusulkan oleh{" "}
                  {u.diusulkanOleh?.nama ?? "(Tidak diketahui)"}
                </p>
                {u.alasan && <p className="mt-1 text-sm text-ink-2">{u.alasan}</p>}
                {u.diputuskanOleh && (
                  <p className="mt-1 text-xs text-muted">
                    Diputuskan oleh {u.diputuskanOleh.nama} pada {u.diputuskanPada?.toLocaleDateString("id-ID")}
                  </p>
                )}
              </div>
              <StatusBadge label={u.status} warna={WARNA_STATUS[u.status as keyof typeof WARNA_STATUS] ?? "abu"} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
