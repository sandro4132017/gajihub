"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface OpsiSelect {
  value: string;
  label: string;
  /** Baris kecil di bawah label (mis. NIP + satuan kerja) - IKUT dicari juga. */
  keterangan?: string;
}

function escapeHtml(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `<select>` native buat fallback di dalam <noscript> - lihat catatan di komponen. */
function selectFallbackHtml(
  name: string,
  opsi: OpsiSelect[],
  defaultValue: string,
  required: boolean
): string {
  const options = opsi
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${o.value === defaultValue ? " selected" : ""}>${escapeHtml(o.label)}</option>`
    )
    .join("");
  return `<select name="${escapeHtml(name)}"${required ? " required" : ""} class="field-input w-full">${options}</select>`;
}

/**
 * Dropdown yang bisa dicari secara REALTIME (ketik -> daftar langsung
 * menyusut). Dipakai menggantikan `<select>` biasa di seluruh aplikasi -
 * beberapa dropdown di sini isinya panjang (82 satuan kerja, ~80 pegawai per
 * unit), scroll manual di `<select>` native tidak praktis.
 *
 * Cara kerjanya supaya tetap cocok dengan form yang sudah ada: nilai
 * sebenarnya disimpan di `<input type="hidden" name={name}>`, jadi dari sisi
 * Server Action / `<form method="get">` komponen ini TIDAK ADA BEDANYA
 * dengan `<select name={name}>` - tidak perlu ubah action manapun.
 *
 * FALLBACK TANPA JAVASCRIPT: `<select>` native yang sama ditaruh di dalam
 * `<noscript>`. Kalau JS mati, browser TIDAK mem-parse isi `<noscript>`
 * sebagai elemen saat JS hidup, jadi tidak ada dua field bernama sama yang
 * ikut terkirim - sementara kalau JS mati, yang tampil & terkirim justru
 * select native itu. Ini menjaga janji "filter jalan tanpa JavaScript" yang
 * sudah dipegang project ini (lihat komentar di FilterBar.tsx).
 */
export function SearchableSelect({
  name,
  options,
  defaultValue = "",
  placeholder = "Ketik untuk mencari...",
  emptyLabel,
  required = false,
  className = "",
  onValueChange,
}: {
  name: string;
  options: OpsiSelect[];
  defaultValue?: string;
  placeholder?: string;
  /** Label buat opsi kosong (mis. "Semua satuan kerja"). Kalau tidak diisi, opsi kosong tidak ada. */
  emptyLabel?: string;
  required?: boolean;
  className?: string;
  /** Dipanggil setiap nilai berubah - buat form yang isinya bergantung pilihan (mis. field satuan kerja yang cuma muncul kalau role Kasubag TU). */
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [query, setQuery] = useState("");
  const [buka, setBuka] = useState(false);
  const [sorotan, setSorotan] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const semuaOpsi = useMemo<OpsiSelect[]>(
    () => (emptyLabel ? [{ value: "", label: emptyLabel }, ...options] : options),
    [emptyLabel, options]
  );

  const terpilih = semuaOpsi.find((o) => o.value === value);

  const hasil = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return semuaOpsi;
    return semuaOpsi.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.keterangan ?? "").toLowerCase().includes(q)
    );
  }, [query, semuaOpsi]);

  useEffect(() => {
    if (!buka) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setBuka(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [buka]);

  // Jaga item yang sedang disorot tetap kelihatan waktu navigasi pakai panah.
  useEffect(() => {
    if (!buka) return;
    listRef.current?.children[sorotan]?.scrollIntoView({ block: "nearest" });
  }, [sorotan, buka]);

  function pilih(opsi: OpsiSelect) {
    setValue(opsi.value);
    setQuery("");
    setBuka(false);
    onValueChange?.(opsi.value);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!buka) {
        setBuka(true);
        return;
      }
      setSorotan((s) => {
        const next = e.key === "ArrowDown" ? s + 1 : s - 1;
        if (next < 0) return hasil.length - 1;
        if (next >= hasil.length) return 0;
        return next;
      });
    } else if (e.key === "Enter") {
      if (buka && hasil[sorotan]) {
        // Cegah form ke-submit gara-gara Enter yang dimaksud "pilih opsi ini".
        e.preventDefault();
        pilih(hasil[sorotan]);
      }
    } else if (e.key === "Escape") {
      setBuka(false);
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <input type="hidden" name={name} value={value} />

      <input
        type="text"
        role="combobox"
        aria-expanded={buka}
        aria-autocomplete="list"
        autoComplete="off"
        // required cuma buat memicu validasi browser kalau belum ada pilihan -
        // begitu ada nilai, field teks ini tidak wajib diisi lagi.
        required={required && !value}
        value={buka ? query : terpilih?.label ?? ""}
        placeholder={terpilih ? terpilih.label : placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setSorotan(0);
          if (!buka) setBuka(true);
        }}
        onFocus={() => {
          setBuka(true);
          setQuery("");
          setSorotan(0);
        }}
        onKeyDown={onKeyDown}
        className="field-input w-full cursor-text pr-7"
      />
      <svg
        viewBox="0 0 24 24"
        className={`pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-muted transition-transform ${buka ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>

      {buka && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-40 mt-1 max-h-64 w-full min-w-[220px] overflow-y-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
        >
          {hasil.length === 0 && <li className="px-3 py-2 text-xs text-muted">Tidak ada yang cocok.</li>}
          {/* Key memakai INDEKS, bukan nilai opsinya. Nilai tidak dijamin unik:
              `emptyLabel` menambahkan opsi bernilai "" di depan daftar, dan
              daftar yang datang dari database bisa memuat nilai kosong juga
              (mis. pegawai yang satuan kerjanya belum terisi) - dua-duanya
              dulu jatuh ke key yang sama dan React memperingatkan duplikat.
              Indeks aman di sini karena `hasil` selalu dirender ulang utuh
              tiap kali query pencariannya berubah, tidak pernah disisipi atau
              diurutkan ulang sebagian. */}
          {hasil.map((o, i) => (
            <li key={`${i}-${o.value}`} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onMouseEnter={() => setSorotan(i)}
                onClick={() => pilih(o)}
                className={`block w-full px-3 py-1.5 text-left text-[13px] ${
                  i === sorotan ? "bg-surface-2" : ""
                } ${o.value === value ? "font-bold text-ink" : "text-ink-2"}`}
              >
                {o.label}
                {o.keterangan && <span className="block text-[11px] text-muted">{o.keterangan}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* dangerouslySetInnerHTML (bukan JSX biasa) DISENGAJA: isi <noscript>
          diperlakukan browser sebagai TEKS saat JS hidup, jadi kalau ditulis
          sebagai elemen JSX, React bakal ribut soal hydration mismatch.
          Isinya kita rakit sendiri sebagai string HTML yang sudah di-escape. */}
      <noscript dangerouslySetInnerHTML={{ __html: selectFallbackHtml(name, semuaOpsi, defaultValue, required) }} />
    </div>
  );
}
