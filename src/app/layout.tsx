import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "./AppShell";
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
      <body className="min-h-screen antialiased">
        <AppShell
          account={
            akun
              ? {
                  nama: akun.nama,
                  jabatan: akun.jabatan,
                  role: akun.role,
                  rolesTersedia: akun.rolesTersedia,
                }
              : null
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}
