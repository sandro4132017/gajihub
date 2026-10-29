"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Angka yang menghitung naik dari nol waktu halaman dibuka.
 *
 * ATURAN YANG TIDAK BOLEH DILANGGAR DI SINI: yang dirender di server dan yang
 * tampil kalau JavaScript mati HARUS nilai akhirnya, bukan nol. Angka di
 * dashboard ini menyentuh pembayaran - rupiah belanja unit, jumlah pegawai,
 * jumlah kalkulasi yang disetujui - dan halaman yang menampilkan "Rp 0" karena
 * JS gagal dimuat tidak terbaca sebagai animasi yang belum jalan, melainkan
 * sebagai fakta. Makanya `useState(nilai)` dimulai dari nilai akhir, dan nol
 * baru dipasang SETELAH komponen ini hidup di browser.
 *
 * Nilai antaranya memang berubah-ubah selama ~1 detik. Yang dijamin: titik
 * akhirnya selalu `nilai` apa adanya - tidak ada pembulatan yang diperkenalkan
 * di sini selain Math.round pada frame antara, dan frame terakhir memakai
 * `nilai` langsung.
 */

type Format = "angka" | "rupiah-ringkas";

/**
 * useLayoutEffect di komponen client tetap ikut dirender di server oleh Next,
 * dan React memperingatkan bahwa ia tidak berjalan di sana. Dipilih varian ini
 * supaya di browser tetap dapat perilaku "sebelum cat pertama" - kalau pakai
 * useEffect biasa, nilai akhirnya sempat tergambar satu frame lalu meloncat ke
 * nol, dan itu terlihat sebagai kedipan angka.
 */
const useEfekSebelumCat = typeof window === "undefined" ? useEffect : useLayoutEffect;

function format(nilai: number, sebagai: Format): string {
  if (sebagai === "rupiah-ringkas") {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
      notation: "compact",
    }).format(nilai);
  }
  return String(nilai);
}

export function AngkaNaik({
  nilai,
  sebagai = "angka",
  durasiMs = 1100,
  tundaMs = 0,
}: {
  nilai: number;
  sebagai?: Format;
  durasiMs?: number;
  /** Diselaraskan dengan animationDelay kartu yang memuatnya. */
  tundaMs?: number;
}) {
  const [tampil, setTampil] = useState(nilai);
  const rafRef = useRef<number | null>(null);

  useEfekSebelumCat(() => {
    // Hormati pengaturan sistem: yang dihindari orang yang menyalakannya adalah
    // gerakan, dan angka yang berputar cepat termasuk di dalamnya. Dibiarkan
    // langsung di nilai akhir - tidak ada keterangan yang hilang.
    const kurangiGerak = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (kurangiGerak || nilai <= 0) {
      setTampil(nilai);
      return;
    }

    setTampil(0);
    let mulai: number | null = null;
    const langkah = (t: number) => {
      if (mulai === null) mulai = t;
      const maju = Math.min(1, (t - mulai) / durasiMs);
      // easeOutCubic - cepat di awal lalu melambat mendekati angkanya, sehingga
      // digit terakhirnya sempat terbaca alih-alih berhenti mendadak.
      const halus = 1 - Math.pow(1 - maju, 3);
      // Frame terakhir memakai `nilai` mentah, BUKAN hasil interpolasi:
      // pembulatan di ujung kurva bisa meleset satu rupiah, dan angka yang
      // meleset satu rupiah dari yang tersimpan di database tidak boleh ada
      // di halaman ini sama sekali.
      setTampil(maju < 1 ? Math.round(nilai * halus) : nilai);
      if (maju < 1) rafRef.current = requestAnimationFrame(langkah);
    };

    const tid = window.setTimeout(() => {
      rafRef.current = requestAnimationFrame(langkah);
    }, tundaMs);

    return () => {
      window.clearTimeout(tid);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [nilai, durasiMs, tundaMs]);

  return <>{format(tampil, sebagai)}</>;
}
