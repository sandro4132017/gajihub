/**
 * Ikon "i" di samping judul tabel Rincian Tukin - keterangan cara membacanya
 * muncul sebagai panel melayang waktu diklik.
 *
 * Sebelumnya keterangan ini berupa kartu tetap di atas tabel. Isinya benar dan
 * memang dibutuhkan, tapi cuma dibaca SEKALI: sesudah orang paham kolom
 * Potongan % dihitung dari bobot kehadiran, kartu itu tinggal jadi empat
 * paragraf yang mendorong tabelnya turun setiap kali halaman dibuka.
 *
 * TEKSNYA DARI USER (2026-09-09), disalin apa adanya. Contoh angka yang dulu
 * ada di sini (potongan 1% = Rp26.273 dari Rp8.757.600) sengaja tidak
 * dikembalikan - itu angka satu kelas jabatan tertentu, dan pembaca yang
 * kelasnya berbeda akan mencocokkannya dengan barisnya sendiri lalu mengira
 * hitungannya meleset.
 *
 * `<details>`, BUKAN popover client component - buka-tutupnya ditangani
 * browser, jadi tetap jalan tanpa JavaScript seperti seluruh halaman ini.
 *
 * BEDA DARI BadgePejabatEselon yang isinya muncul di dalam sel: panel ini
 * MELAYANG (`absolute`). Aman karena judul tabel ada di luar kontainer
 * `overflow-x-auto` - di dalam kontainer itu panel melayang akan terpotong di
 * tepinya.
 *
 * JANGAN taruh di dalam <h2>. `<details>` itu flow content sementara heading
 * cuma boleh memuat phrasing content; parser akan menutup paksa heading-nya
 * dan DOM hasil parsing jadi berbeda dari pohon React (hydration error).
 * Tempatnya di SAMPING heading, dalam satu wadah flex.
 */
export function BantuanRincianTukin() {
  return (
    <details className="group relative inline-block align-middle">
      <summary
        className="inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold leading-none text-ink-2 ring-1 ring-inset ring-line marker:hidden hover:bg-teal-tint hover:text-teal-deep [&::-webkit-details-marker]:hidden"
        title="Cara membaca tabel ini - klik untuk keterangan"
        aria-label="Cara membaca tabel Rincian Tukin"
      >
        i
      </summary>

      <div className="absolute left-0 top-full z-20 mt-2 w-[24rem] max-w-[calc(100vw-3rem)] rounded-xl border border-line bg-surface p-3.5 shadow-[0_8px_28px_rgba(19,65,107,0.16)]">
        <p className="text-sm font-bold text-ink">Cara Membaca Tabel Rincian Tukin</p>

        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Dasar perhitungan adalah <strong>Tukin sebelum potongan</strong> (pokok Tukin kelas jabatan sesuai Lampiran
          Permenaker 15/2024), yang terdiri dari:
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-xs text-ink-2">
          <li>
            <strong>70%</strong> capaian kinerja
          </li>
          <li>
            <strong>30%</strong> kehadiran
          </li>
        </ul>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          <strong>Potongan %</strong> sesuai <strong>Pasal 13</strong> dihitung dari <em>bobot kehadiran</em>, bukan
          dari total Tukin.
        </p>

        <p className="mt-2 rounded-lg bg-surface-2 px-2.5 py-1.5 font-mono text-xs text-ink-2">
          Tukin bersih = Tukin kotor &minus; potongan
        </p>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          Untuk melihat nominal potongan beserta rincian perhitungan kehadiran dan kinerja, buka{" "}
          <strong>Lihat rincian lengkap</strong>.
        </p>

        <p className="mt-2 text-xs leading-relaxed text-muted">
          <strong>Catatan:</strong> Angka yang ditampilkan adalah <strong>bruto</strong> dan belum termasuk PPh.
        </p>
      </div>
    </details>
  );
}
