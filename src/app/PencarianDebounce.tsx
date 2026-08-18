"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Jeda sebelum pencarian dikirim, dalam milidetik. */
const JEDA_MS = 400;

/**
 * Kotak pencarian yang menembak sendiri setelah berhenti mengetik (debounce),
 * menggantikan pola "ketik lalu klik Cari" di seluruh aplikasi.
 *
 * KENAPA 400 ms: cukup lama untuk melewatkan jeda antar huruf saat mengetik
 * normal, cukup pendek untuk tidak terasa seperti aplikasi yang menggantung.
 * Tanpa jeda, mengetik "Kharina" berarti 7 query ke tabel 5.000+ baris dan 6
 * di antaranya hasilnya langsung dibuang.
 *
 * TIGA HAL YANG SENGAJA DIPERTAHANKAN dari versi form biasa:
 *
 *  1. **Statusnya tetap di URL** (`?q=`), bukan di state klien. Link hasil
 *     pencarian tetap bisa dibagikan, tombol Back tetap berarti, dan filter
 *     lain di halaman yang sama (satker, periode, jenis) tidak hilang - semua
 *     parameter yang sudah ada disalin ulang, cuma `q` yang diubah.
 *  2. **Tetap jalan tanpa JavaScript.** Komponen ini dipasang DI DALAM
 *     `<form method="get">` yang sudah ada, dan tombol submit-nya tidak
 *     dihapus. Tanpa JS, mengetik lalu menekan tombol/Enter tetap bekerja
 *     persis seperti sebelumnya - yang hilang cuma otomatisnya.
 *  3. **`router.replace`, bukan `push`.** Kalau setiap jeda ketik menambah
 *     satu entri riwayat, tombol Back jadi memutar ulang ketikan huruf per
 *     huruf, bukan kembali ke halaman sebelumnya.
 *
 * Nomor halaman ikut di-reset. Hasil pencarian baru hampir selalu lebih
 * pendek, dan bertahan di "halaman 5" berarti mendarat di tabel kosong yang
 * terlihat seperti "tidak ada hasil".
 */
export function PencarianDebounce({
  defaultValue,
  placeholder,
  name = "q",
  className = "field-input",
}: {
  defaultValue?: string;
  placeholder?: string;
  name?: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [nilai, setNilai] = useState(defaultValue ?? "");
  const [pending, startTransition] = useTransition();

  // Nilai yang sedang berlaku di URL. Dipakai supaya timer tidak menembakkan
  // navigasi ke nilai yang memang sudah tampil - mis. saat komponen di-mount
  // ulang dengan ?q= yang sudah terisi.
  const terkirim = useRef(defaultValue ?? "");

  useEffect(() => {
    if (nilai === terkirim.current) return;
    const timer = setTimeout(() => {
      terkirim.current = nilai;
      const params = new URLSearchParams(searchParams.toString());
      if (nilai.trim() === "") params.delete(name);
      else params.set(name, nilai.trim());
      params.delete("hal");
      const qs = params.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    }, JEDA_MS);
    return () => clearTimeout(timer);
  }, [nilai, name, pathname, router, searchParams]);

  return (
    <div className="relative">
      <input
        type="text"
        name={name}
        value={nilai}
        onChange={(e) => setNilai(e.target.value)}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {pending && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
          mencari...
        </span>
      )}
    </div>
  );
}
