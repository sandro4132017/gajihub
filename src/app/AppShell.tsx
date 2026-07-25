"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "./login/actions";
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
  account: { nama: string; jabatan: string; role: Role } | null;
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

  const menu = account.role === "PEGAWAI" ? MENU_PEGAWAI : MENU_APPROVER;

  return (
    <div className="min-h-screen md:grid md:grid-cols-[264px_1fr]">
      {/* Topbar mobile - cuma nampilin logo + hamburger + logout, sidebar
          penuh disembunyikan jadi drawer supaya tidak makan tempat di HP. */}
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
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
        <form action={logoutAction}>
          <button type="submit" className="text-xs font-bold text-muted underline">
            Logout
          </button>
        </form>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] -translate-x-full flex-col border-r border-[#0e1830] bg-gradient-to-b from-navy to-navy-deep text-[#cdd6e6] transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
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

          <div className="border-t border-white/10 p-3.5">
            <div className="flex items-center gap-2.5 rounded-[10px] bg-white/[.04] p-2.5">
              <div className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-gradient-to-br from-gold to-gold-deep text-[13px] font-extrabold text-white">
                {initials(account.nama)}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-bold leading-tight text-white">{account.nama}</div>
                <div className="truncate text-[10.5px] text-[#8ea0c0]">
                  {LABEL_ROLE[account.role]} &middot; {account.jabatan}
                </div>
              </div>
            </div>
            <form action={logoutAction} className="mt-2">
              <button
                type="submit"
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] font-bold text-[#8ea0c0] hover:bg-white/[.06] hover:text-white"
              >
                Logout
              </button>
            </form>
          </div>
        </aside>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
