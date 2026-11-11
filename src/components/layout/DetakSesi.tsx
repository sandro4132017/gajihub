"use client";

import { useEffect } from "react";

/** Paling sering sekali per 5 menit: jauh di bawah batas menganggur 30 menit. */
export const JEDA_DETAK_MS = 5 * 60 * 1000;

/**
 * Detak interaksi. Server menghitung "aktivitas" dari navigasi dan aksi, tetapi
 * orang yang lama mengetik atau membaca satu halaman panjang tidak memicu
 * permintaan apa pun dan akan dianggap menganggur. Komponen ini meneruskan
 * interaksi nyata (tombol, klik/sentuh, input) ke /api/auth/perpanjang.
 *
 * TIDAK ADA kiriman tanpa interaksi: tidak ada setInterval yang menembak
 * sendiri. Tab yang ditinggalkan pun dengan begitu tetap berakhir menganggur.
 */
export function DetakSesi() {
  useEffect(() => {
    let terakhirKirim = 0;
    const onInteraksi = () => {
      const sekarang = Date.now();
      if (sekarang - terakhirKirim < JEDA_DETAK_MS) return;
      terakhirKirim = sekarang;
      fetch("/api/auth/perpanjang", { method: "POST", credentials: "same-origin" }).catch(() => {
        // Gagal jaringan: jeda dibuka lagi supaya interaksi berikutnya mencoba ulang.
        terakhirKirim = 0;
      });
    };
    const acara = ["keydown", "pointerdown", "input"] as const;
    for (const a of acara) document.addEventListener(a, onInteraksi, { passive: true, capture: true });
    return () => {
      for (const a of acara) document.removeEventListener(a, onInteraksi, { capture: true });
    };
  }, []);

  return null;
}
