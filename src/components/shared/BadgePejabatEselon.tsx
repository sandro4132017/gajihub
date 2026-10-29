import {
  dikecualikanPotonganKehadiran,
  jenjangPejabatPimpinanTinggi,
} from "../../business-logic/pejabatPimpinanTinggi";

/**
 * Penanda kecil di samping nama pegawai untuk Pejabat Pimpinan Tinggi
 * (Eselon I/II), berisi keterangan kenapa tunjangan kinerjanya tidak kena
 * potongan kehadiran.
 *
 * MUNCUL SAAT HOVER ATAU FOKUS, TANPA KLIK (permintaan user 2026-10-27).
 * Mekanikanya sama dengan `InfoIkon`: murni CSS (`group-hover` +
 * `group-focus-within`), bukan client component, tetap jalan tanpa JS.
 * `tabIndex` menjaga keterangannya terjangkau dari papan ketik.
 *
 * SELURUHNYA `<span>` (*phrasing content*), jadi aman di dalam `<h1>`, `<p>`,
 * dan `<td>`. Versi lama memakai `<details>` (flow content) dan melempar
 * hydration error kalau ditaruh di dalam heading - JANGAN kembali ke sana.
 *
 * Panelnya rata KIRI terhadap ikon, bukan di tengah: badge ini hampir selalu
 * di kolom nama, kolom paling kiri tabel yang dibungkus `overflow-x: auto`,
 * dan panel yang ditengahkan terpotong di tepi kiri kontainer.
 *
 * Kembalikan `null` untuk pegawai biasa - penandanya harus berarti sesuatu,
 * jadi tidak dirender kalau tidak ada yang perlu diterangkan.
 */
export function BadgePejabatEselon({ kelasJabatan }: { kelasJabatan: number | null | undefined }) {
  if (!dikecualikanPotonganKehadiran(kelasJabatan)) return null;
  const jenjang = jenjangPejabatPimpinanTinggi(kelasJabatan);

  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <span
        tabIndex={0}
        role="note"
        aria-label={`Keterangan jabatan: Pejabat ${jenjang}`}
        // WARNA NETRAL, bukan emas. Selama pengecualian ini masih berstatus
        // asumsi, latar emas memang tepat - ada sesuatu di baris ini yang
        // belum berdasar. Sesudah diputuskan final (2026-09-10), emas cuma
        // menyisakan salah baca: orang mengira ada masalah dengan pegawainya.
        // TANPA `title`: tooltip bawaan browser akan menutupi panel di bawah.
        className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold leading-none text-ink-2 ring-1 ring-inset ring-line transition group-hover:bg-teal-tint group-hover:text-teal-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-biru"
      >
        ★
      </span>
      {/* pointer-events-none: isinya cuma dibaca, jangan menghalangi klik
          elemen di bawahnya (mis. tautan nama di baris berikutnya). */}
      <span className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-30 block w-64 rounded-lg border border-line bg-surface p-2.5 text-left text-xs font-normal leading-relaxed text-ink-2 opacity-0 shadow-[0_8px_24px_rgba(19,65,107,0.14)] transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <span className="block font-bold text-ink">Pejabat {jenjang}</span>
        <span className="mt-1 block">
          Kelas jabatan <strong>{kelasJabatan}</strong>. Komponen kehadiran (30% dari tunjangan kinerja) dibayar{" "}
          <strong>penuh</strong> sebagai kompensasi jabatan - potongan Pasal 13 tidak diterapkan.
        </span>
        <span className="mt-1 block">
          Pelanggaran presensinya <strong>tetap dicatat dan tetap ditampilkan</strong> apa adanya, hanya tidak
          mengurangi nominal.
        </span>
        <span className="mt-1 block text-muted">
          Mengikuti praktik pembayaran yang berjalan di Biro Keuangan, bukan pasal di Permenaker 15/2024.
        </span>
      </span>
    </span>
  );
}
