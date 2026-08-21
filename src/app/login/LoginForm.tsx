"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "./actions";

const INITIAL_STATE: LoginFormState = {};

/**
 * Kotak isian login.
 *
 * Placeholder-nya BERPERAN SEBAGAI LABEL (tidak ada label kasat mata di
 * atasnya), dan itu punya dua akibat yang harus ditangani - bukan pilihan
 * gaya belaka:
 *
 * 1. Warnanya tidak boleh `text-muted` (#5F7085). Di atas latar kabut
 *    (#DBE2EF) rasionya cuma 3,90:1 - di bawah 4,5:1 WCAG AA. Untuk teks
 *    hiasan itu masih bisa ditawar, untuk teks yang MERANGKAP nama field
 *    tidak. Dipakai `text-ink-2` (#3A5A7D) = 5,49:1.
 * 2. Labelnya tetap harus ADA di DOM buat pembaca layar, cuma disembunyikan
 *    secara visual (`sr-only`). Placeholder saja tidak dibacakan sebagai nama
 *    field, dan begitu orang mulai mengetik, placeholder-nya hilang - jadi
 *    nama field-nya ikut hilang buat siapa pun.
 */
const KELAS_FIELD =
  "w-full rounded-xl border border-transparent bg-line py-3.5 pl-4 pr-12 text-sm font-semibold text-ink " +
  "outline-none transition placeholder:font-semibold placeholder:text-ink-2 " +
  "focus:border-biru focus:bg-white focus:shadow-[0_0_0_3px_rgba(63,114,175,0.18)]";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="nip" className="sr-only">
          NIP
        </label>
        <div className="relative">
          <input
            id="nip"
            name="nip"
            required
            autoFocus
            placeholder="NIP"
            autoComplete="username"
            // NIP itu 18 angka - `inputMode` memunculkan papan tombol angka di
            // HP. SENGAJA bukan `type="number"`: itu membuang nol di depan,
            // dan sebagian NIP diawali nol.
            inputMode="numeric"
            className={KELAS_FIELD}
          />
          <IkonOrang />
        </div>
      </div>

      <div>
        <label htmlFor="password" className="sr-only">
          Password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type="password"
            required
            placeholder="Password"
            autoComplete="current-password"
            className={KELAS_FIELD}
          />
          <IkonGembok />
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="btn btn-primary mt-2 w-full rounded-xl py-3.5 text-base"
      >
        {pending ? "Memproses..." : "Login"}
      </button>

      {/* role="alert" supaya kegagalan login ikut dibacakan pembaca layar -
          tanpa itu, yang terjadi cuma teks muncul diam-diam di bawah tombol. */}
      {state.error && (
        <p role="alert" className="pt-1 text-center text-sm font-semibold text-red">
          {state.error}
        </p>
      )}

      {/* Pertanyaan pertama orang yang belum pernah masuk, dan sampai sekarang
          tidak ada yang menjawabnya di halaman ini. */}
      <p className="pt-2 text-center text-xs text-muted">Masuk memakai NIP.</p>
    </form>
  );
}

/* Ikon di dalam field. `pointer-events-none` supaya klik di atasnya tetap
   jatuh ke input, bukan tertelan ikonnya. */
function IkonOrang() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-navy"
      fill="currentColor"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20a8 8 0 0 1 16 0Z" />
    </svg>
  );
}

function IkonGembok() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-navy"
      fill="currentColor"
    >
      <path d="M7 10V7a5 5 0 0 1 10 0v3h-2V7a3 3 0 0 0-6 0v3Z" />
      <rect x="5" y="10" width="14" height="11" rx="2.5" />
    </svg>
  );
}
