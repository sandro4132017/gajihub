// ============================================================================
// KARTU BERCAHAYA - bentuk mengikuti referensi desain yang dikirim user
// (2026-10-22): ikon bulat di kiri atas dengan cahaya pastel lembut di
// belakangnya, isi di tengah, label tebal.
//
// Dipakai keempat kartu pie komposisi pegawai. Kartu angka "Total Pegawai
// Aktif" yang dulu juga memakainya DICABUT atas permintaan user (2026-10-22) -
// totalnya kini di tengah cincin pie. Chrome-nya tetap hidup di satu tempat
// supaya keempat kartu tidak menyimpang di padding, garis, dan ukuran ikon.
//
// CAHAYANYA HIASAN, DAN ITU PERLU DITEGASKAN. Warna di Gajihub punya arti -
// hijau terkirim, kuning tertahan, merah dikembalikan - jadi warna yang muncul
// di kartu berisiko terbaca sebagai status. Cahayanya SENGAJA dibuat pucat dan
// ditaruh di BELAKANG ikon, bukan pada angkanya, supaya terbaca sebagai latar
// kartu, bukan sebagai vonis.
//
// WARNANYA LEWAT VARIABEL CSS `--cahaya-N-*`, BUKAN HEX DI SINI. Nilai
// bawaannya di `:root` (globals.css), dan tema halaman boleh menimpanya - itu
// yang dilakukan tema palet 2026 di dashboard PPABP. Hex yang ditulis di
// komponen tidak bisa ikut tema, dan kartu yang tidak ikut tema adalah kartu
// yang tiba-tiba berwarna lain dari tetangganya.
// ============================================================================

/**
 * Slot cahaya, menurut POSISI kartu - bukan nama warna. Nama warna ("merah
 * muda") berhenti benar begitu sebuah tema mengganti isinya; nomor slot tidak.
 */
export type NuansaKpi = 1 | 2 | 3 | 4;

const cahaya = (n: NuansaKpi) => ({
  latar: `var(--cahaya-${n}-latar)`,
  ikonLatar: `var(--cahaya-${n}-ikon-latar)`,
  ikonWarna: `var(--cahaya-${n}-ikon-warna)`,
});

/** Ikon bulat bernuansa - dipakai di pojok kiri atas setiap kartu bercahaya. */
export function IkonBercahaya({ nuansa, children }: { nuansa: NuansaKpi; children: React.ReactNode }) {
  const c = cahaya(nuansa);
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-full"
      style={{ background: c.ikonLatar, color: c.ikonWarna }}
    >
      {children}
    </div>
  );
}

/**
 * Chrome kartu bercahaya.
 *
 * TANPA `overflow-hidden` DI AKAR KARTU, dan itu disengaja. Cahayanya dipotong
 * oleh lapisannya sendiri (`rounded-[inherit]` - latar belakang selalu ikut
 * terpotong lengkung sudut elemennya), bukan oleh kartunya. Kalau kartunya
 * yang diberi `overflow-hidden`, keterangan pie yang menjulur ke bawah kartu
 * ikut terpotong di tepinya.
 */
export function KartuBercahaya({
  nuansa,
  tundaMs,
  kelas = "",
  children,
}: {
  nuansa: NuansaKpi;
  tundaMs: number;
  /** Kelas tambahan dari pemanggil, mis. penaik z-index saat disorot. */
  kelas?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`gj-masuk relative flex h-full flex-col justify-between rounded-2xl border border-line bg-surface p-5 shadow-xs transition hover:shadow-sm ${kelas}`}
      style={{ animationDelay: `${tundaMs}ms` }}
    >
      {/* `aria-hidden` + pointer-events-none: lapisan ini murni rupa. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: `radial-gradient(150px 120px at 16% 2%, ${cahaya(nuansa).latar} 0%, transparent 72%)` }}
      />
      {children}
    </div>
  );
}
