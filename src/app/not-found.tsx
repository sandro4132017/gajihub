import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold text-navy">404</h1>
      <p className="mt-2 text-lg font-medium text-ink">Halaman Tidak Ditemukan</p>
      <p className="mt-1 text-sm text-muted">
        Halaman yang Anda tuju tidak tersedia atau telah dipindahkan.
      </p>
      <Link
        href="/login"
        className="btn btn-primary mt-6 inline-flex rounded-xl px-6 py-2.5 text-sm font-semibold"
      >
        Kembali ke Halaman Utama
      </Link>
    </div>
  );
}

