import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../../auth/permissions";
import { daftarRoleTersedia } from "../../../auth/roleAktif";
import { LABEL_ROLE, labelRole } from "../../../auth/roleLabel";
import { AksesDitolak } from "../../AksesDitolak";
import { AssignmentRow } from "./AssignmentRow";
import { BuatAkunBaruForm } from "./BuatAkunBaruForm";
import { PencarianDebounce } from "../../PencarianDebounce";

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

  // Tabel di bawah SENGAJA cuma menampilkan akun ber-role NON-PEGAWAI:
  // sejak seedAkunPegawai.ts, SEMUA pegawai (±5.069) otomatis punya akun
  // role PEGAWAI - kalau semuanya ditampilkan, tabel ini jadi 5.000+ baris
  // dan tidak ada gunanya buat "cari siapa yang punya kewenangan khusus".
  // Buat mengubah role pegawai biasa, pakai pencarian di atasnya.
  // Akun ber-role PEGAWAI TAPI punya role tambahan ikut ditampilkan juga -
  // kalau tidak, akun yang dikasih role tambahan buat testing "hilang" dari
  // tabel ini dan cuma bisa ditemukan lewat pencarian.
  const [userNonPegawai, totalAkun, satuanKerjaRows] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ role: { not: "PEGAWAI" } }, { rolesTambahan: { isEmpty: false } }] },
      orderBy: { nama: "asc" },
    }),
    prisma.user.count(),
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
  ]);
  const satuanKerjaList = satuanKerjaRows.map((r) => r.satuanKerja);

  // Akun ber-role Kasubag TU (utama ATAU tambahan) yang unitnya kosong =
  // "buta unit": lolos guard role tapi tidak cocok dengan satuan kerja
  // manapun, jadi semua halaman unit tampil kosong tanpa penjelasan. Ini
  // penyebab keluhan "role sudah diganti tapi tidak bisa lihat apa-apa" -
  // ditonjolkan di sini supaya ketahuan tanpa harus mengecek satu-satu.
  const akunButaUnit = userNonPegawai.filter(
    (u) => daftarRoleTersedia(u).includes("KASUBAG_TU") && !u.satuanKerja
  );

  // Default unit buat akun yang belum punya: satuan kerja data pegawainya
  // sendiri (tebakan paling masuk akal, Admin tetap bisa menggantinya).
  const satkerPegawaiByNip = new Map(
    (
      await prisma.pegawai.findMany({
        where: { nip: { in: userNonPegawai.map((u) => u.nip) } },
        select: { nip: true, satuanKerja: true },
      })
    ).map((p) => [p.nip, p.satuanKerja])
  );

  const pegawaiTerpilih = pegawaiId ? await prisma.pegawai.findUnique({ where: { id: pegawaiId } }) : null;
  const akunTerpilih = pegawaiTerpilih ? await prisma.user.findUnique({ where: { nip: pegawaiTerpilih.nip } }) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Kelola Assignment Role</h1>
      <p className="mt-1 text-sm text-muted">
        Ubah role/satuan kerja/status aktif akun secara langsung - BEDA dari alur usulan PPABP (lihat menu &quot;Usulan
        Perubahan Role&quot;), ini jalur administratif langsung tanpa proses usul-lalu-eksekusi. Satu akun juga bisa
        dikasih beberapa <strong>role tambahan</strong> buat kemudahan testing - pemiliknya lalu bisa ganti sudut
        pandang sendiri lewat tombol akun di sidebar, tanpa logout.
      </p>

      {akunButaUnit.length > 0 && (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="font-bold text-ink">
            {akunButaUnit.length} akun Kasubag TU belum punya unit kerja
          </p>
          <p className="mt-1 text-sm text-muted">
            Akun ini lolos sebagai Kasubag TU tapi tidak terhubung ke satuan kerja manapun, jadi semua halaman unit
            (Dashboard Unit, Pegawai Unit, Kalkulasi) tampil kosong buat mereka. Isi kolom satuan kerja di tabel bawah,
            lalu Simpan.
          </p>
          <ul className="mt-2 list-inside list-disc text-sm text-ink-2">
            {akunButaUnit.map((u) => (
              <li key={u.id}>
                {u.nama} <span className="text-xs text-muted">(NIP {u.nip})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">Cari Pegawai &amp; Ubah Role</h2>
      <p className="mt-1 text-xs text-muted">
        Semua pegawai sudah punya akun dengan role Pegawai secara default ({totalAkun.toLocaleString("id-ID")} akun) -
        buat memberi kewenangan khusus, cari orangnya di sini lalu ganti role-nya.
      </p>

      <form method="get" className="card mt-3 flex flex-wrap items-end gap-3 p-4">
        <div className="flex-1 min-w-[240px]">
          <label className="field-label">Cari nama atau NIP pegawai</label>
          <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
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
            <Link
              href={q ? `/admin/role-assignment?q=${encodeURIComponent(q)}` : "/admin/role-assignment"}
              className="mt-2 inline-block text-xs font-semibold text-teal-deep underline"
            >
              Ganti pegawai
            </Link>
          </div>
          {akunTerpilih ? (
            <div className="card mt-4">
              <AssignmentRow
                user={akunTerpilih}
                satuanKerjaList={satuanKerjaList}
                satuanKerjaPegawai={pegawaiTerpilih.satuanKerja}
              />
            </div>
          ) : (
            // Fallback: pegawai yang belum punya akun sama sekali (mis. data
            // Pegawai baru diimpor SETELAH seedAkunPegawai.ts terakhir jalan).
            <BuatAkunBaruForm
              pegawai={{
                id: pegawaiTerpilih.id,
                nama: pegawaiTerpilih.nama,
                nip: pegawaiTerpilih.nip,
                satuanKerja: pegawaiTerpilih.satuanKerja,
              }}
              satuanKerjaList={satuanKerjaList}
            />
          )}
        </>
      ) : q ? (
        <PegawaiHasilPencarian q={q} />
      ) : null}

      <h2 className="mt-10 text-sm font-bold uppercase tracking-wide text-muted">
        Akun dengan kewenangan khusus ({userNonPegawai.length})
      </h2>
      <p className="mt-1 text-xs text-muted">
        Cuma akun ber-role SELAIN Pegawai yang ditampilkan di sini, biar gampang dicari. Akun role Pegawai (mayoritas)
        diakses lewat pencarian di atas.
      </p>
      <div className="card mt-3 divide-y divide-line-2">
        {userNonPegawai.length === 0 && (
          <p className="p-6 text-sm text-muted">Belum ada akun dengan kewenangan khusus.</p>
        )}
        {userNonPegawai.map((u) => (
          <AssignmentRow
            key={u.id}
            user={u}
            satuanKerjaList={satuanKerjaList}
            satuanKerjaPegawai={satkerPegawaiByNip.get(u.nip) ?? null}
          />
        ))}
      </div>
    </main>
  );
}

async function PegawaiHasilPencarian({ q }: { q: string }) {
  const hasil = await prisma.pegawai.findMany({
    where: { OR: [{ nama: { contains: q, mode: "insensitive" } }, { nip: { contains: q } }] },
    orderBy: { nama: "asc" },
    take: 20,
  });
  const akunByNip = new Map(
    (await prisma.user.findMany({ where: { nip: { in: hasil.map((p) => p.nip) } } })).map((u) => [u.nip, u])
  );

  return (
    <div className="card mt-4 divide-y divide-line-2">
      {hasil.length === 0 && <p className="p-6 text-sm text-muted">Tidak ada pegawai yang cocok.</p>}
      {hasil.map((p) => {
        const akun = akunByNip.get(p.nip);
        return (
          <div key={p.id} className="flex items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{p.nama}</p>
              <p className="text-xs text-muted">
                NIP {p.nip} - {p.satuanKerja} - {p.jabatan ?? "-"}
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <span className={`chip ${akun && akun.role !== "PEGAWAI" ? "chip-navy" : "chip-draft"}`}>
                {akun ? labelRole(akun.role, akun.satuanKerja) : "Belum ada akun"}
              </span>
              {akun && akun.rolesTambahan.length > 0 && (
                <span className="chip chip-draft" title={akun.rolesTambahan.map((r) => labelRole(r, akun.satuanKerja)).join(", ")}>
                  +{akun.rolesTambahan.length} role
                </span>
              )}
              <Link href={`/admin/role-assignment?q=${encodeURIComponent(q)}&pegawaiId=${p.id}`} className="btn btn-ghost btn-sm">
                {akun ? "Ubah role" : "Buat akun"}
              </Link>
            </div>
          </div>
        );
      })}
      {hasil.length === 20 && <p className="p-3 text-xs text-muted">Menampilkan 20 hasil teratas - persempit pencarian kalau perlu.</p>}
    </div>
  );
}
