"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./AccountMenu";
import { PanelKabar } from "./PanelKabar";
import { labelRole } from "../auth/roleLabel";
import type { Role } from "@prisma/client";

const MENU_APPROVER = [
  {
    href: "/tukin",
    label: "Tukin",
    icon: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></>,
  },
  {
    href: "/uang-makan",
    label: "Uang Makan",
    icon: <><path d="M5 2v6a2 2 0 0 0 4 0V2" /><path d="M7 8v14" /><path d="M17 2c1.7 1.8 2 4 2 6s-.3 3.5-2 3.5V22" /></>,
  },
  {
    href: "/uang-lembur",
    label: "Uang Lembur",
    icon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></>,
  },
];

// KASUBAG_TU: privilege Pegawai (link "Data Saya" tetap ditampilkan, sesuai
// canViewDataSendiri yang sekarang berlaku semua role) + menu khusus scope
// unit kerjanya. Approval jenjang 1 Tukin/Uang Makan/Uang Lembur TETAP lewat
// 3 dashboard approver yang sama (MENU_APPROVER), bukan halaman terpisah.
// KASUBAG_TU: urutannya juga mengikuti alur kerja bulanan (pola sama dengan
// MENU_PPABP). Dua kelompok dilipat: "Pegawai" (roster & perbaikan data, cuma
// dibuka kalau ada yang salah) dan "Dokumen SK" (SK KGB & hukuman disiplin,
// beberapa kali setahun). Yang dilipat SELALU yang jarang - langkah bulanan
// tetap datar supaya tidak menambah klik ke pekerjaan rutin.
const MENU_KASUBAG = [
  {
    href: "/kasubag",
    label: "Dashboard Unit",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },

  // --- siklus bulanan, berurutan ---
  {
    href: "/tukin/presensi",
    label: "Presensi",
    pisah: true,
    icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>,
  },
  {
    href: "/kasubag/kalkulasi",
    label: "Kalkulasi",
    icon: <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />,
  },
  { href: "/tukin", label: "Tukin", icon: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></> },
  { href: "/uang-makan", label: "Uang Makan", icon: <><path d="M5 2v6a2 2 0 0 0 4 0V2" /><path d="M7 8v14" /><path d="M17 2c1.7 1.8 2 4 2 6s-.3 3.5-2 3.5V22" /></> },
  { href: "/uang-lembur", label: "Uang Lembur", icon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></> },
  {
    href: "/kasubag/banding",
    label: "Verifikasi Banding",
    icon: <><path d="M12 3v18" /><path d="M5 7h14" /><path d="M7 7 4 14h6L7 7Z" /><path d="M17 7l-3 7h6l-3-7Z" /></>,
  },

  // --- dilipat: jarang dibuka ---
  {
    label: "Pegawai",
    pisah: true,
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
    anak: [
      { href: "/kasubag/pegawai", label: "Pegawai Unit" },
      { href: "/pegawai", label: "Data Pegawai" },
    ],
  },
  {
    label: "Dokumen SK",
    icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M9 15h6" /></>,
    anak: [
      { href: "/kasubag/sk-kgb", label: "SK KGB" },
      { href: "/kasubag/sk-hukuman-disiplin", label: "SK Hukuman Disiplin" },
    ],
  },

  {
    href: "/saya",
    label: "Data Saya",
    pisah: true,
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
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
// PPABP: URUTANNYA MENGIKUTI ALUR KERJA BULANAN, bukan abjad atau urutan
// dibangunnya fitur. Dari atas ke bawah persis langkah yang dikerjakan tiap
// periode - Presensi -> Kalkulasi -> tiga Approval -> Rekonsiliasi -> Export
// ADK. Orang tidak perlu menghafal langkah berikutnya, tinggal turun satu
// baris. Di bawahnya data pokok (dibuka kalau ada yang salah, bukan rutin),
// lalu sisanya.
//
// `pisah: true` = garis pemisah DI ATAS item itu. Sengaja tanpa judul
// kelompok, mengikuti acuan desain yang dipilih user - grup tetap kebaca dari
// jeda, dan sidebar tidak bertambah tinggi oleh label.
const MENU_PPABP = [
  {
    href: "/ppabp",
    label: "Dashboard Lintas Unit",
    icon: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  },

  // --- siklus bulanan, berurutan ---
  {
    href: "/tukin/presensi",
    label: "Presensi",
    pisah: true,
    icon: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /><path d="m9 16 2 2 4-4" /></>,
  },
  // Halamannya di bawah /kasubag karena dibangun untuk Kasubag TU duluan, TAPI
  // PPABP juga berwenang kalkulasi massal (canAjukanKalkulasiTukinMassalUnit).
  // Bedanya: satuan kerjanya dipilih lewat filter, tidak dipaksa satu unit.
  {
    href: "/kasubag/kalkulasi",
    label: "Kalkulasi",
    icon: <><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h6" /></>,
  },
  // Ketiganya disandingkan karena memang sekelompok. Labelnya cukup nama
  // domainnya - kata "Approval"/"Dashboard" tidak menambah keterangan apa pun
  // (semua halaman di sini dashboard, dan approval cuma salah satu yang bisa
  // dilakukan di situ). Ikonnya dibedakan per domain: dulu ketiganya ikon JAM
  // yang sama persis, jadi ikon tidak membedakan apa pun - dan jam keliru
  // untuk uang makan & tukin, sekaligus rancu dengan halaman Presensi.
  { href: "/tukin", label: "Tukin", icon: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></> },
  { href: "/uang-makan", label: "Uang Makan", icon: <><path d="M5 2v6a2 2 0 0 0 4 0V2" /><path d="M7 8v14" /><path d="M17 2c1.7 1.8 2 4 2 6s-.3 3.5-2 3.5V22" /></> },
  { href: "/uang-lembur", label: "Uang Lembur", icon: <><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></> },
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

  // --- data pokok: dilipat, karena dibuka saat ada yang perlu dibetulkan,
  //     bukan tiap bulan. Yang HARIAN sengaja TIDAK dilipat - menyembunyikan
  //     langkah yang dikerjakan tiap periode cuma menambah satu klik ke semua
  //     pekerjaan rutin. ---
  {
    label: "Data Pokok",
    pisah: true,
    icon: <><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z" /><path d="M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
    anak: [
      { href: "/pegawai", label: "Data Pegawai" },
      { href: "/ppabp/rekening", label: "Rekening Pegawai" },
      { href: "/ppabp/basis-data-gaji", label: "Basis Data Gaji" },
      { href: "/ppabp/gaji-induk", label: "Riwayat Gaji Pegawai" },
      { href: "/ppabp/anggaran", label: "Anggaran & Realisasi" },
    ],
  },

  // --- sisanya ---
  {
    href: "/ppabp/usulan-role",
    label: "Usulan Perubahan Role",
    pisah: true,
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  },
  {
    href: "/saya",
    label: "Data Saya",
    icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
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
  // Mark PUTIH di atas tile beraksen. Tile-nya SEKARANG biru #3F72AF, bukan
  // navy: sidebar sudah navy, jadi tile navy di atas navy tidak terlihat sama
  // sekali. Aksen kedua palet dipakai persis untuk keperluan seperti ini -
  // memisahkan blok merek dari latarnya tanpa keluar dari palet.
  return (
    <div className="grid size-11 flex-none place-items-center rounded-xl bg-biru shadow-[0_6px_16px_rgba(0,0,0,0.28)]">
      <svg viewBox="0 0 64 64" fill="none" className="size-[30px]">
        <path d="M45 16 A 21 21 0 1 0 45 48" stroke="#ffffff" strokeWidth="10.5" strokeLinecap="round" />
        <path d="M31 31 L45 31" stroke="#ffffff" strokeWidth="10.5" strokeLinecap="round" />
        <circle cx="45.5" cy="45.5" r="8" fill="#13416B" />
      </svg>
    </div>
  );
}

/**
 * Satu baris sidebar. `anak` = grup yang bisa dilipat; kalau ada, `href`
 * TIDAK dipakai (grupnya sendiri bukan halaman).
 *
 * Dilipat pakai <details> BAWAAN HTML, bukan state React: buka-tutupnya
 * ditangani browser, jadi tetap jalan tanpa JavaScript - konsisten dengan
 * janji yang dipegang filter GET, form approval, dan BadgePejabatEselon.
 * Grup yang memuat halaman yang sedang dibuka dirender `open` dari server,
 * jadi tidak pernah ada keadaan "halaman aktif tersembunyi".
 */
type ItemMenu = {
  href?: string;
  label: string;
  icon: React.ReactNode;
  pisah?: boolean;
  anak?: { href: string; label: string }[];
};

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
  account: { nama: string; jabatan: string; role: Role; rolesTersedia: Role[]; satuanKerja: string | null } | null;
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
        <span className="chip chip-navy max-w-[45vw] truncate" title={labelRole(account.role, account.satuanKerja)}>
          {labelRole(account.role, account.satuanKerja)}
        </span>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        data-sidebar
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] -translate-x-full flex-col border-r border-nav-line bg-nav-bg text-nav-text transition-transform duration-200 print:hidden md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : ""
        }`}
      >
          <div className="flex items-center gap-3 px-[22px] pb-3 pt-[22px]">
            <GajihubLogo />
            <div>
              <h1 className="text-[19px] font-extrabold leading-tight tracking-tight text-white">
                Gaji<span className="font-semibold text-nav-text">hub</span>
              </h1>
              <span className="text-[11px] font-semibold text-nav-text">oleh Kemnaker</span>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
            {(menu as ItemMenu[]).map((item) => {
              const pisah = item.pisah === true && <div className="my-2 border-t border-nav-line" />;

              // --- Grup yang bisa dilipat ---
              if (item.anak) {
                // Dirender terbuka kalau halaman yang sedang dibuka ada di
                // dalamnya - kalau tidak, item aktif jadi tak terlihat dan
                // orang mengira menunya hilang.
                const adaYangAktif = item.anak.some((a) => pathname === a.href);
                return (
                  <div key={item.label}>
                    {pisah}
                    <details open={adaYangAktif} className="group mb-1">
                      <summary
                        className={`flex cursor-pointer list-none items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold transition [&::-webkit-details-marker]:hidden ${
                          adaYangAktif ? "text-white" : "text-nav-text hover:bg-nav-hover hover:text-white"
                        }`}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          className="size-[19px] flex-none"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        >
                          {item.icon}
                        </svg>
                        <span className="flex-1">{item.label}</span>
                        <svg
                          viewBox="0 0 24 24"
                          className="size-4 flex-none transition-transform group-open:rotate-180"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </summary>

                      {/* Garis vertikal di kiri: penanda bahwa yang di dalam
                          adalah turunan, tanpa perlu indentasi berlebihan. */}
                      <div className="ml-[26px] mt-0.5 border-l border-nav-line pl-2">
                        {item.anak.map((a) => {
                          const aktif = pathname === a.href;
                          return (
                            <Link
                              key={a.href}
                              href={a.href}
                              onClick={() => setOpen(false)}
                              className={`mb-0.5 block rounded-lg px-3 py-2 text-[12.5px] font-semibold transition ${
                                aktif
                                  ? "bg-nav-active text-nav-active-text shadow-[0_6px_14px_rgba(0,0,0,0.18)]"
                                  : "text-nav-text hover:bg-nav-hover hover:text-white"
                              }`}
                            >
                              {a.label}
                            </Link>
                          );
                        })}
                      </div>
                    </details>
                  </div>
                );
              }

              // --- Item biasa ---
              const active = pathname === item.href;
              return (
                <div key={item.href}>
                  {pisah}
                  <Link
                    href={item.href!}
                    onClick={() => setOpen(false)}
                    className={`mb-1 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold transition ${
                      active
                        ? "bg-nav-active text-nav-active-text shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                        : "text-nav-text hover:bg-nav-hover hover:text-white"
                    }`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-[19px] flex-none"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    >
                      {item.icon}
                    </svg>
                    {item.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          {/* Tombol akun = menu (ganti role + logout), lihat AccountMenu.tsx.
              Logout SENGAJA tidak lagi berdiri sendiri di sini biar kaki
              sidebar tetap ringkas. */}
          <div className="border-t border-nav-line p-3.5">
            <AccountMenu
              nama={account.nama}
              jabatan={account.jabatan}
              role={account.role}
              satuanKerja={account.satuanKerja}
              rolesTersedia={account.rolesTersedia}
              initials={initials(account.nama)}
            />
          </div>
        </aside>

      <div className="min-w-0">{children}</div>

      {/* Panel kanan Notifikasi & Aktivitas - tombolnya mengambang di kanan
          atas, panelnya tertutup sampai diklik. PEGAWAI tidak dapat (ditolak
          di sisi server), jadi tombolnya tetap muncul tapi panelnya kosong -
          lihat catatan cakupan di panelKabar.ts. */}
      <PanelKabar tampilkan={account.role !== "PEGAWAI"} />
    </div>
  );
}
