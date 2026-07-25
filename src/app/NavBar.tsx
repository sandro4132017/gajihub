"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "./login/actions";
import { LABEL_ROLE } from "../auth/roleLabel";
import type { Role } from "@prisma/client";

const MENU = [
  { href: "/tukin", label: "Dashboard Tukin" },
  { href: "/uang-makan", label: "Uang Makan" },
  { href: "/uang-lembur", label: "Uang Lembur" },
];

export function NavBar({
  account,
}: {
  account: { nama: string; jabatan: string; role: Role } | null;
}) {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <span className="py-3 text-sm font-semibold text-gray-900">Gajihub</span>
          {account && (
            <nav className="flex gap-1">
              {MENU.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`border-b-2 px-3 py-3 text-sm font-medium ${
                      active
                        ? "border-gray-900 text-gray-900"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>

        {account && (
          <form action={logoutAction} className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              {account.nama} &middot; {account.jabatan} &middot;{" "}
              <span className="font-medium text-gray-700">{LABEL_ROLE[account.role]}</span>
            </span>
            <button
              type="submit"
              className="text-xs font-medium text-gray-500 underline hover:text-gray-700"
            >
              Logout
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
