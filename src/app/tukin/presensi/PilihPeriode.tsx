"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchableSelect } from "../../SearchableSelect";
import { NAMA_BULAN } from "../../bulan";

/**
 * Kendali periode untuk seluruh halaman Presensi - SATU-SATUNYA.
 *
 * Dulu ada DUA pasang: kartu sinkronisasi punya Bulan+Tahun sendiri, dan kartu
 * filter di bawahnya punya Bulan+Tahun lagi. Keduanya bisa menunjuk bulan yang
 * berbeda, dan itu bukan kemungkinan teoretis - orang menarik Juli sambil
 * melihat tabel Agustus, lalu menyimpulkan tarikannya gagal.
 *
 * BULAN & TAHUN TETAP DUA DROPDOWN TERPISAH (permintaan user 2026-09-14).
 * Sempat digabung jadi satu nilai "Agustus 2026" dan itu DICABUT - bukan cuma
 * soal selera: dua field bernama `bulan` & `tahun` adalah bentuk yang sudah
 * dipakai seluruh aplikasi ini, jadi menggabungnya berarti halaman ini
 * sendirian punya bentuk URL yang lain.
 *
 * BERPINDAH SENDIRI saat dipilih (`router.replace`, bukan `push` - kalau tiap
 * ganti bulan menambah entri riwayat, tombol Back jadi memutar ulang pilihan
 * satu per satu). Pola yang sama dengan PencarianDebounce.
 *
 * TANPA JAVASCRIPT tetap jalan: komponen ini dipasang di dalam
 * `<form method="get">` milik pemanggilnya, kedua nilainya terkirim sebagai
 * `?bulan=&tahun=` biasa, dan tombol submit-nya ada di dalam `<noscript>`
 * milik pemanggil.
 */
export function PilihPeriode({
  bulan,
  tahun,
  tahunOpsi,
}: {
  bulan: number;
  tahun: number;
  /** Tahun yang boleh dipilih - dari daftarTahunPeriode(). */
  tahunOpsi: number[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Pindah halaman dengan SATU nilai diubah, sisanya disalin apa adanya.
   *
   * Pencarian, satuan kerja, dan penanda `dari=tukin` sengaja dipertahankan:
   * yang diganti orang cuma periodenya, dan menyapu filter lain memaksa dia
   * menyetel ulang pekerjaannya.
   */
  const pindah = (kunci: "bulan" | "tahun", nilai: string) => {
    if (!nilai) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set(kunci, nilai);
    // Halaman dikembalikan ke awal: periode baru isinya lain, dan bertahan di
    // halaman ke-4 berarti mendarat di tabel kosong yang terbaca seperti
    // "tidak ada data".
    params.delete("hal");
    router.replace(`${pathname}?${params.toString()}`);
  };

  return (
    <>
      <div>
        <label className="field-label">Bulan</label>
        <SearchableSelect
          name="bulan"
          className="w-36"
          options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
          defaultValue={String(bulan)}
          onValueChange={(v) => pindah("bulan", v)}
        />
      </div>
      <div>
        <label className="field-label">Tahun</label>
        <SearchableSelect
          name="tahun"
          className="w-28"
          // Tahun terbaru di atas: yang dikerjakan orang hampir selalu periode
          // terakhir.
          options={[...tahunOpsi].sort((a, b) => b - a).map((t) => ({ value: String(t), label: String(t) }))}
          defaultValue={String(tahun)}
          onValueChange={(v) => pindah("tahun", v)}
        />
      </div>
    </>
  );
}
