"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import { labelPilihanRole, labelRole } from "../auth/roleLabel";

/**
 * Tombol akun di kaki sidebar - sekarang jadi MENU (popover), bukan cuma
 * kartu identitas + tombol Logout terpisah di bawahnya. Isinya:
 *   - "Ganti role" (cuma muncul kalau akun punya lebih dari satu role,
 *     lihat rolesTambahan di model User) - buat kemudahan testing lintas
 *     role tanpa logout-login pakai NIP orang lain;
 *   - Logout.
 *
 * Menggunakan Route Handler API standar via fetch agar 100% kebal dari masalah
 * Server Action CSRF mismatch saat berjalan di belakang reverse proxy Pusdatik.
 */
export function AccountMenu({
  nama,
  jabatan,
  role,
  rolesTersedia,
  satuanKerja,
  initials,
  ringkas = false,
}: {
  nama: string;
  jabatan: string;
  role: Role;
  rolesTersedia: Role[];
  /** Unit akun - cuma dipakai melengkapi label Kasubag TU (lihat labelRole). */
  satuanKerja: string | null;
  initials: string;
  /**
   * Sidebar sedang diciutkan jadi rel ikon - tombolnya menyusut jadi kotak
   * inisial saja. Menunya sendiri TIDAK ikut menyusut: "Ganti role" dan
   * "Logout" tetap perlu terbaca, jadi panelnya diberi lebar tetap dan
   * dibiarkan melebar ke kanan melewati rel.
   */
  ringkas?: boolean;
}) {
  const [buka, setBuka] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const multiRole = rolesTersedia.length > 1;

  async function onPilihRole(r: Role) {
    if (r === role || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/ganti-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: r }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        window.location.href = data.redirect || "/";
        return;
      }
      setError(data.error || "Gagal mengganti role.");
      setPending(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan koneksi ke server.");
      setPending(false);
    }
  }

  async function onLogout() {
    setPending(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  // Tutup menu kalau klik di luar / tekan Escape - perilaku popover biasa.
  useEffect(() => {
    if (!buka) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setBuka(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setBuka(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [buka]);

  return (
    <div ref={wrapperRef} className="relative">
      {buka && (
        <div
          className={`absolute bottom-[calc(100%+8px)] left-0 z-50 overflow-hidden rounded-xl border border-line bg-surface shadow-[0_18px_40px_rgba(19,65,107,0.18)] ${
            ringkas ? "w-60" : "right-0"
          }`}
        >
          {multiRole && (
            <>
              <div className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[1.2px] text-muted">
                Ganti role
              </div>
              {rolesTersedia.map((r) => {
                const aktif = r === role;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => onPilihRole(r)}
                    disabled={aktif || pending}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] font-semibold transition ${
                      aktif
                        ? "cursor-default font-bold text-navy"
                        : "text-ink-2 hover:bg-line-2 hover:text-navy disabled:opacity-60"
                    }`}
                  >
                    <span className="truncate">{labelPilihanRole(r)}</span>
                    {aktif && (
                      <svg viewBox="0 0 24 24" className="size-4 flex-none text-biru" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
              {error && <p className="px-3 pb-1.5 text-[11px] font-semibold text-red">{error}</p>}
              <div className="my-1 border-t border-line" />
            </>
          )}
          <button
            type="button"
            onClick={onLogout}
            disabled={pending}
            className="w-full px-3 py-2.5 text-left text-[12.5px] font-bold text-ink-2 transition hover:bg-line-2 hover:text-navy disabled:opacity-60"
          >
            {pending ? "Memproses..." : "Logout"}
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        aria-haspopup="menu"
        // Nama & role dipakai sebagai title waktu ringkas - di rel, kotak
        // inisial sendirian tidak memberi tahu sedang masuk sebagai siapa,
        // dan itu keterangan yang paling tidak boleh hilang di aplikasi yang
        // sudut pandangnya bisa diganti-ganti lewat menu ini juga.
        title={ringkas ? `${nama} - ${labelRole(role, satuanKerja)}` : undefined}
        className={`flex w-full items-center rounded-xl border border-nav-line bg-nav-hover text-left transition hover:border-nav-text ${
          ringkas ? "justify-center p-1.5" : "gap-2.5 p-2.5"
        }`}
      >
        <div className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-biru text-[13px] font-extrabold text-white">
          {initials}
        </div>
        {!ringkas && (
          <>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12.5px] font-bold leading-tight text-white">{nama}</div>
              <div className="truncate text-[10.5px] text-nav-text">
                {labelRole(role, satuanKerja)} &middot; {jabatan}
              </div>
            </div>
            <svg
              viewBox="0 0 24 24"
              className={`size-4 flex-none text-nav-text transition-transform ${buka ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="m18 15-6-6-6 6" />
            </svg>
          </>
        )}
      </button>

      {multiRole && !ringkas && (
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-nav-text">
          Akun ini punya {rolesTersedia.length} role - klik nama di atas buat ganti sudut pandang.
        </p>
      )}
    </div>
  );
}
