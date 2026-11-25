"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Garis tipis di tepi atas layar selama pindah halaman - tanda bahwa klik
 * sudah diterima. Tanpa ini, halaman yang datanya diambil di server terlihat
 * diam beberapa saat dan orang mengklik lagi.
 *
 * Mulai: klik tautan internal (tanpa Ctrl/Shift, bukan unduhan / tab baru)
 * atau kirim form GET. Selesai: alamat (path atau query) berubah. Batas 15
 * detik supaya garisnya tidak menggantung kalau navigasinya batal.
 * Tanpa dependency - murni state + transisi CSS.
 */
export function BarProgresNavigasi() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [tahap, setTahap] = useState<"diam" | "jalan" | "selesai">("diam");
  const batas = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Alamat berubah = halaman baru sudah tampil.
  const kunciAlamat = `${pathname}?${searchParams.toString()}`;
  useEffect(() => {
    setTahap((t) => (t === "jalan" ? "selesai" : t));
  }, [kunciAlamat]);

  useEffect(() => {
    if (tahap !== "selesai") return;
    const t = setTimeout(() => setTahap("diam"), 300);
    return () => clearTimeout(t);
  }, [tahap]);

  useEffect(() => {
    const mulai = () => {
      if (batas.current) clearTimeout(batas.current);
      setTahap("jalan");
      batas.current = setTimeout(() => setTahap("selesai"), 15_000);
    };

    const onKlik = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const tujuan = new URL(a.href, window.location.href);
      if (tujuan.origin !== window.location.origin) return;
      // Unduhan (export, berkas) tidak berpindah halaman.
      if (/\/(export|berkas|api)(\/|$)/.test(tujuan.pathname)) return;
      // Tautan ke alamat yang sama (atau cuma #jangkar) tidak memuat apa pun.
      const sekarang = new URL(window.location.href);
      if (tujuan.pathname === sekarang.pathname && tujuan.search === sekarang.search) return;
      mulai();
    };

    const onKirim = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      if (!f || e.defaultPrevented) return;
      if ((f.getAttribute("method") ?? "get").toLowerCase() !== "get") return;
      mulai();
    };

    document.addEventListener("click", onKlik);
    document.addEventListener("submit", onKirim);
    return () => {
      document.removeEventListener("click", onKlik);
      document.removeEventListener("submit", onKirim);
      if (batas.current) clearTimeout(batas.current);
    };
  }, []);

  if (tahap === "diam") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 print:hidden">
      <div
        className={`h-full bg-biru shadow-[0_0_6px_rgba(63,114,175,0.6)] ${
          tahap === "jalan" ? "w-[85%]" : "w-full opacity-0 transition-[width,opacity] duration-300"
        }`}
        // Memanjang cepat lalu melambat mendekati 85% - tidak pernah "penuh"
        // sebelum halaman benar-benar tiba.
        style={tahap === "jalan" ? { animation: "gj-bar-jalan 8s cubic-bezier(0.1, 0.7, 0.2, 1) both" } : undefined}
      />
    </div>
  );
}
