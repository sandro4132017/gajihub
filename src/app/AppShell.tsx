"use client";

import { type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./AccountMenu";
import { PanelKabar } from "./PanelKabar";
import { GajihubLogo } from "./GajihubLogo";
import { labelRole } from "../auth/roleLabel";
import { TAMPILKAN_MENU_LEMBUR } from "./tampilUangLembur";
import type { Role } from "@prisma/client";
import type { IconType } from "react-icons";
import {
  RiAwardLine,
  RiCalculatorLine,
  RiCalendarCheckLine,
  RiDatabase2Line,
  RiExchangeLine,
  RiFileDownloadLine,
  RiFileWarningLine,
  RiFolder2Line,
  RiMoneyDollarCircleLine,
  RiScalesLine,
  RiSettingsLine,
  RiUserSettingsLine,
} from "react-icons/ri";
import { FiUser } from "react-icons/fi";
import { GrDocument, GrDocumentUser, GrGroup, GrUserAdmin } from "react-icons/gr";
import { IoMdCheckboxOutline } from "react-icons/io";
import { FaClock, FaUtensils } from "react-icons/fa6";
import { MdSpaceDashboard } from "react-icons/md";

const MENU_PREDIKAT_KINERJA = {
  href: "/tukin/predikat-kinerja",
  label: "Predikat Kinerja",
  Ikon: RiAwardLine,
};

const MENU_UANG_LEMBUR = TAMPILKAN_MENU_LEMBUR
  ? [
      {
        href: "/uang-lembur",
        label: "Uang Lembur",
        Ikon: FaClock,
      },
    ]
  : [];

const MENU_APPROVER = [
  {
    href: "/tukin",
    label: "Tukin",
    Ikon: RiMoneyDollarCircleLine,
  },
  {
    href: "/uang-makan",
    label: "Uang Makan",
    Ikon: FaUtensils,
  },
  ...MENU_UANG_LEMBUR,
];

const MENU_KASUBAG = [
  {
    href: "/kasubag",
    label: "Dashboard Unit",
    Ikon: MdSpaceDashboard,
  },

  // --- siklus bulanan, berurutan ---
  {
    href: "/tukin/presensi",
    label: "Presensi",
    pisah: true,
    Ikon: RiCalendarCheckLine,
  },
  MENU_PREDIKAT_KINERJA,
  {
    href: "/kasubag/kalkulasi",
    label: "Kalkulasi",
    Ikon: RiCalculatorLine,
  },
  { href: "/tukin", label: "Tukin", Ikon: RiMoneyDollarCircleLine },
  { href: "/uang-makan", label: "Uang Makan", Ikon: FaUtensils },
  ...MENU_UANG_LEMBUR,
  {
    href: "/kasubag/banding",
    label: "Verifikasi Banding",
    Ikon: RiScalesLine,
  },

  {
    href: "/kasubag/pegawai",
    label: "Pegawai Unit",
    pisah: true,
    Ikon: GrGroup,
  },
  {
    label: "Dokumen SK",
    Ikon: RiFolder2Line,
    anak: [
      { href: "/kasubag/sk-kgb", label: "SK KGB" },
      { href: "/kasubag/sk-hukuman-disiplin", label: "SK Hukuman Disiplin" },
    ],
  },

  {
    href: "/saya",
    label: "Data Saya",
    pisah: true,
    Ikon: FiUser,
  },
];

const MENU_OSDMA = [
  {
    href: "/osdma",
    label: "Dashboard OSDMA",
    Ikon: MdSpaceDashboard,
  },
  {
    href: "/osdma/banding",
    label: "Approval Final Banding",
    Ikon: IoMdCheckboxOutline,
  },
  {
    href: "/osdma/sk-kgb",
    label: "SK KGB",
    Ikon: GrDocument,
  },
  {
    href: "/osdma/sk-hukuman-disiplin",
    label: "SK Hukuman Disiplin",
    Ikon: RiFileWarningLine,
  },
  {
    href: "/osdma/update-sk",
    label: "Update SK Pegawai",
    Ikon: GrDocumentUser,
  },
  {
    href: "/saya",
    label: "Data Saya",
    Ikon: FiUser,
  },
];

const MENU_PPABP = [
  {
    href: "/ppabp",
    label: "Dashboard Lintas Unit",
    Ikon: MdSpaceDashboard,
  },

  // --- siklus bulanan, berurutan ---
  {
    href: "/tukin/presensi",
    label: "Presensi",
    pisah: true,
    Ikon: RiCalendarCheckLine,
  },
  MENU_PREDIKAT_KINERJA,
  { href: "/tukin", label: "Tukin", Ikon: RiMoneyDollarCircleLine },
  { href: "/uang-makan", label: "Uang Makan", Ikon: FaUtensils },
  ...MENU_UANG_LEMBUR,
  {
    href: "/ppabp/banding",
    label: "Tembusan Banding",
    Ikon: RiScalesLine,
  },
  {
    href: "/ppabp/rekonsiliasi",
    label: "Rekonsiliasi",
    Ikon: RiExchangeLine,
  },
  {
    href: "/ppabp/adk",
    label: "Export ADK",
    Ikon: RiFileDownloadLine,
  },

  {
    label: "Data Pokok",
    pisah: true,
    Ikon: RiDatabase2Line,
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
    Ikon: GrUserAdmin,
  },
  {
    href: "/saya",
    label: "Data Saya",
    Ikon: FiUser,
  },
];

const MENU_ADMIN = [
  {
    href: "/admin",
    label: "Dashboard Admin",
    Ikon: MdSpaceDashboard,
  },
  {
    href: "/admin/role-assignment",
    label: "Kelola Assignment Role",
    Ikon: GrUserAdmin,
  },
  {
    href: "/pegawai",
    label: "Data Pegawai",
    Ikon: GrGroup,
  },
  {
    href: "/admin/usulan-role",
    label: "Eksekusi Usulan Role",
    Ikon: RiUserSettingsLine,
  },
  {
    href: "/admin/sistem",
    label: "Konfigurasi & Kesehatan Sistem",
    Ikon: RiSettingsLine,
  },
  {
    href: "/saya",
    label: "Data Saya",
    Ikon: FiUser,
  },
];

const MENU_PIMPINAN = [
  {
    href: "/pimpinan",
    label: "Dashboard Lintas Unit",
    Ikon: MdSpaceDashboard,
  },
  {
    href: "/saya",
    label: "Data Saya",
    Ikon: FiUser,
  },
];

const MENU_PEGAWAI = [
  {
    href: "/saya",
    label: "Data Saya",
    Ikon: FiUser,
  },
];

type ItemMenu = {
  href?: string;
  label: string;
  icon?: React.ReactNode;
  Ikon?: IconType;
  pisah?: boolean;
  anak?: { href: string; label: string }[];
};

function IkonMenu({ item, kelas = "" }: { item: ItemMenu; kelas?: string }) {
  if (item.Ikon) return <item.Ikon aria-hidden className={`size-[19px] ${kelas}`} />;
  return (
    <svg
      viewBox="0 0 24 24"
      className={`size-[19px] ${kelas}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {item.icon}
    </svg>
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
  account: { nama: string; jabatan: string; role: Role; rolesTersedia: Role[]; satuanKerja: string | null } | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [ciut, setCiut] = useState(false);

  if (!account) {
    return <>{children}</>;
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
    <div
      className={`min-h-screen print:block md:grid ${
        ciut ? "md:grid-cols-[68px_1fr]" : "md:grid-cols-[264px_1fr]"
      }`}
    >
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[264px] -translate-x-full flex-col border-r border-nav-line bg-nav-bg text-nav-text transition-transform duration-200 print:hidden ${
          open ? "translate-x-0" : ""
        } md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          // Diciutkan = MENYUSUT jadi rel ikon, BUKAN menghilang.
          //
          // Versi sebelumnya memakai md:hidden, dan itu keliru: satu klik
          // membuat seluruh navigasi lenyap, dan satu-satunya jalan kembali
          // adalah tombol mengambang yang menimpa judul halaman. Rel selebar
          // 68px tetap memperlihatkan di mana orangnya berada (pil putih item
          // aktif masih terlihat) sekaligus mengembalikan ~200px ke isi halaman.
          //
          // `ciut` sengaja hanya berlaku di layar lebar (md:). Di HP sidebar
          // ini memang sudah tersembunyi dan dibuka lewat `open` - kalau `ciut`
          // ikut campur, tombol hamburger HP jadi tidak berfungsi.
          ciut ? "md:w-[68px]" : ""
        }`}
      >
          {/* Kepala sidebar punya dua bentuk. Di rel, wordmark & keterangan
              dibuang tapi LOGONYA TETAP - itu satu-satunya penanda aplikasi apa
              yang sedang dibuka, dan rel tanpa identitas terbaca seperti bilah
              ikon milik browser, bukan bagian dari halaman.

              Tombol ciut/lebarkan ADA DI KEDUA bentuk. Di rel ia turun ke baris
              sendiri di bawah logo: 68px tidak cukup untuk logo dan tombol
              berdampingan tanpa keduanya jadi terlalu kecil untuk disentuh. */}
          <div
            className={`flex items-center pb-3 pt-[22px] ${
              ciut ? "flex-col gap-2 px-2" : "gap-3 px-[22px]"
            }`}
          >
            <GajihubLogo />
            {!ciut && (
              <div className="min-w-0 flex-1">
                <h1 className="text-[19px] font-extrabold leading-tight tracking-tight text-white">
                  Gaji<span className="font-semibold text-nav-text">hub</span>
                </h1>
                <span className="text-[11px] font-semibold text-nav-text">oleh Kemnaker</span>
              </div>
            )}
            {/* `hidden md:grid` - di HP penutupnya sudah ada dua (hamburger &
                latar gelap), jadi tombol ketiga cuma menambah bingung. */}
            <button
              type="button"
              onClick={() => setCiut((v) => !v)}
              aria-label={ciut ? "Lebarkan menu samping" : "Ciutkan menu samping"}
              aria-expanded={!ciut}
              title={ciut ? "Lebarkan menu samping" : "Ciutkan menu samping"}
              className="hidden size-8 shrink-0 place-items-center rounded-lg border border-nav-line text-nav-text transition hover:bg-nav-hover hover:text-white md:grid"
            >
              <svg
                viewBox="0 0 24 24"
                className={`size-4 transition-transform ${ciut ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
                <path d="M4 4v16" />
              </svg>
            </button>
          </div>

          <nav className={`flex-1 overflow-y-auto pb-3 pt-2 ${ciut ? "px-2.5" : "px-3"}`}>
            {(menu as ItemMenu[]).map((item, urutan) => {
              // Item menu masuk berurutan atas ke bawah waktu halaman dimuat
              // pertama kali. AppShell adalah layout - ia TIDAK dipasang ulang
              // saat pindah halaman, jadi ini tidak terulang tiap klik menu.
              const tunda = { animationDelay: `${urutan * 40}ms` };
              // Di rel, pemisahnya dipendekkan & diberi napas lebih -
              // garis selebar penuh di kolom 68px terbaca seperti tepi kotak,
              // bukan seperti jeda antar kelompok.
              const pisah = item.pisah === true && (
                <div className={`border-t border-nav-line ${ciut ? "mx-2 my-2.5" : "my-2"}`} />
              );

              // --- Grup yang bisa dilipat ---
              if (item.anak) {
                // Dirender terbuka kalau halaman yang sedang dibuka ada di
                // dalamnya - kalau tidak, item aktif jadi tak terlihat dan
                // orang mengira menunya hilang.
                const adaYangAktif = item.anak.some((a) => pathname === a.href);

                // DI REL, kelompok tidak bisa dilipat-buka: daftar anaknya butuh
                // label, dan label tidak muat di 68px. Ikonnya diganti tombol
                // yang MELEBARKAN sidebar - jadi kliknya tetap membawa ke tempat
                // yang dituju, cuma lewat satu langkah. Menyembunyikan kelompok
                // sama sekali di rel jauh lebih buruk: di menu PPABP & Kasubag
                // TU, dua kelompok itu memuat halaman yang tidak punya jalan
                // masuk lain.
                if (ciut) {
                  return (
                    <div key={item.label} className="gj-masuk" style={tunda}>
                      {pisah}
                      <button
                        type="button"
                        onClick={() => setCiut(false)}
                        title={item.label}
                        aria-label={`${item.label} - lebarkan menu untuk memilih`}
                        className={`mb-1 grid h-11 w-full place-items-center rounded-xl transition ${
                          adaYangAktif
                            ? "bg-nav-hover text-white"
                            : "text-nav-text hover:bg-nav-hover hover:text-white"
                        }`}
                      >
                        <IkonMenu item={item} />
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={item.label} className="gj-masuk" style={tunda}>
                    {pisah}
                    <details open={adaYangAktif} className="group mb-1">
                      <summary
                        className={`flex cursor-pointer list-none items-center gap-3 rounded-xl px-3.5 py-2.5 text-[13.5px] font-bold transition [&::-webkit-details-marker]:hidden ${
                          adaYangAktif ? "text-white" : "text-nav-text hover:bg-nav-hover hover:text-white"
                        }`}
                      >
                        <IkonMenu item={item} kelas="flex-none" />
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
                <div key={item.href} className="gj-masuk" style={tunda}>
                  {pisah}
                  <Link
                    href={item.href!}
                    onClick={() => setOpen(false)}
                    // title = keterangan waktu diciutkan. SENGAJA memakai
                    // tooltip bawaan browser, bukan gelembung buatan sendiri:
                    // <nav> ini bergulir (menu terpanjang 11 item + pemisah,
                    // dan tidak semua layar setinggi itu), dan elemen
                    // absolute di dalam kotak yang bergulir akan TERPOTONG di
                    // tepi kanannya. Gelembung bergaya butuh portal + hitungan
                    // posisi dari JavaScript; itu bisa ditambahkan nanti kalau
                    // memang diminta.
                    //
                    // aria-label tetap diisi supaya pembaca layar dapat nama
                    // menunya - `title` sendirian tidak bisa diandalkan.
                    title={ciut ? item.label : undefined}
                    aria-label={ciut ? item.label : undefined}
                    className={`mb-1 flex items-center rounded-xl font-bold transition ${
                      ciut ? "h-11 justify-center" : "gap-3 px-3.5 py-2.5 text-[13.5px]"
                    } ${
                      active
                        ? "bg-nav-active text-nav-active-text shadow-[0_8px_18px_rgba(0,0,0,0.22)]"
                        : "text-nav-text hover:bg-nav-hover hover:text-white"
                    }`}
                  >
                    <IkonMenu item={item} kelas="flex-none" />
                    {!ciut && item.label}
                  </Link>
                </div>
              );
            })}
          </nav>

          {/* Tombol akun = menu (ganti role + logout), lihat AccountMenu.tsx.
              Logout SENGAJA tidak lagi berdiri sendiri di sini biar kaki
              sidebar tetap ringkas. */}
          <div className={`border-t border-nav-line ${ciut ? "p-2.5" : "p-3.5"}`}>
            <AccountMenu
              nama={account.nama}
              jabatan={account.jabatan}
              role={account.role}
              satuanKerja={account.satuanKerja}
              rolesTersedia={account.rolesTersedia}
              initials={initials(account.nama)}
              ringkas={ciut}
            />
          </div>
        </aside>

      {/* Tidak perlu padding tambahan waktu diciutkan: rel ikonnya memakai
          kolom grid sendiri (68px), jadi isi halaman tidak pernah tertimpa.
          Dulu perlu, karena sidebar yang diciutkan benar-benar hilang dan
          tombol pemunculnya mengambang di atas judul halaman. */}
      <div className="min-w-0">{children}</div>

      {/* Panel kanan Notifikasi & Aktivitas - tombolnya mengambang di kanan
          atas, panelnya tertutup sampai diklik. PEGAWAI tidak dapat (ditolak
          di sisi server), jadi tombolnya tetap muncul tapi panelnya kosong -
          lihat catatan cakupan di panelKabar.ts. */}
      <PanelKabar tampilkan={account.role !== "PEGAWAI"} />
    </div>
  );
}
