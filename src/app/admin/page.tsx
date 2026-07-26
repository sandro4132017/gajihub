import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaAssignmentRole(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus Admin." />;
  }

  const usulanMenunggu = await prisma.usulanPerubahanRole.count({ where: { status: "MENUNGGU" } });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Dashboard Admin</h1>
      <p className="mt-1 text-sm text-muted">
        Kewenangan teknis (config, monitoring, eksekusi role) + privilege semua role lain untuk kebutuhan demo/simulasi.
      </p>

      <div className="mt-4 rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep">
        BUKAN DESAIN FINAL production - role ini WAJIB dipecah jadi System Admin (akses teknis saja) + role bisnis
        terpisah sebelum production, lihat TODO(confirm) besar di CLAUDE.md.
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Link href="/admin/role-assignment" className="card p-4 transition hover:border-teal-deep">
          <h2 className="text-sm font-bold text-ink">Kelola Assignment Role</h2>
          <p className="mt-1 text-xs text-muted">Ubah role/satuan kerja/status aktif akun langsung.</p>
        </Link>
        <Link href="/admin/usulan-role" className="card p-4 transition hover:border-teal-deep">
          <h2 className="text-sm font-bold text-ink">Eksekusi Usulan Role</h2>
          <p className="mt-1 text-xs text-muted">
            {usulanMenunggu} usulan menunggu keputusan dari PPABP.
          </p>
        </Link>
        <Link href="/admin/sistem" className="card p-4 transition hover:border-teal-deep">
          <h2 className="text-sm font-bold text-ink">Konfigurasi & Kesehatan Sistem</h2>
          <p className="mt-1 text-xs text-muted">Status adapter + aktivitas audit trail terbaru.</p>
        </Link>
      </div>

      <div className="card mt-6 p-4">
        <h2 className="text-sm font-bold text-ink">Akses lintas role lainnya</h2>
        <p className="mt-1 text-xs text-muted">
          Privilege ADMIN mencakup semua fitur role lain - dashboard lintas unit yang sama dengan PPABP/Pimpinan, dan
          seluruh halaman Kasubag TU/OSDMA (lewat bypass otorisasi, bukan menu khusus terpisah).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/ppabp" className="btn btn-ghost btn-sm">
            Dashboard Lintas Unit
          </Link>
          <Link href="/ppabp/rekonsiliasi" className="btn btn-ghost btn-sm">
            Rekonsiliasi (PPABP)
          </Link>
          <Link href="/ppabp/adk" className="btn btn-ghost btn-sm">
            Export ADK (PPABP)
          </Link>
          <Link href="/ppabp/anggaran" className="btn btn-ghost btn-sm">
            Anggaran & Realisasi (PPABP)
          </Link>
          <Link href="/ppabp/usulan-role" className="btn btn-ghost btn-sm">
            Usulan Perubahan Role (PPABP)
          </Link>
          <Link href="/kasubag" className="btn btn-ghost btn-sm">
            Dashboard Unit (Kasubag TU)
          </Link>
          <Link href="/osdma" className="btn btn-ghost btn-sm">
            Dashboard OSDMA
          </Link>
          <Link href="/saya" className="btn btn-ghost btn-sm">
            Data Saya
          </Link>
        </div>
      </div>
    </main>
  );
}
