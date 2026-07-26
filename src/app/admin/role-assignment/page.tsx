import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { AssignmentRow } from "./AssignmentRow";
import { BuatAkunBaruForm } from "./BuatAkunBaruForm";

export const dynamic = "force-dynamic";

export default async function RoleAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pegawaiId?: string }>;
}) {
  const { q, pegawaiId } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaAssignmentRole(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola assignment role." />;
  }

  const userList = await prisma.user.findMany({ orderBy: { nama: "asc" } });
  const pegawaiTerpilih = pegawaiId ? await prisma.pegawai.findUnique({ where: { id: pegawaiId } }) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Kelola Assignment Role</h1>
      <p className="mt-1 text-sm text-muted">
        Ubah role/satuan kerja/status aktif akun secara langsung - BEDA dari alur usulan PPABP (lihat menu &quot;Usulan
        Perubahan Role&quot;), ini jalur administratif langsung tanpa proses usul-lalu-eksekusi.
      </p>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">Buat Akun Baru</h2>
      <p className="mt-1 text-xs text-muted">
        Buat akun otorisasi langsung dari data pegawai (tanpa nunggu usulan PPABP) - buat kebutuhan eksekusi cepat
        kalau ada nodin/arahan Pimpinan (mis. pegawai baru dilantik).
      </p>

      <form method="get" className="card mt-3 flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[240px]">
          <label className="field-label">Cari nama atau NIP pegawai</label>
          <input type="text" name="q" defaultValue={q ?? ""} className="field-input" placeholder="Cari pegawai..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Cari
        </button>
      </form>

      {pegawaiTerpilih ? (
        <>
          <div className="card mt-4 p-4">
            <p className="font-bold text-ink">{pegawaiTerpilih.nama}</p>
            <p className="text-sm text-muted">
              NIP {pegawaiTerpilih.nip} - {pegawaiTerpilih.satuanKerja} - {pegawaiTerpilih.jabatan ?? "-"}
            </p>
            <Link href={q ? `/admin/role-assignment?q=${encodeURIComponent(q)}` : "/admin/role-assignment"} className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
              Ganti pegawai
            </Link>
          </div>
          <BuatAkunBaruForm
            pegawai={{ id: pegawaiTerpilih.id, nama: pegawaiTerpilih.nama, nip: pegawaiTerpilih.nip, satuanKerja: pegawaiTerpilih.satuanKerja }}
          />
        </>
      ) : q ? (
        <PegawaiHasilPencarian q={q} />
      ) : null}

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-muted">Akun yang sudah ada</h2>
      <div className="card mt-3 divide-y divide-line-2">
        {userList.map((u) => (
          <AssignmentRow key={u.id} user={u} />
        ))}
      </div>
    </main>
  );
}

async function PegawaiHasilPencarian({ q }: { q: string }) {
  const semuaUserNip = new Set((await prisma.user.findMany({ select: { nip: true } })).map((u) => u.nip));
  const hasil = await prisma.pegawai.findMany({
    where: { OR: [{ nama: { contains: q, mode: "insensitive" } }, { nip: { contains: q } }] },
    orderBy: { nama: "asc" },
    take: 20,
  });

  return (
    <div className="card mt-4 divide-y divide-line-2">
      {hasil.length === 0 && <p className="p-6 text-sm text-muted">Tidak ada pegawai yang cocok.</p>}
      {hasil.map((p) => {
        const sudahPunyaAkun = semuaUserNip.has(p.nip);
        return (
          <div key={p.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-ink">{p.nama}</p>
              <p className="text-xs text-muted">
                NIP {p.nip} - {p.satuanKerja} - {p.jabatan ?? "-"}
              </p>
            </div>
            {sudahPunyaAkun ? (
              <span className="chip chip-draft">Sudah punya akun</span>
            ) : (
              <Link href={`/admin/role-assignment?q=${encodeURIComponent(q)}&pegawaiId=${p.id}`} className="btn btn-ghost btn-sm">
                Pilih
              </Link>
            )}
          </div>
        );
      })}
      {hasil.length === 20 && <p className="p-3 text-xs text-muted">Menampilkan 20 hasil teratas - persempit pencarian kalau perlu.</p>}
    </div>
  );
}
