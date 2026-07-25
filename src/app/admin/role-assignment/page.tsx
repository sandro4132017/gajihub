import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { AssignmentRow } from "./AssignmentRow";

export const dynamic = "force-dynamic";

export default async function RoleAssignmentPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaAssignmentRole(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola assignment role." />;
  }

  const userList = await prisma.user.findMany({ orderBy: { nama: "asc" } });

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Kelola Assignment Role</h1>
      <p className="mt-1 text-sm text-muted">
        Ubah role/satuan kerja/status aktif akun secara langsung - BEDA dari alur usulan PPABP (lihat menu &quot;Usulan
        Perubahan Role&quot;), ini jalur administratif langsung tanpa proses usul-lalu-eksekusi.
      </p>

      <div className="card mt-6 divide-y divide-line-2">
        {userList.map((u) => (
          <AssignmentRow key={u.id} user={u} />
        ))}
      </div>
    </main>
  );
}
