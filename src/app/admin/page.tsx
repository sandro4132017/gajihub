import Link from "next/link";
import type { Role } from "@prisma/client";
import {
  RiAlertLine,
  RiArrowRightUpLine,
  RiCalculatorLine,
  RiCalendarCheckLine,
  RiDashboardLine,
  RiFileDownloadLine,
  RiGroupLine,
  RiHistoryLine,
  RiScales3Line,
  RiServerLine,
  RiShieldUserLine,
  RiStarLine,
  RiTeamLine,
  RiUserLine,
  RiUserSettingsLine,
} from "react-icons/ri";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canKelolaAssignmentRole, type AuthUser } from "../../auth/permissions";
import { getModeJaringan } from "../../auth/modeJaringan";
import { LABEL_ROLE } from "../../auth/roleLabel";
import { AksesDitolak } from "../../components/feedback/AksesDitolak";
import { HALAMAN } from "../../components/layout/layoutHalaman";
import { IkonBercahaya, KartuBercahaya } from "../../components/shared/KartuKpi";
import { sapaanNama } from "../../components/shared/sapaan";
import { ToggleModeJaringan } from "./ToggleModeJaringan";

export const dynamic = "force-dynamic";

// ============================================================================
// DASHBOARD ADMIN - pusat kendali teknis: akun & role, kesehatan data, jejak
// aktivitas, lalu pintasan ke halaman role lain.
//
// Semua angka di sini dari database Gajihub sendiri (bukan SIAP/e-Presensi),
// jadi halaman ini tidak menunggu sistem luar. Yang dikerjakan Admin (kelola
// role, eksekusi usulan) di atas; yang cuma dilihat (aktivitas, komposisi
// akun) di bawahnya.
// ============================================================================

const URUTAN_ROLE: Role[] = ["PEGAWAI", "KASUBAG_TU", "OSDMA", "PPABP", "PIMPINAN", "ADMIN"];

/** Jendela hitungan kegagalan TTE, dalam hari. */
const JENDELA_GAGAL_TTE_HARI = 7;

const angka = (n: number) => n.toLocaleString("id-ID");

const formatTanggal = (t: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(t);

function waktuLalu(t: Date, sekarang: Date): string {
  const menit = Math.max(0, Math.round((sekarang.getTime() - t.getTime()) / 60000));
  if (menit < 1) return "baru saja";
  if (menit < 60) return `${menit} menit lalu`;
  const jam = Math.round(menit / 60);
  if (jam < 24) return `${jam} jam lalu`;
  const hari = Math.round(jam / 24);
  if (hari < 7) return `${hari} hari lalu`;
  return formatTanggal(t);
}

const KELAS_AKSI: Record<string, string> = {
  CREATE: "chip-ok",
  UPDATE: "chip-navy",
  DELETE: "chip-danger",
  SYNC: "chip-draft",
  APPROVE: "chip-ok",
};

/** Pintasan ke halaman role lain - ADMIN tidak punya menu sidebar untuk itu. */
const PINTASAN: { grup: string; tautan: { href: string; label: string; Ikon: typeof RiDashboardLine }[] }[] = [
  {
    grup: "PPABP",
    tautan: [
      { href: "/ppabp", label: "Dashboard lintas unit", Ikon: RiDashboardLine },
      { href: "/ppabp/adk", label: "Export ADK", Ikon: RiFileDownloadLine },
      { href: "/ppabp/banding", label: "Monitoring banding", Ikon: RiScales3Line },
      { href: "/ppabp/usulan-role", label: "Usulan perubahan role", Ikon: RiUserSettingsLine },
    ],
  },
  {
    grup: "Kasubag TU",
    tautan: [
      { href: "/kasubag", label: "Dashboard unit", Ikon: RiDashboardLine },
      // Sidebar ADMIN memakai MENU_ADMIN, jadi dari /kasubag tidak ada menu
      // menuju kalkulasi - tanpa pintasan ini satu-satunya jalan adalah
      // mengetik URL.
      { href: "/kasubag/kalkulasi", label: "Kalkulasi unit", Ikon: RiCalculatorLine },
    ],
  },
  {
    grup: "Tukin",
    tautan: [
      { href: "/tukin", label: "Dashboard Tukin", Ikon: RiDashboardLine },
      { href: "/tukin/presensi", label: "Presensi", Ikon: RiCalendarCheckLine },
      { href: "/tukin/predikat-kinerja", label: "Predikat kinerja", Ikon: RiStarLine },
    ],
  },
  {
    grup: "Lainnya",
    tautan: [
      { href: "/pegawai", label: "Data pegawai", Ikon: RiTeamLine },
      { href: "/osdma", label: "Dashboard OSDMA", Ikon: RiDashboardLine },
      { href: "/saya", label: "Data saya", Ikon: RiUserLine },
    ],
  },
];

export default async function AdminDashboardPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!akun || !authUser || !canKelolaAssignmentRole(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus Admin." />;
  }

  // TODO(confirm) role ADMIN sekarang menggabung akses teknis (konfigurasi,
  // monitoring) dengan privilege seluruh role bisnis. Sebelum dipakai
  // produksi ini perlu dipecah jadi System Admin (teknis saja) + role bisnis
  // terpisah.
  const sekarang = new Date();
  const sejakGagalTte = new Date(sekarang.getTime() - JENDELA_GAGAL_TTE_HARI * 24 * 60 * 60 * 1000);

  const [
    usulanMenunggu,
    akunPerRole,
    akunNonaktif,
    pegawaiAktif,
    sinkronTerakhir,
    gagalTte,
    aktivitas,
  ] = await Promise.all([
    prisma.usulanPerubahanRole.count({ where: { status: "MENUNGGU" } }),
    prisma.user.groupBy({ by: ["role"], where: { aktif: true }, _count: { _all: true } }),
    prisma.user.count({ where: { aktif: false } }),
    prisma.pegawai.count({ where: { statusPegawai: "AKTIF" } }),
    prisma.pegawai.aggregate({ _max: { sourceSyncedAt: true } }),
    prisma.logGagalTte.count({ where: { createdAt: { gte: sejakGagalTte } } }),
    prisma.auditTrail.findMany({
      orderBy: { timestamp: "desc" },
      take: 6,
      select: { id: true, entitas: true, aksi: true, aktor: true, satuanKerja: true, timestamp: true },
    }),
  ]);

  const petaRole = new Map(akunPerRole.map((r) => [r.role, r._count._all]));
  const komposisiRole = URUTAN_ROLE.map((role) => ({ role, jumlah: petaRole.get(role) ?? 0 }));
  const akunAktif = komposisiRole.reduce((a, r) => a + r.jumlah, 0);
  const maksRole = Math.max(1, ...komposisiRole.map((r) => r.jumlah));

  // Nama aktor untuk jejak aktivitas - NIP saja tidak bisa dibaca sekilas.
  const nipAktor = [...new Set(aktivitas.map((a) => a.aktor).filter((a) => a !== "SYSTEM"))];
  const namaAktor = new Map(
    (await prisma.user.findMany({ where: { nip: { in: nipAktor } }, select: { nip: true, nama: true } })).map((u) => [
      u.nip,
      u.nama,
    ])
  );

  const modeJaringan = getModeJaringan();
  const tglSinkron = sinkronTerakhir._max.sourceSyncedAt;

  return (
    <div data-tema="palet-2026" className="min-h-full">
      <main className={`${HALAMAN} space-y-6`}>
        {/* ================================================================
            1. SAMBUTAN + RINGKASAN YANG PERLU DITANGANI
            ================================================================ */}
        <section
          aria-label="Ringkasan sistem"
          className="gj-masuk relative grid grid-cols-1 gap-6 overflow-hidden rounded-2xl bg-navy p-6 text-white shadow-sm lg:grid-cols-12 lg:p-8"
        >
          <RiShieldUserLine
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-10 -right-8 size-56 text-white/5"
          />
          <div className="relative lg:col-span-7">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold">
              <RiServerLine aria-hidden="true" className="size-3.5" />
              Mode jaringan {modeJaringan === "PUBLIC" ? "publik" : "internal"}
            </span>
            <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
              Halo, {sapaanNama(akun.nama)}
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Pusat kendali teknis Gajihub: akun &amp; role, kesehatan data, dan jejak aktivitas.
            </p>
            {usulanMenunggu > 0 ? (
              <Link
                href="/admin/usulan-role"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-navy shadow-xs transition hover:bg-white/90"
              >
                Eksekusi <span className="font-mono">{angka(usulanMenunggu)}</span> usulan role
                <RiArrowRightUpLine aria-hidden="true" className="size-4" />
              </Link>
            ) : (
              <p className="mt-5 text-sm font-semibold text-white/90">Tidak ada usulan role yang menunggu.</p>
            )}
          </div>

          <dl className="relative grid grid-cols-3 gap-3 lg:col-span-5 lg:self-center">
            {[
              { label: "Akun aktif", nilai: angka(akunAktif) },
              { label: "Usulan menunggu", nilai: angka(usulanMenunggu) },
              { label: `Gagal TTE ${JENDELA_GAGAL_TTE_HARI} hari`, nilai: angka(gagalTte) },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-white/10 p-3 text-center">
                <dt className="text-[11px] font-semibold text-white/75">{s.label}</dt>
                <dd className="mt-1 font-mono text-2xl font-black">{s.nilai}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ================================================================
            2. KPI SISTEM
            ================================================================ */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KartuBercahaya nuansa={1} tundaMs={60}>
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted">Akun aktif</p>
                <p className="mt-1 font-mono text-3xl font-black text-ink">{angka(akunAktif)}</p>
              </div>
              <IkonBercahaya nuansa={1}>
                <RiGroupLine aria-hidden="true" className="size-5" />
              </IkonBercahaya>
            </div>
            <p className="relative mt-3 text-xs text-ink-2">
              <span className="font-mono">{angka(akunNonaktif)}</span> akun nonaktif
            </p>
          </KartuBercahaya>

          <KartuBercahaya nuansa={2} tundaMs={120}>
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted">Usulan role menunggu</p>
                <p className="mt-1 font-mono text-3xl font-black text-ink">{angka(usulanMenunggu)}</p>
              </div>
              <IkonBercahaya nuansa={2}>
                <RiUserSettingsLine aria-hidden="true" className="size-5" />
              </IkonBercahaya>
            </div>
            <Link href="/admin/usulan-role" className="relative mt-3 text-xs font-semibold text-biru hover:underline">
              Buka antrean usulan
            </Link>
          </KartuBercahaya>

          <KartuBercahaya nuansa={4} tundaMs={180}>
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted">Pegawai aktif (SIAP)</p>
                <p className="mt-1 font-mono text-3xl font-black text-ink">{angka(pegawaiAktif)}</p>
              </div>
              <IkonBercahaya nuansa={4}>
                <RiTeamLine aria-hidden="true" className="size-5" />
              </IkonBercahaya>
            </div>
            <p className="relative mt-3 text-xs text-ink-2">
              {tglSinkron ? (
                <>
                  Sinkron terakhir <span className="font-mono">{formatTanggal(tglSinkron)}</span>
                </>
              ) : (
                "Belum pernah disinkronkan"
              )}
            </p>
          </KartuBercahaya>

          <KartuBercahaya nuansa={3} tundaMs={240}>
            <div className="relative flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted">Gagal TTE {JENDELA_GAGAL_TTE_HARI} hari terakhir</p>
                <p className="mt-1 font-mono text-3xl font-black text-ink">{angka(gagalTte)}</p>
              </div>
              <IkonBercahaya nuansa={3}>
                <RiAlertLine aria-hidden="true" className="size-5" />
              </IkonBercahaya>
            </div>
            <p className="relative mt-3 text-xs text-ink-2">
              {gagalTte === 0 ? "Tidak ada kegagalan tanda tangan" : "Dicatat di log gagal TTE (Kriteria IX BSrE)"}
            </p>
          </KartuBercahaya>
        </div>

        {/* ================================================================
            3. KELOLA - pekerjaan Admin
            ================================================================ */}
        <section aria-labelledby="judul-kelola">
          <h2 id="judul-kelola" className="text-sm font-bold text-ink">
            Kelola
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                href: "/admin/role-assignment",
                judul: "Kelola assignment role",
                isi: "Ubah role, satuan kerja, dan status aktif akun.",
                Ikon: RiShieldUserLine,
              },
              {
                href: "/admin/usulan-role",
                judul: "Eksekusi usulan role",
                isi: `${angka(usulanMenunggu)} usulan dari PPABP menunggu keputusan.`,
                Ikon: RiUserSettingsLine,
              },
              {
                href: "/admin/sistem",
                judul: "Konfigurasi & kesehatan sistem",
                isi: "Status adapter, sinkronisasi pegawai, dan audit trail.",
                Ikon: RiServerLine,
              },
            ].map((k) => (
              <Link
                key={k.href}
                href={k.href}
                className="group flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-biru hover:shadow-sm"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-tint text-navy">
                  <k.Ikon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink group-hover:text-biru">{k.judul}</span>
                  <span className="mt-0.5 block text-xs text-ink-2">{k.isi}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <ToggleModeJaringan modeAwal={modeJaringan} />

        {/* ================================================================
            4. AKTIVITAS TERBARU + KOMPOSISI AKUN
            ================================================================ */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <section className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-7">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
                <RiHistoryLine aria-hidden="true" className="size-4 text-muted" />
                Aktivitas terbaru
              </h2>
              <Link href="/admin/sistem" className="text-xs font-semibold text-biru hover:underline">
                Lihat audit trail
              </Link>
            </div>
            {aktivitas.length === 0 ? (
              <p className="mt-4 text-sm text-muted">Belum ada aktivitas tercatat di audit trail.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line-2">
                {aktivitas.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                        <span className={`chip ${KELAS_AKSI[a.aksi] ?? "chip-draft"} text-[11px]`}>{a.aksi}</span>
                        <span className="font-mono text-xs text-ink-2">{a.entitas}</span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {a.aktor === "SYSTEM" ? "Proses otomatis" : (namaAktor.get(a.aktor) ?? "Akun tidak dikenal")}
                        {a.satuanKerja ? ` · ${a.satuanKerja}` : ""}
                      </p>
                    </div>
                    <time
                      dateTime={a.timestamp.toISOString()}
                      className="shrink-0 font-mono text-[11px] text-muted"
                    >
                      {waktuLalu(a.timestamp, sekarang)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="gj-masuk rounded-2xl border border-line bg-surface p-5 shadow-xs lg:col-span-5">
            <div className="flex items-center justify-between border-b border-line-2 pb-3">
              <h2 className="text-sm font-bold text-ink">Akun aktif per role</h2>
              <span className="font-mono text-xs text-muted">{angka(akunAktif)} akun</span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {komposisiRole.map((r) => (
                <li key={r.role}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold text-ink">{LABEL_ROLE[r.role]}</span>
                    <span className="font-mono font-bold text-ink">{angka(r.jumlah)}</span>
                  </div>
                  <div aria-hidden="true" className="mt-1 h-2 overflow-hidden rounded-full bg-line-2">
                    <div
                      className="h-full rounded-full bg-seri-1"
                      style={{ width: `${r.jumlah === 0 ? 0 : Math.max((r.jumlah / maksRole) * 100, 2)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">
              Menurut role utama akun. Role tambahan (multi-role) tidak ikut terhitung.
            </p>
          </section>
        </div>

        {/* ================================================================
            5. PINTASAN KE ROLE LAIN
            ================================================================ */}
        <section aria-labelledby="judul-pintasan" className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <h2 id="judul-pintasan" className="text-sm font-bold text-ink">
            Akses lintas role
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Admin memegang kewenangan seluruh role. Halaman role lain tidak ada di sidebar Admin - bukanya dari sini.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {PINTASAN.map((g) => (
              <div key={g.grup}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{g.grup}</p>
                <ul className="mt-2 space-y-1">
                  {g.tautan.map((t) => (
                    <li key={t.href}>
                      <Link
                        href={t.href}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-2 transition hover:bg-surface-2 hover:text-biru"
                      >
                        <t.Ikon aria-hidden="true" className="size-4 shrink-0 text-muted" />
                        {t.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
