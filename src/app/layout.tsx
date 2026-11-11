import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "../components/layout/AppShell";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { periksaSesiRinci } from "../auth/getSessionAccount";
import { halamanPublikTanpaSesi } from "../auth/halamanPublik";

export const metadata: Metadata = {
  title: "Gajihub",
  description:
    "Tunjangan Kinerja dan Uang Makan pegawai Kementerian Ketenagakerjaan",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const hasil = await periksaSesiRinci();
  // Cookie sah (HMAC) tetapi ditolak database (versi dicabut / akun nonaktif):
  // buang cookie lewat route khusus. Tanpa ini middleware menganggap pengunjung
  // masih login, dan /login memantulnya kembali ke landing.
  // Pengecualian: halaman publik (verifikasi TTE) - path dipasang middleware.
  const path = (await headers()).get("x-pathname");
  if (!hasil.ok && hasil.alasan !== "tidak-ada" && !halamanPublikTanpaSesi(path)) {
    redirect(`/api/auth/keluar?alasan=${hasil.alasan}`);
  }
  const akun = hasil.ok ? hasil.sesi : null;

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
