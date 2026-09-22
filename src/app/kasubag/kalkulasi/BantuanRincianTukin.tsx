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
 * BAGIAN KOLOM CUTI cuma muncul di tampilan RINCI (`tampilRinci`), karena
 * kolom-kolom yang dijelaskannya memang hanya ada di sana. Keterangan untuk
 * kolom yang tidak kelihatan membuat pembaca mencari-cari kolom yang tidak
 * pernah ada di layarnya.
 *
 * JANGAN taruh di dalam <h2>. `<details>` itu flow content sementara heading
 * cuma boleh memuat phrasing content; parser akan menutup paksa heading-nya
 * dan DOM hasil parsing jadi berbeda dari pohon React (hydration error).
 * Tempatnya di SAMPING heading, dalam satu wadah flex.
 */
export function BantuanRincianTukin({ tampilRinci = false }: { tampilRinci?: boolean }) {
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

        {tampilRinci && (
          <>
            <p className="mt-3 border-t border-line-2 pt-3 text-sm font-bold text-ink">Cara membaca kolom cuti</p>
            <dl className="mt-1.5 space-y-1 text-xs text-ink-2">
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 font-mono text-muted">-</dt>
                <dd>Rekap presensi periode ini belum tersedia.</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted">kosong</dt>
                <dd>Rekap tersedia dan pegawai tidak tercatat cuti.</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-14 shrink-0 text-muted">angka</dt>
                <dd>Jumlah hari cuti.</dd>
              </div>
              <div className="flex gap-2">
                {/* "v", BUKAN centang - itu yang benar-benar dicetak selCuti().
                    Legenda yang simbolnya beda dari selnya lebih menyesatkan
                    daripada tidak ada legenda sama sekali. */}
                <dt className="w-14 shrink-0 font-mono text-muted">v</dt>
                <dd>Cuti tercatat, tetapi jumlah hari belum diisi.</dd>
              </div>
            </dl>
            {/* Dipertahankan dari kartu lama: satu-satunya kalimat di situ yang
                menyentuh rupiah. Tanpa jumlah hari, cuti gugur kandungan di
                atas 1 bulan tidak bisa dihitung - tarifnya 1% PER HARI. */}
            <p className="mt-1.5 text-xs leading-relaxed text-muted">
              Tanda <span className="font-mono">v</span> cukup untuk cuti sakit &amp; cuti besar - yang menentukan
              potongannya bulan ke berapa, bukan harinya. <strong>Tidak cukup</strong> untuk cuti gugur kandungan di
              atas 1 bulan, yang tarifnya 1% per hari.
            </p>

            <p className="mt-2 text-xs font-bold text-ink">Bulan I / II / III</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">
              Menunjukkan bulan keberapa cuti berlangsung. Diisi melalui &quot;Bulan Cuti Ke&quot; pada template rekap
              presensi.
            </p>

            <p className="mt-2 text-xs leading-relaxed text-muted">
              <strong>Catatan:</strong> tarikan e-Presensi tidak dapat menentukan bulan cuti otomatis - satu bulan
              export tidak memberi tahu cuti itu sudah berjalan berapa lama. Jika belum diisi, cuti dianggap{" "}
              <strong>Bulan I</strong> (cuti sakit tidak dipotong, cuti besar dipotong 50%).
            </p>
          </>
        )}
      </div>
    </details>
  );
}
