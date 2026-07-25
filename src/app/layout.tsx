import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { NavBar } from "./NavBar";
import { getSessionAccount } from "../auth/getSessionAccount";

export const metadata: Metadata = {
  title: "Gajihub",
  description:
    "Dashboard internal integrasi Gajihub - Kementerian Ketenagakerjaan",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const akun = await getSessionAccount();

  return (
    <html lang="id">
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        <NavBar account={akun ? { nama: akun.nama, jabatan: akun.jabatan, role: akun.role } : null} />
        {children}
      </body>
    </html>
  );
}
