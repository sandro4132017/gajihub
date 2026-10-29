"use client";

import { useEffect, type ReactNode } from "react";

// ============================================================================
// MODAL - kotak dialog yang menutupi layar, dipakai untuk konfirmasi dan
// pemberitahuan hasil.
//
// KENAPA BUKAN `confirm()` / `alert()` BAWAAN BROWSER. Dialog bawaan tidak
// bisa memuat angka, nama unit, atau penekanan apa pun - isinya satu paragraf
// polos tanpa bentuk. Padahal justru di situlah keputusannya diambil: yang
// menekan "Kirim & kunci" harus melihat BERAPA orang yang ikut terkirim dan
// bahwa dia tidak bisa membatalkannya sendiri. Selain itu dialog bawaan sudah
// lama dianggap gangguan dan ditekan OK secara refleks.
//
// KENAPA BUKAN BARIS TEKS DI BAWAH TOMBOL. Pemberitahuan berhasil/gagal yang
// cuma muncul sebagai sebaris teks kecil gampang terlewat - apalagi kalau
// halamannya panjang dan barisnya lahir di luar layar. Pengiriman ini
// mengunci data satu unit; hasilnya harus menghentikan pandangan, bukan
// menyelinap.
//
// SENGAJA TIDAK PAKAI PORTAL. Modal ini dirender di tempatnya berada di pohon
// komponen, jadi ia tetap berada DI DALAM <form> pemanggilnya - dan tombol
// `type="submit"` di dalamnya mengirim form itu tanpa sambungan tambahan.
// Karena tidak ada leluhur yang memasang transform/filter di halaman-halaman
// ini, `position: fixed` tetap mengacu ke viewport.
// ============================================================================

export type NadaModal = "netral" | "sukses" | "bahaya";

const GAYA_NADA: Record<NadaModal, { ikon: string; kelasIkon: string; kelasJudul: string }> = {
  netral: {
    ikon: "!",
    kelasIkon: "bg-gold-tint text-gold-deep",
    kelasJudul: "text-ink",
  },
  sukses: {
    ikon: "✓",
    kelasIkon: "bg-green-tint text-green",
    kelasJudul: "text-green",
  },
  bahaya: {
    ikon: "!",
    kelasIkon: "bg-red-tint text-red",
    kelasJudul: "text-red",
  },
};

export function Modal({
  terbuka,
  judul,
  nada = "netral",
  onTutup,
  children,
  aksi,
}: {
  terbuka: boolean;
  judul: string;
  nada?: NadaModal;
  /**
   * Menutup modal. `null` berarti modal TIDAK bisa ditutup sembarangan -
   * dipakai selagi permintaan sedang berjalan, supaya orang tidak menutup
   * dialognya di tengah pengiriman lalu mengira kirimannya batal.
   */
  onTutup: (() => void) | null;
  children: ReactNode;
  /** Tombol-tombol di kaki dialog. */
  aksi: ReactNode;
}) {
  // Escape menutup dialog, dan badan halaman berhenti bisa digulung selama
  // dialog terbuka - tanpa itu, latar belakang ikut bergerak saat orang
  // menggulung isi dialog yang panjang.
  useEffect(() => {
    if (!terbuka) return;
    const onTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onTutup) onTutup();
    };
    document.addEventListener("keydown", onTombol);
    const gulungAsli = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onTombol);
      document.body.style.overflow = gulungAsli;
    };
  }, [terbuka, onTutup]);

  if (!terbuka) return null;

  const gaya = GAYA_NADA[nada];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-[2px]"
      style={{ animation: "gj-muncul 140ms ease-out both" }}
      // Klik di latar menutup dialog, TAPI hanya kalau kliknya memang jatuh di
      // latar - tanpa pemeriksaan target, melepas seretan yang dimulai di
      // dalam dialog ikut terhitung sebagai klik latar dan dialognya tertutup
      // sendiri.
      onClick={(e) => {
        if (onTutup && e.target === e.currentTarget) onTutup();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={judul}
        className="card max-h-[85vh] w-full max-w-lg overflow-y-auto p-5"
        style={{ animation: "gj-masuk 180ms ease-out both" }}
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold ${gaya.kelasIkon}`}
          >
            {gaya.ikon}
          </span>
          <h2 className={`mt-1 text-sm font-bold ${gaya.kelasJudul}`}>{judul}</h2>
        </div>

        <div className="mt-3 text-xs leading-relaxed text-ink-2">{children}</div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">{aksi}</div>
      </div>
    </div>
  );
}
