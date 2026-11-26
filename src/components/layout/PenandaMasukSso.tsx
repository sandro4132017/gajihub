"use client";

import { useEffect, useState } from "react";
import { COOKIE_MASUK_SSO } from "../../auth/penandaMasukSso";

/**
 * Pita "Kamu masuk sebagai ..." yang tampil SEKALI sesudah login lewat Akun
 * Kemnaker. Penjaga untuk komputer yang dipakai bergantian: Akun Kemnaker
 * menyimpan login-nya sendiri di browser, jadi orang berikutnya bisa langsung
 * masuk sebagai pemakai sebelumnya tanpa diminta kata sandi.
 *
 * Penandanya cookie singkat yang diisi `/login/sso/callback`; langsung dihapus
 * begitu terbaca, jadi muat ulang tidak memunculkannya lagi.
 */
export function PenandaMasukSso({ nama }: { nama: string }) {
  const [tampil, setTampil] = useState(false);

  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c === `${COOKIE_MASUK_SSO}=1`)) return;
    document.cookie = `${COOKIE_MASUK_SSO}=; Max-Age=0; path=/`;
    setTampil(true);
  }, []);

  if (!tampil) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-teal-tint px-5 py-2.5 text-sm text-navy print:hidden"
    >
      <span>
        Kamu masuk sebagai <strong>{nama}</strong>.
      </span>
      <span className="text-ink-2">
        Bukan kamu? Keluar dari Gajihub, lalu di halaman login pilih &quot;Keluar dari Akun Kemnaker&quot; dan
        masuk dengan akunmu.
      </span>
      <button
        type="button"
        onClick={() => setTampil(false)}
        className="ml-auto text-xs font-semibold text-biru-deep hover:underline"
      >
        Tutup
      </button>
    </div>
  );
}
