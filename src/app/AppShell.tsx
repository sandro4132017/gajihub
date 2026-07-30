"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./AccountMenu";
import { LABEL_ROLE } from "../auth/roleLabel";
import type { Role } from "@prisma/client";

const MENU_APPROVER = [
  {
    href: "/tukin",
    label: "Dashboard Tukin",
    icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  },
  {
    href: "/uang-makan",
    label: "Uang Makan",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  },
  {
    href: "/uang-lembur",
    label: "Uang Lembur",
    icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  },
];

// KASUBAG_TU: privilege Pegawai (link "Data Saya" tetap ditampilkan, sesuai
// canViewDataSendiri yang sekarang berlaku semua role) + menu khusus scope
// unit kerjanya. Approval jenjang 1 Tukin/Uang Makan/Uang Lembur TETAP lewat
// 3 dashboard approver yang sama (MENU_APPROVER), bukan halaman terpisah.
const MENU_KASUBAG = [
  {
    href: "/kasubag",
    label: "Dashboard Unit",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },
  {
    href: "/kasubag/pegawai",
    label: "Pegawai Unit",
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  },
  {
    href: "/pegawai",
    label: "Data Pegawai",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 20h9" /></>,
  },
  {
    href: "/kasubag/kalkulasi",
    label: "Kalkulasi",
    icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  },
  { href: "/tukin", label: "Dashboard Tukin", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  {
    href: "/tukin/presensi",
    label: "Presensi",
    icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>,
  },
  { href: "/uang-makan", label: "Uang Makan", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { href: "/uang-lembur", label: "Uang Lembur", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  {
    href: "/kasubag/banding",
    label: "Verifikasi Banding",
    icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  },
  {
    href: "/kasubag/sk-kgb",
    label: "SK KGB",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  },
  {
    href: "/kasubag/sk-hukuman-disiplin",
    label: "SK Hukuman Disiplin",
    icon: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  },
  {
    href: "/saya",
    label: "Data Saya",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

// OSDMA: privilege Pegawai (link "Data Saya" tetap ditampilkan) + approval
// final lintas satuan kerja (Banding jenjang 2, SK KGB, SK Hukuman
// Disiplin) + update SK struktural/fungsional langsung. TIDAK ikut 3
// dashboard approver Tukin/UM/Lembur - itu domain Kasubag TU (jenjang 1) +
// PPABP (jenjang final), bukan OSDMA.
const MENU_OSDMA = [
  {
    href: "/osdma",
    label: "Dashboard OSDMA",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },
  {
    href: "/osdma/banding",
    label: "Approval Final Banding",
    icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  },
  {
    href: "/osdma/sk-kgb",
    label: "SK KGB",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  },
  {
    href: "/osdma/sk-hukuman-disiplin",
    label: "SK Hukuman Disiplin",
    icon: <><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  },
  {
    href: "/osdma/update-sk",
    label: "Update SK Pegawai",
    icon: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  },
  {
    href: "/saya",
    label: "Data Saya",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

// PPABP: privilege Pegawai (link "Data Saya" tetap ditampilkan) + dashboard
// lintas unit + telaah/approve jenjang final (via 3 dashboard approver yang
// sudah ada, lintas satker buat PPABP) + rekonsiliasi + export ADK +
// anggaran realisasi + usulan perubahan role.
const MENU_PPABP = [
  {
    href: "/ppabp",
    label: "Dashboard Lintas Unit",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },
  { href: "/tukin", label: "Dashboard Tukin", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  {
    href: "/tukin/presensi",
    label: "Presensi",
    icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>,
  },
  { href: "/uang-makan", label: "Uang Makan", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  { href: "/uang-lembur", label: "Uang Lembur", icon: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
  {
    href: "/pegawai",
    label: "Data Pegawai",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 20h9" /></>,
  },
  {
    href: "/ppabp/rekonsiliasi",
    label: "Rekonsiliasi",
    icon: <><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></>,
  },
  {
    href: "/ppabp/adk",
    label: "Export ADK",
    icon: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></>,
  },
  {
    href: "/ppabp/anggaran",
    label: "Anggaran & Realisasi",
    icon: <><path d="M3 3v18h18" /><path d="M22 7 13.5 15.5 8.5 10.5 2 17" /></>,
  },
  {
    href: "/ppabp/rekening",
    label: "Rekening Pegawai",
    icon: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><circle cx="17" cy="15" r="1.5" /></>,
  },
  {
    href: "/ppabp/gaji-induk",
    label: "Riwayat Gaji Pegawai",
    icon: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></>,
  },
  {
    href: "/ppabp/usulan-role",
    label: "Usulan Perubahan Role",
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  },
  {
    href: "/saya",
    label: "Data Saya",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

// ADMIN: menu KHUSUS 3 fitur admin-only (kelola assignment role, eksekusi
// usulan role, konfigurasi & kesehatan sistem) + Data Saya. TIDAK
// mencantumkan link ke /kasubag, /osdma, /ppabp, /tukin dst secara
// eksplisit di sidebar (privilege bypass-nya tetap jalan lewat akses URL
// langsung, sudah ada link cepat di /admin sendiri) - biar sidebar ADMIN
// tidak penuh sesak dengan menu 4 role sekaligus.
const MENU_ADMIN = [
  {
    href: "/admin",
    label: "Dashboard Admin",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },
  {
    href: "/admin/role-assignment",
    label: "Kelola Assignment Role",
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  },
  {
    href: "/pegawai",
    label: "Data Pegawai",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M12 20h9" /></>,
  },
  {
    href: "/admin/usulan-role",
    label: "Eksekusi Usulan Role",
    icon: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  },
  {
    href: "/admin/sistem",
    label: "Konfigurasi & Kesehatan Sistem",
    icon: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" /></>,
  },
  {
    href: "/saya",
    label: "Data Saya",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

// PIMPINAN: privilege Pegawai (Data Saya) + dashboard lintas unit read-only
// SAMA seperti PPABP (role matrix eksplisit) - TIDAK ada menu approval/aksi
// apapun (PIMPINAN tidak punya fungsi canApprove/canUbah apapun di
// permissions.ts, SENGAJA - lihat komentar di situ).
const MENU_PIMPINAN = [
  {
    href: "/pimpinan",
    label: "Dashboard Lintas Unit",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },
  {
    href: "/saya",
    label: "Data Saya",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

// PEGAWAI cuma punya dashboard self-service sendiri - jangan tampilkan link
// ke dashboard approver (halamannya sudah diblokir juga di server, lihat
// canViewApproverDashboard, ini cuma biar UI-nya konsisten).
const MENU_PEGAWAI = [
  {
    href: "/saya",
    label: "Data Saya",
    icon: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
  },
];

function GajihubLogo() {
  return (
    <div className="grid size-11 flex-none place-items-center rounded-xl bg-[#10203c] shadow-[0_4px_14px_rgba(0,0,0,0.25)]">
      <svg viewBox="0 0 64 64" fill="none" className="size-[30px]">
        <path
          d="M45 16 A 21 21 0 1 0 45 48"
          stroke="#00B3A4"
          strokeWidth="10.5"
          strokeLinecap="round"
        />
        <path d="M31 31 L45 31" stroke="#00B3A4" strokeWidth="10.5" strokeLinecap="round" />
        <circle cx="45.5" cy="45.5" r="8" fill="#D4A017" />
      </svg>
    </div>
  );
}

function initials(nama: string) {
  return nama
    .split(" ")
    .filter((w) => /^[A-Za-z]/.test(w))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

export function AppShell({
  account,
  children,
}: {
  // rolesTersedia = role utama + role tambahan akun ini (lihat
  // src/auth/roleAktif.ts). Panjang 1 = akun single-role seperti sebelumnya,
  // menu "Ganti role" tidak ditampilkan.
  account: { nama: string; jabatan: string; role: Role; rolesTersedia: Role[] } | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  if (!account) {
    // Belum login (halaman /login) - jangan render shell sidebar sama
    // sekali, cukup wordmark tipis di atas. Kalau grid 2 kolom tetap
    // dipasang tanpa sidebar-nya, kolom 264px bakal nyisain ruang kosong
    // dan bikin form login ketarik ke kanan di layar desktop.
    return (
      <div className="min-h-screen">
        <div className="flex items-center border-b border-line bg-surface px-4 py-2.5 sm:px-6">
          <span className="text-sm font-extrabold text-ink">
            Gaji<span className="font-semibold text-muted">hub</span>
          </span>
        </div>
        {children}
      </div>
    );
  }

  const menu =
    account.role === "PEGAWAI"
      ? MENU_PEGAWAI
      : account.role === "KASUBAG_TU"
        ? MENU_KASUBAG
        : account.role === "OSDMA"
          ? MENU_OSDMA
          : account.role === "PPABP"
            ? MENU_PPABP
            : account.role === "ADMIN"
              ? MENU_ADMIN
              : account.role === "PIMPINAN"
                ? MENU_PIMPINAN
                : MENU_APPROVER;

  return (
    <div className="min-h-screen print:block md:grid md:grid-cols-[264px_1fr]">
      {/* Topbar mobile - logo + hamburger + penanda role yang sedang aktif,
          sidebar penuh disembunyikan jadi drawer supaya tidak makan tempat
          di HP. Logout SEKARANG ada di dalam menu akun (kaki drawer), bukan
          tombol terpisah di sini - satu tempat buat semua aksi akun.
          print:hidden - biar halaman kayak slip gaji bisa dicetak bersih
          tanpa chrome nav (lihat src/app/saya/slip-gaji/). */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden print:hidden">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Buka menu"
            onClick={() => setOpen((v) => !v)}
            className="grid size-9 place-items-center rounded-lg border border-line bg-surface-2"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span className="text-sm font-extrabold text-ink">
            Gaji<span className="font-semibold text-muted">hub</span>
          </span>
        </div>
        <span className="chip chip-navy">{LABEL_ROLE[account.role]}</span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] -translate-x-full flex-col border-r border-[#0e1830] bg-gradient-to-b from-navy to-navy-deep text-[#cdd6e6] transition-transform duration-200 print:hidden md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
          <div className="flex items-center gap-3 border-b border-white/10 px-[22px] py-[18px]">
            <GajihubLogo />
            <div>
              <h1 className="text-[18px] font-extrabold leading-tight tracking-tight text-white">
                Gaji<span className="font-semibold text-[#9fb0cf]">hub</span>
              </h1>
              <span className="text-[11px] font-semibold text-[#8ea0c0]">oleh Kemnaker</span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <div className="px-3 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[1.4px] text-[#6f81a6]">
              Menu
            </div>
            {menu.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`relative mb-0.5 flex items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-[13.5px] font-semibold transition ${
                    active ? "bg-navy-soft text-white" : "text-[#c0cae0] hover:bg-white/[.06] hover:text-white"
                  }`}
                >
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-[22px] w-1 -translate-y-1/2 rounded-r bg-gold" />
                  )}
                  <svg
                    viewBox="0 0 24 24"
                    className={`size-[18px] flex-none ${active ? "text-[#3fd0b3] opacity-100" : "opacity-80"}`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    {item.icon}
                  </svg>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Tombol akun = menu (ganti role + logout), lihat AccountMenu.tsx.
              Logout SENGAJA tidak lagi berdiri sendiri di sini biar kaki
              sidebar tetap ringkas. */}
          <div className="border-t border-white/10 p-3.5">
            <AccountMenu
              nama={account.nama}
              jabatan={account.jabatan}
              role={account.role}
              rolesTersedia={account.rolesTersedia}
              initials={initials(account.nama)}
            />
          </div>
        </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
