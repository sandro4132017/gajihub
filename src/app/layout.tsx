import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "./AppShell";
import { getSessionAccount } from "../auth/getSessionAccount";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gajihub",
  description:
    "Dashboard internal integrasi Gajihub - Kementerian Ketenagakerjaan",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const akun = await getSessionAccount();

  return (
    <html lang="id" className={`${manrope.variable} ${mono.variable}`}>
      <body className="min-h-screen antialiased">
        <AppShell
          account={
            akun
              ? {
                  nama: akun.nama,
                  jabatan: akun.jabatan,
                  role: akun.role,
                  rolesTersedia: akun.rolesTersedia,
                  satuanKerja: akun.satuanKerja,
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
