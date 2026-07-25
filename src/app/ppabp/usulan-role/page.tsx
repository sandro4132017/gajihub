import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUsulkanPerubahanRole, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { LABEL_ROLE } from "../../../auth/roleLabel";
import { UsulkanPerubahanRoleForm } from "./UsulkanPerubahanRoleForm";

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
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Usulan Perubahan Role</h1>
      <p className="mt-1 text-sm text-muted">PPABP mengusulkan, eksekusi final ada di Admin.</p>

      <UsulkanPerubahanRoleForm userList={userList} />

      <div className="mt-6 space-y-3">
        {usulanList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada usulan perubahan role.</p>}
        {usulanList.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{u.user.nama}</p>
                <p className="text-sm text-muted">
                  {LABEL_ROLE[u.roleSaatIni]} &rarr; {LABEL_ROLE[u.roleDiusulkan]} - diusulkan oleh {u.diusulkanOleh.nama}
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
