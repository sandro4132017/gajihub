"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { RiCloseLine, RiUserForbidLine } from "react-icons/ri";
import { KartuDikecualikan, KartuKandidat, type DikecualikanLaci, type KandidatLaci } from "./PengecualianForm";

const EVENT_BUKA = "gajihub:buka-pengecualian";

/**
 * Tombol pembuka laci. Tetap berupa tautan `?tinjau=1` - tanpa JavaScript,
 * halaman dimuat ulang dengan laci terbuka; dengan JavaScript, laci dibuka
 * di tempat tanpa memuat ulang.
 */
export function TombolBukaPengecualian({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new Event(EVENT_BUKA));
      }}
    >
      {children}
    </a>
  );
}

/**
 * Laci kanan "Kecualikan Pegawai dari Perhitungan Unit".
 *
 * Tiap kartu menyimpan sendiri begitu tombolnya ditekan (Kecualikan /
 * Batalkan) - tombol di kaki laci hanya menutup.
 *
 * Tetap TERSEMBUNYI sampai dibuka lewat tombol "Tinjau & Kecualikan": tombol
 * "kecualikan" yang selalu terbuka di sebelah tiap nama mengundang dipakai
 * sebagai jalan pintas menghilangkan orang yang datanya cuma belum lengkap.
 */
export function LaciPengecualian({
  terbukaAwal,
  satuanKerja,
  namaBulan,
  periodeBulan,
  periodeTahun,
  kandidat,
  dikecualikan,
}: {
  terbukaAwal: boolean;
  satuanKerja: string;
  namaBulan: string;
  periodeBulan: number;
  periodeTahun: number;
  kandidat: readonly KandidatLaci[];
  dikecualikan: readonly DikecualikanLaci[];
}) {
  const [buka, setBuka] = useState(terbukaAwal);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onBuka = () => setBuka(true);
    window.addEventListener(EVENT_BUKA, onBuka);
    return () => window.removeEventListener(EVENT_BUKA, onBuka);
  }, []);

  useEffect(() => {
    if (!buka) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") tutup();
    };
    const overflowLama = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = overflowLama;
      window.removeEventListener("keydown", onKey);
    };
  }, [buka]);

  function tutup() {
    setBuka(false);
    // Buang ?tinjau=1 supaya muat ulang halaman tidak membuka laci lagi.
    const url = new URL(window.location.href);
    if (url.searchParams.has("tinjau") || url.hash === "#kecualikan") {
      url.searchParams.delete("tinjau");
      url.hash = "";
      window.history.replaceState(window.history.state, "", url.toString());
    }
  }

  if (!buka) return null;

  return (
    <div className="fixed inset-0 z-50 text-left font-sans print:hidden">
      <div aria-hidden className="absolute inset-0 bg-navy-deep/30" onClick={tutup} />
      <div
        id="kecualikan"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="judul-laci-pengecualian"
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-full max-w-[680px] flex-col bg-surface shadow-2xl outline-none"
      >
        <header className="flex items-start gap-3 border-b border-line px-6 py-5">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-tint text-gold-deep">
            <RiUserForbidLine className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="judul-laci-pengecualian" className="text-base font-bold text-ink">
              Kecualikan Pegawai dari Perhitungan Unit
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {satuanKerja} • Berlaku khusus pada periode {namaBulan} {periodeTahun}
            </p>
          </div>
          <button
            type="button"
            onClick={tutup}
            aria-label="Tutup"
            className="grid size-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-ink"
          >
            <RiCloseLine className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-line bg-surface-2/60 p-4 text-xs leading-relaxed text-ink-2">
            Gunakan fitur ini untuk pegawai yang sudah tidak seharusnya dihitung di unit kerja ini pada periode
            berjalan (seperti mutasi keluar, pensiun, atau tugas belajar penuh)—bukan untuk pegawai yang datanya
            sekadar belum lengkap. Apabila memilih alasan <strong className="font-bold text-ink">&quot;Lainnya&quot;</strong>,
            wajib mencantumkan keterangan tambahan.
            <p className="mt-2 text-muted">
              <strong className="text-ink-2">Catatan:</strong> kalkulasi pegawai yang dikecualikan untuk periode ini
              otomatis dihapus. Namanya tetap tampil di daftar beserta alasannya.
            </p>
          </div>

          <ul className="space-y-3">
            {dikecualikan.map((d) => (
              <KartuDikecualikan key={`x-${d.pegawaiId}`} item={d} periodeBulan={periodeBulan} periodeTahun={periodeTahun} />
            ))}
            {kandidat.slice(0, 15).map((k) => (
              <KartuKandidat key={`k-${k.id}`} kandidat={k} periodeBulan={periodeBulan} periodeTahun={periodeTahun} />
            ))}
          </ul>
          {kandidat.length > 15 && (
            <p className="text-xs text-muted">
              Menampilkan 15 dari {kandidat.length} kandidat. Sisanya muncul setelah yang ini ditangani.
            </p>
          )}
          {kandidat.length === 0 && dikecualikan.length === 0 && (
            <p className="text-sm text-muted">Tidak ada pegawai yang perlu ditinjau pada periode ini.</p>
          )}
        </div>

        <footer className="flex justify-end border-t border-line px-6 py-4">
          <button
            type="button"
            onClick={tutup}
            className="inline-flex items-center justify-center rounded-lg bg-navy px-5 py-2.5 text-sm font-bold text-white transition hover:bg-navy-deep"
          >
            Selesai &amp; Tutup
          </button>
        </footer>
      </div>
    </div>
  );
}
