import type { ReactNode } from "react";

/**
 * Ikon "i" di samping judul tabel - sumber data & acuannya muncul sebagai
 * panel melayang waktu diklik.
 *
 * MENGGANTIKAN paragraf keterangan di bawah judul (permintaan user
 * 2026-09-28: *"tidak perlu pakai keterangan tabel di bawah judul tabel,
 * samakan seperti Rincian tukin"*). Alasannya sama dengan waktu kartu
 * keterangan Rincian Tukin diringkas jadi ikon: isinya benar dan memang
 * dibutuhkan, tapi cuma dibaca SEKALI - sesudah itu ia tinggal jadi baris yang
 * mendorong tabelnya turun tiap kali halaman dibuka.
 *
 * BENTUK UMUM dari `BantuanRincianTukin`. Yang di sana dibiarkan apa adanya:
 * isinya panjang, bercabang menurut `tampilRinci`, dan memindahkannya ke sini
 * cuma menukar satu berkas khusus dengan satu berkas khusus yang dibungkus.
 *
 * `<details>`, BUKAN popover client component - buka-tutupnya ditangani
 * browser, jadi tetap jalan tanpa JavaScript seperti seluruh halaman ini.
 *
 * JANGAN taruh di dalam `<h2>`. `<details>` itu flow content sementara heading
 * cuma boleh memuat phrasing content; parser akan menutup paksa heading-nya
 * dan DOM hasil parsing jadi berbeda dari pohon React (hydration error).
 * Tempatnya di SAMPING heading, dalam satu wadah flex.
 *
 * Panelnya MELAYANG (`absolute`), jadi pemakainya harus memastikan judul tabel
 * berada DI LUAR kontainer `overflow-x-auto` - di dalam kontainer itu panel
 * melayang akan terpotong di tepinya.
 */
export function BantuanTabel({
  judul,
  label,
  children,
}: {
  /** Judul panel, mis. "Sumber Data & Acuan". */
  judul: string;
  /** Untuk pembaca layar - sebut tabel mana, karena ikonnya cuma huruf "i". */
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group relative inline-block align-middle">
      <summary
        className="inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold leading-none text-ink-2 ring-1 ring-inset ring-line marker:hidden hover:bg-teal-tint hover:text-teal-deep [&::-webkit-details-marker]:hidden"
        title="Sumber data & acuan - klik untuk keterangan"
        aria-label={label}
      >
        i
      </summary>

      <div className="absolute left-0 top-full z-20 mt-2 w-[24rem] max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-3.5 shadow-[0_8px_28px_rgba(19,65,107,0.16)]">
        <p className="text-sm font-bold text-ink">{judul}</p>
        {children}
      </div>
    </details>
  );
}

/**
 * Satu baris "Sumber" / "Acuan" di dalam panel.
 *
 * DUA BARIS INI SELALU ADA di tiap panel, dan itu disengaja: pertanyaan yang
 * paling sering muncul saat angka dipersoalkan bukan "bagaimana menghitungnya"
 * melainkan "angka ini datang dari mana, dan apa yang mengesahkannya".
 */
export function BarisSumber({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex gap-2 text-xs">
      <dt className="w-14 shrink-0 font-semibold text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 leading-relaxed text-ink-2">{children}</dd>
    </div>
  );
}
