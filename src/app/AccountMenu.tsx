"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Role } from "@prisma/client";
import { gantiRoleAction, logoutAction, type GantiRoleFormState } from "./login/actions";
import { LABEL_ROLE } from "../auth/roleLabel";

const INITIAL_STATE: GantiRoleFormState = {};

/**
 * Tombol akun di kaki sidebar - sekarang jadi MENU (popover), bukan cuma
 * kartu identitas + tombol Logout terpisah di bawahnya. Isinya:
 *   - "Ganti role" (cuma muncul kalau akun punya lebih dari satu role,
 *     lihat rolesTambahan di model User) - buat kemudahan testing lintas
 *     role tanpa logout-login pakai NIP orang lain;
 *   - Logout.
 *
 * Role yang sedang aktif ditandai dan tidak bisa diklik. Pergantian role
 * TETAP diverifikasi ulang di server (gantiRoleAction) - daftar di sini cuma
 * tampilan, jangan dianggap sebagai pembatas keamanan.
 */
export function AccountMenu({
  nama,
  jabatan,
  role,
  rolesTersedia,
  initials,
}: {
  nama: string;
  jabatan: string;
  role: Role;
  rolesTersedia: Role[];
  initials: string;
}) {
  const [buka, setBuka] = useState(false);
  const [state, gantiRole, pending] = useActionState(gantiRoleAction, INITIAL_STATE);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const multiRole = rolesTersedia.length > 1;

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
        <div className="absolute bottom-[calc(100%+8px)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-white/10 bg-[#132244] shadow-[0_18px_40px_rgba(0,0,0,0.45)]">
          {multiRole && (
            <>
              <div className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[1.2px] text-[#6f81a6]">
                Ganti role
              </div>
              {rolesTersedia.map((r) => {
                const aktif = r === role;
                return (
                  <form key={r} action={gantiRole}>
                    <input type="hidden" name="role" value={r} />
                    <button
                      type="submit"
                      disabled={aktif || pending}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12.5px] font-semibold transition ${
                        aktif
                          ? "cursor-default text-white"
                          : "text-[#c0cae0] hover:bg-white/[.07] hover:text-white disabled:opacity-60"
                      }`}
                    >
                      {LABEL_ROLE[r]}
                      {aktif && (
                        <svg viewBox="0 0 24 24" className="size-4 flex-none text-[#3fd0b3]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </button>
                  </form>
                );
              })}
              {state.error && <p className="px-3 pb-1.5 text-[11px] font-semibold text-[#ff9d9d]">{state.error}</p>}
              <div className="my-1 border-t border-white/10" />
            </>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full px-3 py-2.5 text-left text-[12.5px] font-bold text-[#c0cae0] transition hover:bg-white/[.07] hover:text-white"
            >
              Logout
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        aria-haspopup="menu"
        className="flex w-full items-center gap-2.5 rounded-[10px] bg-white/[.04] p-2.5 text-left transition hover:bg-white/[.08]"
      >
        <div className="grid size-[34px] flex-none place-items-center rounded-[9px] bg-gradient-to-br from-gold to-gold-deep text-[13px] font-extrabold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12.5px] font-bold leading-tight text-white">{nama}</div>
          <div className="truncate text-[10.5px] text-[#8ea0c0]">
            {LABEL_ROLE[role]} &middot; {jabatan}
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          className={`size-4 flex-none text-[#8ea0c0] transition-transform ${buka ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="m18 15-6-6-6 6" />
        </svg>
      </button>

      {multiRole && (
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-[#6f81a6]">
          Akun ini punya {rolesTersedia.length} role - klik nama di atas buat ganti sudut pandang.
        </p>
      )}
    </div>
  );
}
