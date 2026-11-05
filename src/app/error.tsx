"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // error.message sengaja tidak dirender: bisa memuat detail internal. Pengguna
  // hanya diberi kode rujukan (istilah sama dengan galatSumber.ts) untuk dilaporkan.
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div role="alert">
        <h1 className="text-2xl font-bold text-navy">Halaman gagal dimuat</h1>
        <p className="mt-2 text-sm text-muted">
          Coba muat ulang halaman ini. Kalau masih gagal, laporkan ke Admin Gajihub.
        </p>
        {error?.digest && (
          <p className="mt-2 font-mono text-xs text-muted">kode rujukan {error.digest}</p>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={() => reset()}
          className="btn btn-secondary rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Coba Lagi
        </button>
        <Link
          href="/login"
          className="btn btn-primary rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          Halaman Utama
        </Link>
      </div>
    </div>
  );
}
