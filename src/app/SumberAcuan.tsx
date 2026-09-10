/**
 * Ikon "i" di samping judul halaman - berisi DASAR HUKUM & sumber data
 * halaman itu, muncul saat di-hover atau di-fokus keyboard.
 *
 * KENAPA DIPINDAH KE IKON: tiap halaman di sini berdiri di atas pasal
 * tertentu, dan menuliskannya di deskripsi membuat kalimat pembuka jadi dua
 * baris berisi nomor pasal - informasi yang penting saat DIPERIKSA (auditor,
 * Itjen, pegawai yang protes), tapi tidak perlu dibaca tiap kali halaman
 * dibuka. Ditaruh di ikon: tetap ada, tidak memakan baris.
 *
 * TANPA JAVASCRIPT SAMA SEKALI - murni CSS (`group-hover` + `group-focus-
 * within`), jadi tetap jalan sesuai janji progressive enhancement yang
 * dipegang project ini. Bukan client component, tidak ada state.
 *
 * CATATAN ELEMEN (pelajaran dari BadgePejabatEselon): komponen ini SELURUHNYA
 * *phrasing content* (`<span>`), jadi AMAN diletakkan di dalam `<h1>`, `<p>`,
 * atau `<td>`. JANGAN diganti `<details>` - elemen itu *flow content*, dan
 * menaruhnya di dalam heading membuat parser HTML menutup paksa induknya lalu
 * Next melempar hydration error yang menunjuk ke dalam komponen ini, bukan ke
 * tempat pemakaiannya.
 */
export interface BarisAcuan {
  /** Nomor pasal / nama dokumen, mis. "Pasal 13 Permenaker 15/2024". */
  aturan: string;
  /** Mengatur apa - satu frasa pendek. */
  tentang: string;
}

/**
 * Satu sumber DATA (bukan aturan), beserta kapan salinannya diambil.
 *
 * Dipisah dari `catatan` yang cuma satu kalimat: begitu sumbernya lebih dari
 * satu dan masing-masing punya waktu pengambilan sendiri, memadatkannya jadi
 * satu kalimat membuat yang paling penting - kapan datanya diambil - hilang
 * di tengah.
 */
export interface BarisSumber {
  /** "Kehadiran", "Kinerja", "Data pegawai". */
  nama: string;
  /** Sistem asalnya, mis. "e-Presensi". */
  sistem: string;
  /** Kapan salinannya diambil, sudah diformat. */
  waktu: string;
}

export function SumberAcuan({
  judul = "Sumber & acuan",
  acuan,
  sumber,
  catatan,
}: {
  judul?: string;
  acuan: BarisAcuan[];
  /**
   * Sumber DATA beserta waktu pengambilannya - ditampilkan di bagian sendiri
   * di atas daftar aturan. Aturan menjawab "kenapa angkanya begini", sumber
   * data menjawab "angka kapan yang sedang dilihat"; keduanya ditanyakan pada
   * saat yang sama waktu ada yang mempersoalkan hasil hitungan.
   */
  sumber?: BarisSumber[];
  /** Baris tambahan di kaki panel. */
  catatan?: string;
}) {
  return (
    <span className="group relative inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={judul}
        // TANPA `title`. Panel di bawah ini sudah muncul saat hover, jadi
        // tooltip bawaan browser menyala BERSAMAAN dengan isi yang sama - dan
        // kotak hitamnya justru menutupi panel yang lebih terbaca.
        // `aria-label` tetap ada, jadi pembaca layar tidak kehilangan apa pun.
        className="grid size-[18px] cursor-help place-items-center rounded-full border border-line bg-surface text-[11px] font-extrabold text-biru transition group-hover:border-biru group-hover:bg-biru group-hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-biru"
      >
        i
      </span>

      {/* pointer-events-none supaya panel yang muncul tidak menghalangi klik
          elemen di bawahnya; isinya memang cuma dibaca. */}
      <span className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-30 w-[min(22rem,80vw)] -translate-x-1/2 rounded-xl border border-line bg-surface p-3 text-left opacity-0 shadow-[0_8px_24px_rgba(19,65,107,0.14)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        {sumber && sumber.length > 0 && (
          <span className="mb-2 block border-b border-line pb-2">
            <span className="block text-[11px] font-extrabold uppercase tracking-wide text-muted">Sumber data</span>
            <span className="mt-1 block text-[11px] leading-snug text-muted">
              Gajihub memakai salinan yang diambil pada waktu di bawah, bukan data yang berjalan sekarang.
            </span>
            <span className="mt-1.5 block space-y-1">
              {sumber.map((d) => (
                <span key={d.nama} className="block">
                  <span className="block text-[12.5px] font-bold leading-snug text-ink">
                    {d.nama} <span className="font-normal text-muted">&mdash; {d.sistem}</span>
                  </span>
                  <span className="block text-[11.5px] leading-snug text-muted">{d.waktu}</span>
                </span>
              ))}
            </span>
          </span>
        )}

        <span className="block text-[11px] font-extrabold uppercase tracking-wide text-muted">{judul}</span>
        <span className="mt-1.5 block space-y-1.5">
          {acuan.map((a) => (
            <span key={a.aturan} className="block">
              <span className="block text-[12.5px] font-bold leading-snug text-ink">{a.aturan}</span>
              <span className="block text-[11.5px] leading-snug text-muted">{a.tentang}</span>
            </span>
          ))}
        </span>
        {catatan && (
          <span className="mt-2 block border-t border-line pt-2 text-[11.5px] leading-snug text-muted">{catatan}</span>
        )}
      </span>
    </span>
  );
}
