import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUpdateSkPegawaiStrukturalFungsional, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { UpdateSkForm } from "./UpdateSkForm";
import { PencarianDebounce } from "../../PencarianDebounce";

export const dynamic = "force-dynamic";

export default async function OsdmaUpdateSkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pegawaiId?: string; berhasil?: string }>;
}) {
  const { q, pegawaiId, berhasil } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canUpdateSkPegawaiStrukturalFungsional(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengubah SK pegawai." />;
  }

  const pegawaiTerpilih = pegawaiId ? await prisma.pegawai.findUnique({ where: { id: pegawaiId } }) : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Update SK Struktural/Fungsional</h1>
      <p className="mt-1 text-sm text-muted">Untuk pegawai yang baru dilantik struktural/fungsional atau naik pangkat.</p>

      {berhasil && (
        <p className="mt-4 rounded-lg bg-green-tint px-3 py-2 text-sm font-semibold text-green">SK pegawai berhasil diperbarui.</p>
      )}

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[240px]">
          <label className="field-label">Cari nama atau NIP</label>
          <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Cari
        </button>
      </form>

      {pegawaiTerpilih ? (
        <>
          <div className="card mt-6 p-4">
            <p className="font-bold text-ink">{pegawaiTerpilih.nama}</p>
            <p className="text-sm text-muted">
              NIP {pegawaiTerpilih.nip} - {pegawaiTerpilih.satuanKerja} - saat ini: {pegawaiTerpilih.jabatan ?? "-"} / golongan{" "}
              {pegawaiTerpilih.golongan ?? "-"}
            </p>
            <Link href={q ? `/osdma/update-sk?q=${encodeURIComponent(q)}` : "/osdma/update-sk"} className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
              Ganti pegawai
            </Link>
          </div>
          <UpdateSkForm pegawai={pegawaiTerpilih} />
        </>
      ) : q ? (
        <PegawaiHasilPencarian q={q} />
      ) : (
        <p className="card mt-6 p-6 text-sm text-muted">Cari nama atau NIP pegawai dulu untuk mengubah SK-nya.</p>
      )}
    </main>
  );
}

async function PegawaiHasilPencarian({ q }: { q: string }) {
  const hasil = await prisma.pegawai.findMany({
    where: { OR: [{ nama: { contains: q, mode: "insensitive" } }, { nip: { contains: q } }] },
    orderBy: { nama: "asc" },
    take: 20,
  });

  return (
    <div className="card mt-6 divide-y divide-line-2">
      {hasil.length === 0 && <p className="p-6 text-sm text-muted">Tidak ada pegawai yang cocok.</p>}
      {hasil.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold text-ink">{p.nama}</p>
            <p className="text-xs text-muted">
              NIP {p.nip} - {p.satuanKerja} - {p.jabatan ?? "-"}
            </p>
          </div>
          <Link href={`/osdma/update-sk?q=${encodeURIComponent(q)}&pegawaiId=${p.id}`} className="btn btn-ghost btn-sm">
            Pilih
          </Link>
        </div>
      ))}
      {hasil.length === 20 && <p className="p-3 text-xs text-muted">Menampilkan 20 hasil teratas - persempit pencarian kalau perlu.</p>}
    </div>
  );
}
