"use client";

import Link from "next/link";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold text-navy">500</h1>
      <p className="mt-2 text-lg font-medium text-ink">Terjadi Kesalahan pada Server</p>
      <p className="mt-1 text-sm text-muted">
        Permintaan Anda tidak dapat diproses saat ini. Silakan coba beberapa saat lagi.
      </p>
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

