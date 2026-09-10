import {
  dikecualikanPotonganKehadiran,
  jenjangPejabatPimpinanTinggi,
} from "../business-logic/pejabatPimpinanTinggi";

/**
 * Penanda kecil di samping nama pegawai untuk Pejabat Pimpinan Tinggi
 * (Eselon I/II), berisi keterangan kenapa tunjangan kinerjanya tidak kena
 * potongan kehadiran.
 *
 * KENAPA `<details>`, BUKAN POPOVER CLIENT COMPONENT:
 * buka-tutupnya ditangani browser sendiri, jadi tidak butuh JavaScript sama
 * sekali - konsisten dengan janji "semua tetap jalan tanpa JS" yang dipegang
 * halaman-halaman lain (filter GET, form approval). Isinya juga muncul DI
 * DALAM sel, bukan melayang di atasnya: tabel-tabel ini dibungkus
 * `overflow-x: auto`, dan panel melayang akan terpotong di tepi kontainer.
 *
 * Kembalikan `null` untuk pegawai biasa - penandanya harus berarti sesuatu,
 * jadi tidak dirender kalau tidak ada yang perlu diterangkan.
 *
 * ==========================================================================
 * JANGAN TARUH DI DALAM <p>, <h1>-<h6>, ATAU <span>
 * ==========================================================================
 * `<details>` adalah **flow content**, sementara elemen-elemen itu hanya boleh
 * memuat **phrasing content**. Untuk `<p>` dan heading, parser HTML menutup
 * paksa elemen induknya sebelum `<details>` - jadi DOM hasil parsing berbeda
 * dari pohon React dan Next melempar hydration error yang menunjuk ke
 * `<summary>` di bawah (bukan ke tempat pemakaiannya, jadi menyesatkan).
 *
 * Pakai `<div>` sebagai pembungkus, atau taruh badge-nya DI LUAR heading
 * dalam satu wadah flex. Di dalam sel tabel (`<td>`) aman - sel menerima flow
 * content.
 */
export function BadgePejabatEselon({ kelasJabatan }: { kelasJabatan: number | null | undefined }) {
  if (!dikecualikanPotonganKehadiran(kelasJabatan)) return null;
  const jenjang = jenjangPejabatPimpinanTinggi(kelasJabatan);

  return (
    <details className="group ml-1 inline-block align-middle">
      <summary
        // WARNA NETRAL, bukan emas. Selama pengecualian ini masih berstatus
        // asumsi, latar emas memang tepat - ada sesuatu di baris ini yang
        // belum berdasar. Sesudah diputuskan final (2026-09-10), emas cuma
        // menyisakan salah baca: orang mengira ada masalah dengan pegawainya.
        // Bentuknya kini sama dengan ikon keterangan lain di aplikasi ini.
        className="inline-flex h-4 w-4 cursor-pointer list-none items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold leading-none text-ink-2 ring-1 ring-inset ring-line marker:hidden hover:bg-teal-tint hover:text-teal-deep [&::-webkit-details-marker]:hidden"
        title={`Pejabat ${jenjang} - klik untuk keterangan`}
        aria-label={`Keterangan jabatan: Pejabat ${jenjang}`}
      >
        ★
      </summary>
      <div className="mt-1.5 w-64 max-w-full rounded-lg border border-line bg-surface-2 p-2.5 text-xs font-normal leading-relaxed text-ink-2">
        <p className="font-bold text-ink">Pejabat {jenjang}</p>
        <p className="mt-1">
          Kelas jabatan <strong>{kelasJabatan}</strong>. Komponen kehadiran (30% dari tunjangan kinerja) dibayar{" "}
          <strong>penuh</strong> sebagai kompensasi jabatan - potongan Pasal 13 tidak diterapkan.
        </p>
        <p className="mt-1">
          Pelanggaran presensinya <strong>tetap dicatat dan tetap ditampilkan</strong> apa adanya, hanya tidak
          mengurangi nominal.
        </p>
        <p className="mt-1 text-muted">
          Mengikuti praktik pembayaran yang berjalan di Biro Keuangan, bukan pasal di Permenaker 15/2024.
        </p>
      </div>
    </details>
  );
}
