"use client";

import { useState } from "react";
import {
  angkaId,
  hitungBusurDonat,
  KELAS_LUBANG_DONAT,
  persenTeks,
  potonganTerbesar,
  type PotonganSeri,
} from "./KitGrafik";

// ============================================================================
// DONAT DENGAN KETERANGAN SAAT DISOROT - tanpa legenda permanen di kartu.
//
// Permintaan user 2026-10-22: "gaperlu pakai keterangan, cukup ketika hover
// mouse di chart nanti muncul keterangan, jadi gak makan tempat card".
//
// TIGA HAL YANG MEMBUATNYA TIDAK MENYEMBUNYIKAN ANGKA:
//
// 1. KETERANGANNYA MEMUAT SELURUH POTONGAN, bukan cuma yang ditunjuk. Pada
//    data 2026-10-22, Gol I PNS dan "Tidak terbaca" masing-masing satu orang
//    dari 5.062 - busurnya terlalu tipis untuk dijangkau mouse. Kalau
//    keterangan hanya muncul untuk potongan yang ditunjuk, dua angka itu
//    tidak akan pernah terbaca oleh siapa pun. Jadi menyorot bagian MANA PUN
//    dari grafik membuka rincian lengkap, dan potongan yang ditunjuk diberi
//    tanda.
//
// 2. BUKAN CUMA MOUSE. Tiap potongan bisa difokus: Tab di keyboard, ketuk di
//    layar sentuh. Hover tidak ada di HP, dan keterangan yang cuma muncul
//    lewat mouse berarti angkanya tidak ada sama sekali bagi pemakai HP.
//
// 3. TANPA JAVASCRIPT tetap ada `<title>` bawaan SVG di tiap busur.
//
// KETERANGANNYA TIDAK MAKAN TEMPAT: diposisikan mutlak menimpa area di bawah
// cincin. Kartu pemanggilnya WAJIB diberi `relative hover:z-30
// focus-within:z-30`, kalau tidak keterangannya tertimpa kartu baris
// berikutnya.
// ============================================================================

export function DonatInteraktif({
  potongan,
  total,
  labelTengah,
  catatan,
  tengah = "total",
  lebar = 128,
}: {
  potongan: PotonganSeri[];
  total: number;
  labelTengah: string;
  /**
   * Isi tengah cincin waktu tidak ada yang disorot.
   *
   * "total" cukup dipakai SATU kartu di satu baris. Empat cincin bertuliskan
   * "5.062 pegawai aktif" berdampingan adalah angka yang sama ditulis empat
   * kali (keluhan user 2026-10-22) - tiap pengulangan memakan tempat tanpa
   * menambah satu pun informasi. Kartu lain memakai "terbesar": kesimpulan
   * kartunya sendiri, mis. "61% Gol III PNS".
   */
  tengah?: "total" | "terbesar";
  /** Kalimat penjelas di kaki keterangan - dulu tinggal permanen di kartu. */
  catatan?: string;
  lebar?: number;
}) {
  const [terbuka, setTerbuka] = useState(false);
  const [aktif, setAktif] = useState<string | null>(null);

  const busur = hitungBusurDonat(potongan, total);
  const terpakai = potongan.filter((p) => p.jumlah > 0);
  const disorot = terpakai.find((p) => p.kode === aktif) ?? null;
  // Data kosong jatuh ke total (nol) - cincin kosong bertuliskan "0 pegawai
  // aktif" lebih jujur daripada tengah yang kosong.
  const ringkasan = tengah === "terbesar" ? potonganTerbesar(terpakai) : null;

  const tutup = () => {
    setTerbuka(false);
    setAktif(null);
  };

  return (
    <div
      className="relative mx-auto"
      style={{ width: lebar }}
      onMouseEnter={() => setTerbuka(true)}
      onMouseLeave={tutup}
      onBlur={(e) => {
        // Pindah fokus ANTAR potongan bukan berarti meninggalkan grafik.
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) tutup();
      }}
    >
      <div className="relative aspect-square">
        <svg viewBox="0 0 100 100" className="size-full" role="img" aria-label={labelTengah}>
          <circle cx="50" cy="50" r="38" fill="none" strokeWidth="13" className="stroke-line-2" />
          {busur.map(({ potongan: p, panjang, mulai }) => (
            <circle
              key={p.kode}
              cx="50"
              cy="50"
              r="38"
              fill="none"
              // Sasaran sentuh lebih tebal dari cincinnya: busur setebal 13
              // unit di donat selebar 128px cuma sekitar 17px - di bawah 24px
              // yang dibutuhkan jari.
              strokeWidth={aktif === p.kode ? 16 : 13}
              pathLength="1"
              strokeDasharray={`${panjang} ${1 - panjang}`}
              strokeDashoffset={-mulai}
              transform="rotate(-90 50 50)"
              tabIndex={0}
              aria-label={`${p.label}: ${angkaId(p.jumlah)} (${persenTeks(p.jumlah, total)})`}
              className={`${p.kelasGaris} cursor-pointer outline-none transition-[stroke-width,opacity] duration-150 ${
                aktif && aktif !== p.kode ? "opacity-35" : "opacity-100"
              }`}
              onMouseEnter={() => setAktif(p.kode)}
              onFocus={() => {
                setTerbuka(true);
                setAktif(p.kode);
              }}
            >
              <title>{`${p.label}: ${angkaId(p.jumlah)} (${persenTeks(p.jumlah, total)})`}</title>
            </circle>
          ))}
        </svg>

        {/* Tengah cincin: potongan yang sedang ditunjuk, atau ringkasan kartu. */}
        <div
          className={`pointer-events-none absolute ${KELAS_LUBANG_DONAT} flex flex-col items-center justify-center text-center`}
        >
          {disorot ? (
            <>
              <span className="font-mono text-lg font-black leading-none text-ink">{angkaId(disorot.jumlah)}</span>
              <span className="mt-1 text-[10px] font-semibold leading-tight text-ink-2">{disorot.label}</span>
              <span className="font-mono text-[10px] text-muted">{persenTeks(disorot.jumlah, total)}</span>
            </>
          ) : ringkasan ? (
            <>
              <span className="font-mono text-lg font-black leading-none text-ink">
                {persenTeks(ringkasan.jumlah, total)}
              </span>
              <span className="mt-1 text-[10px] font-semibold leading-tight text-ink-2">{ringkasan.label}</span>
            </>
          ) : (
            <>
              <span className="font-mono text-lg font-black leading-none text-ink">{angkaId(total)}</span>
              <span className="mt-1 text-[10px] leading-tight text-muted">{labelTengah}</span>
            </>
          )}
        </div>
      </div>

      {terbuka && terpakai.length > 0 && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-2 w-60 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-lg"
        >
          <ul className="space-y-1.5">
            {terpakai.map((p) => (
              <li
                key={p.kode}
                className={`flex items-start justify-between gap-3 rounded-md px-1.5 py-1 ${
                  aktif === p.kode ? "bg-surface-2" : ""
                }`}
              >
                <span className="flex min-w-0 items-start gap-2">
                  <span className={`mt-1 size-2.5 shrink-0 rounded-sm ${p.kelasIsi}`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={`block text-xs text-ink ${aktif === p.kode ? "font-bold" : "font-semibold"}`}>
                      {p.label}
                    </span>
                    {p.keterangan && (
                      <span className="block text-[10px] leading-tight text-muted">{p.keterangan}</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-mono text-xs font-bold text-ink">{angkaId(p.jumlah)}</span>
                  <span className="ml-1.5 font-mono text-[10px] text-muted">{persenTeks(p.jumlah, total)}</span>
                </span>
              </li>
            ))}
          </ul>
          {catatan && (
            <p className="mt-2 border-t border-line-2 pt-2 text-[10px] leading-relaxed text-muted">{catatan}</p>
          )}
        </div>
      )}
    </div>
  );
}
