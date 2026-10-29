import Link from "next/link";
import type { Role } from "@prisma/client";
import { RiAlertLine, RiSearchLine, RiShieldUserLine } from "react-icons/ri";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../../auth/permissions";
import { daftarRoleTersedia } from "../../../auth/roleAktif";
import { LABEL_ROLE, labelRole } from "../../../auth/roleLabel";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { AssignmentRow } from "./AssignmentRow";
import { BuatAkunBaruForm } from "./BuatAkunBaruForm";
import { PencarianDebounce } from "../../../components/forms/PencarianDebounce";
import { HALAMAN } from "../../../components/layout/layoutHalaman";

export const dynamic = "force-dynamic";

/** Role yang punya tab penyaring - PEGAWAI tidak, karena itu bawaan semua akun. */
const ROLE_KHUSUS: Role[] = ["KASUBAG_TU", "PPABP", "OSDMA", "PIMPINAN", "ADMIN"];

function bacaRole(nilai: string | undefined): Role | null {
  return nilai && (ROLE_KHUSUS as string[]).includes(nilai) ? (nilai as Role) : null;
}

export default async function RoleAssignmentPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pegawaiId?: string; role?: string }>;
}) {
  const { q, pegawaiId, role } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaAssignmentRole(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola assignment role." />;
  }
  const rolePilih = bacaRole(role);

  // Daftar bawah SENGAJA cuma memuat akun ber-role NON-PEGAWAI: sejak
  // seedAkunPegawai.ts, SEMUA pegawai (±5.069) otomatis punya akun role
  // PEGAWAI - menampilkan semuanya membuat daftar 5.000+ baris yang tidak
  // menjawab "siapa yang punya kewenangan khusus". Akun ber-role PEGAWAI yang
  // punya role tambahan ikut tampil, supaya tidak hanya bisa ditemukan lewat
  // pencarian.
  const [userNonPegawai, totalAkun, satuanKerjaRows] = await Promise.all([
    prisma.user.findMany({
      where: { OR: [{ role: { not: "PEGAWAI" } }, { rolesTambahan: { isEmpty: false } }] },
      orderBy: { nama: "asc" },
    }),
    prisma.user.count(),
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
  ]);
  const satuanKerjaList = satuanKerjaRows.map((r) => r.satuanKerja);

  // Tab menghitung role utama MAUPUN tambahan: akun PPABP yang juga Kasubag TU
  // memang termasuk dua-duanya.
  const punyaRole = (u: (typeof userNonPegawai)[number], r: Role) => u.role === r || u.rolesTambahan.includes(r);
  const jumlahPerRole = new Map(ROLE_KHUSUS.map((r) => [r, userNonPegawai.filter((u) => punyaRole(u, r)).length]));
  const daftarTampil = rolePilih ? userNonPegawai.filter((u) => punyaRole(u, rolePilih)) : userNonPegawai;

  // Akun ber-role Kasubag TU (utama ATAU tambahan) yang unitnya kosong =
  // "buta unit": lolos guard role tapi tidak cocok dengan satuan kerja
  // manapun, jadi semua halaman unit tampil kosong tanpa penjelasan.
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

  const hrefTab = (r: Role | null) => {
    const p = new URLSearchParams();
    if (r) p.set("role", r);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/admin/role-assignment?${s}` : "/admin/role-assignment";
  };

  return (
    <div data-tema="palet-2026" className="min-h-full">
      <main className={`${HALAMAN} space-y-6`}>
        {/* KEPALA HALAMAN - pola sama dengan halaman lain yang sudah diperbarui */}
        <div className="gj-masuk">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Kelola Assignment Role</h1>
          <p className="mt-0.5 text-sm font-bold text-ink">
            <span className="font-mono">{totalAkun.toLocaleString("id-ID")}</span> akun ·{" "}
            <span className="font-mono">{userNonPegawai.length}</span> berkewenangan khusus
          </p>
          <p className="mt-1.5 text-sm text-biru">
            Ubah role, satuan kerja, dan status akun secara langsung - tanpa alur usulan PPABP.
          </p>
        </div>

        {akunButaUnit.length > 0 && (
          <div className="gj-masuk flex gap-3 rounded-2xl border border-gold/40 bg-gold-tint/40 p-4">
            <RiAlertLine aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold-deep" />
            <div className="min-w-0 text-sm">
              <p className="font-bold text-ink">{akunButaUnit.length} akun Kasubag TU belum punya unit kerja</p>
              <p className="mt-0.5 text-ink-2">
                Semua halaman unit tampil kosong untuk mereka. Isi satuan kerjanya di daftar bawah, lalu Simpan:{" "}
                <span className="font-semibold">{akunButaUnit.map((u) => u.nama).join(", ")}</span>.
              </p>
            </div>
          </div>
        )}

        {/* CARI PEGAWAI - untuk memberi kewenangan ke akun yang masih role Pegawai */}
        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
            <RiSearchLine aria-hidden="true" className="size-4 text-muted" />
            Beri kewenangan ke pegawai
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Semua pegawai sudah punya akun role Pegawai. Cari orangnya, lalu ubah role-nya.
          </p>
          <form method="get" className="mt-3 flex flex-wrap items-end gap-3">
            {rolePilih && <input type="hidden" name="role" value={rolePilih} />}
            <div className="min-w-[240px] flex-1">
              <label className="field-label">Nama atau NIP</label>
              <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
            </div>
            <button type="submit" className="btn btn-primary h-10 py-0">
              Cari
            </button>
          </form>

          {pegawaiTerpilih ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-biru/40">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-4 py-2.5 text-xs">
                <span className="text-ink-2">
                  {pegawaiTerpilih.satuanKerja} · {pegawaiTerpilih.jabatan ?? "Jabatan belum tercatat"}
                </span>
                <Link
                  href={q ? `/admin/role-assignment?q=${encodeURIComponent(q)}` : "/admin/role-assignment"}
                  className="font-semibold text-biru hover:underline"
                >
                  Ganti pegawai
                </Link>
              </div>
              {akunTerpilih ? (
                <AssignmentRow
                  user={akunTerpilih}
                  satuanKerjaList={satuanKerjaList}
                  satuanKerjaPegawai={pegawaiTerpilih.satuanKerja}
                />
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
            </div>
          ) : q ? (
            <PegawaiHasilPencarian q={q} rolePilih={rolePilih} />
          ) : null}
        </section>

        {/* AKUN BERKEWENANGAN KHUSUS */}
        <section aria-labelledby="judul-khusus">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="judul-khusus" className="flex items-center gap-2 text-sm font-bold text-ink">
              <RiShieldUserLine aria-hidden="true" className="size-4 text-muted" />
              Akun berkewenangan khusus
            </h2>
            <nav aria-label="Saring menurut role" className="flex flex-wrap gap-1.5">
              {[null, ...ROLE_KHUSUS].map((r) => {
                const aktif = r === rolePilih;
                const jumlah = r ? (jumlahPerRole.get(r) ?? 0) : userNonPegawai.length;
                return (
                  <Link
                    key={r ?? "semua"}
                    href={hrefTab(r)}
                    aria-current={aktif ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      aktif ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink-2 hover:border-biru"
                    }`}
                  >
                    {r ? LABEL_ROLE[r] : "Semua"}
                    <span className={`font-mono ${aktif ? "text-white/80" : "text-muted"}`}>{jumlah}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-3 divide-y divide-line-2 rounded-2xl border border-line bg-surface shadow-xs">
            {daftarTampil.length === 0 && (
              <p className="p-6 text-sm text-muted">
                {rolePilih
                  ? `Belum ada akun ber-role ${LABEL_ROLE[rolePilih]}.`
                  : "Belum ada akun dengan kewenangan khusus."}
              </p>
            )}
            {daftarTampil.map((u) => (
              <AssignmentRow
                key={u.id}
                user={u}
                satuanKerjaList={satuanKerjaList}
                satuanKerjaPegawai={satkerPegawaiByNip.get(u.nip) ?? null}
              />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

async function PegawaiHasilPencarian({ q, rolePilih }: { q: string; rolePilih: Role | null }) {
  const hasil = await prisma.pegawai.findMany({
    where: { OR: [{ nama: { contains: q, mode: "insensitive" } }, { nip: { contains: q } }] },
    orderBy: { nama: "asc" },
    take: 20,
  });
  const akunByNip = new Map(
    (await prisma.user.findMany({ where: { nip: { in: hasil.map((p) => p.nip) } } })).map((u) => [u.nip, u])
  );
  const awalan = `/admin/role-assignment?q=${encodeURIComponent(q)}${rolePilih ? `&role=${rolePilih}` : ""}`;

  return (
    <div className="mt-4 divide-y divide-line-2 rounded-xl border border-line">
      {hasil.length === 0 && <p className="p-5 text-sm text-muted">Tidak ada pegawai yang cocok dengan &quot;{q}&quot;.</p>}
      {hasil.map((p) => {
        const akun = akunByNip.get(p.nip);
        return (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="font-semibold text-ink">{p.nama}</p>
              <p className="text-xs text-muted">
                <span className="font-mono">{p.nip}</span> · {p.satuanKerja}
              </p>
            </div>
            <div className="flex flex-none items-center gap-2">
              <span className={`chip text-[11px] ${akun && akun.role !== "PEGAWAI" ? "chip-navy" : "chip-draft"}`}>
                {akun ? labelRole(akun.role, akun.satuanKerja) : "Belum ada akun"}
              </span>
              {akun && akun.rolesTambahan.length > 0 && (
                <span
                  className="chip chip-draft text-[11px]"
                  title={akun.rolesTambahan.map((r) => labelRole(r, akun.satuanKerja)).join(", ")}
                >
                  +{akun.rolesTambahan.length} role
                </span>
              )}
              <Link href={`${awalan}&pegawaiId=${p.id}`} className="btn btn-secondary btn-sm">
                {akun ? "Ubah role" : "Buat akun"}
              </Link>
            </div>
          </div>
        );
      })}
      {hasil.length === 20 && (
        <p className="px-4 py-2.5 text-xs text-muted">Menampilkan 20 hasil teratas - persempit pencarian kalau perlu.</p>
      )}
    </div>
  );
}
