"use client";

import { useState, useTransition } from "react";
import type { ModeJaringan } from "../../auth/modeJaringan";
import { ubahModeJaringanAction } from "./actionsModeJaringan";

export function ToggleModeJaringan({ modeAwal }: { modeAwal: ModeJaringan }) {
  const [mode, setMode] = useState<ModeJaringan>(modeAwal);
  const [pesan, setPesan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isInternal = mode === "INTERNAL";

  function handlePilih(target: ModeJaringan) {
    if (target === mode || isPending) return;
    setPesan(null);
    setError(null);
    startTransition(async () => {
      const res = await ubahModeJaringanAction(target);
      if (res.ok) {
        setMode(res.mode);
        setPesan(res.pesan ?? null);
      } else {
        setError(res.error ?? "Gagal mengubah mode jaringan.");
      }
    });
  }

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-navy">
              Mode Akses Jaringan Aplikasi
            </h2>
            <span
              className={`chip text-xs font-bold ${
                isInternal ? "chip-ok" : "chip-navy"
              }`}
            >
              {isInternal
                ? "JARINGAN INTERNAL (INTRANET / VPN)"
                : "AKSES PUBLIK (INTERNET / PUSDATIK)"}
            </span>
          </div>
          <p className="text-xs text-muted leading-relaxed max-w-2xl">
            {isInternal ? (
              <>
                <strong>Mode Internal Aktif:</strong> Digunakan saat akses publik diputus Pusdatik. Redirect tetap berada di IP/domain lokal, QR TTE mengarah ke server internal, dan login NIP 18 digit dibuka sebagai cadangan SSO.
              </>
            ) : (
              <>
                <strong>Mode Publik Aktif:</strong> Digunakan saat domain{" "}
                <code className="font-mono font-bold text-ink">gajihub.kemnaker.go.id</code>{" "}
                dibuka ke internet publik. Redirect diarahkan ke domain resmi, QR TTE mengarah ke domain publik, dan login umum dikunci ke SSO SIAP ID.
              </>
            )}
          </p>
        </div>

        <div className="inline-flex shrink-0 rounded-xl border border-line bg-surface-2 p-1">
          <button
            type="button"
            disabled={isPending}
            onClick={() => handlePilih("INTERNAL")}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              isInternal
                ? "bg-navy text-white shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            Jaringan Internal
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => handlePilih("PUBLIC")}
            className={`rounded-lg px-3.5 py-2 text-xs font-bold transition ${
              !isInternal
                ? "bg-navy text-white shadow-xs"
                : "text-muted hover:text-ink"
            }`}
          >
            Akses Publik
          </button>
        </div>
      </div>

      {pesan && (
        <p className="mt-3 rounded-lg border border-green/30 bg-green-tint/70 px-3 py-2 text-xs font-semibold text-green">
          {pesan}
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red/30 bg-red-tint/70 px-3 py-2 text-xs font-semibold text-red">
          {error}
        </p>
      )}
    </section>
  );
}

