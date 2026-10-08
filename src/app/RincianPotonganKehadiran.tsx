"use client";

import { useEffect, useRef, useState } from "react";
import { hitungPotonganKehadiranPersen, type InputPotonganKehadiran } from "../business-logic/tukin";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const persen = (pecahan: number, desimal = 2) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: desimal }).format(pecahan * 100) +
  "%";

function InfoTanggalPopover({ tanggalList }: { tanggalList: string[] }) {
  const [buka, setBuka] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setBuka(false);
      }
    }
    if (buka) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [buka]);

  return (
    <div className="relative inline-flex items-center ml-1.5 align-middle" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setBuka((prev) => !prev)}
        className="inline-flex size-4 items-center justify-center rounded-full text-teal-deep hover:bg-teal-tint/70 transition-colors focus:outline-none"
        title="Klik untuk melihat rincian tanggal kejadian"
        aria-label="Lihat rincian tanggal kejadian"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="size-3.5">
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {buka && (
        <div className="absolute left-1/2 top-full z-30 mt-1.5 -translate-x-1/2 rounded-xl border border-line bg-surface p-3 shadow-xl ring-1 ring-black/5 whitespace-normal min-w-[220px] max-w-xs text-left">
          <div className="flex items-center justify-between pb-1.5 border-b border-line">
            <p className="text-xs font-bold text-ink">Tanggal Kejadian</p>
            <button
              type="button"
              onClick={() => setBuka(false)}
              className="text-muted hover:text-ink text-xs font-semibold px-1"
              aria-label="Tutup"
            >
              &times;
            </button>
          </div>
          <div className="mt-2">
            {tanggalList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tanggalList.map((tgl, idx) => (
                  <span
                    key={idx}
                    className="rounded-md bg-surface-2 border border-line px-2 py-0.5 font-mono text-[11px] font-semibold text-ink-2"
                  >
                    {tgl}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted">
                Rincian tanggal tidak tersedia untuk periode yang diisi lewat template Excel.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Tabel "kenapa tukin saya segini" - rincian potongan Pasal 13 per jenis
 * pelanggaran, lengkap dengan pasal yang jadi dasarnya.
 *
 * Angkanya TIDAK dihitung ulang di sini dan tidak disalin: dipanggil langsung
 * dari `hitungPotonganKehadiranPersen()`, fungsi PURE yang sama persis dipakai
 * `hitungTukin` waktu menghitung yang dibayarkan. Kalau tarif atau aturannya
 * berubah, tabel ini ikut sendiri - tidak ada kesempatan tampilan dan
 * perhitungan berbeda.
 *
 * KENAPA DIREKONSTRUKSI, BUKAN DIBACA DARI DATABASE: `TukinCalculation` cuma
 * menyimpan hasil akhir tiap komponen; rincian per jenis pelanggaran hidup di
 * dalam `TukinResult` waktu kalkulasi berjalan lalu hilang. Menyimpannya butuh
 * migrasi dan tabel baru, sementara bahannya (`RekapPresensiPeriode`) sudah
 * ada dan pasti - jadi tidak ada yang perlu ditebak.
 *
 * KONSEKUENSI YANG HARUS DISADARI: yang ditampilkan adalah rekap presensi
 * SAAT INI. Kalau presensinya berubah setelah Tukin terakhir dihitung, tabel
 * ini tidak akan menjumlah ke angka yang tersimpan - dan itu justru informasi
 * berguna: berarti perlu hitung ulang. Pemanggil bisa menyalakan
 * `nilaiTersimpan` supaya selisihnya ditunjukkan, bukan dibiarkan diam-diam.
 */
export function RincianPotonganKehadiran({
  rekap,
  bobotKehadiranPenuh,
  nilaiTersimpan,
  dikecualikan = false,
  keteranganTidakPresensi,
}: {
  rekap: InputPotonganKehadiran;
  /** 30% x tarif kelas jabatan, dalam rupiah. null kalau kelas jabatannya tidak diketahui. */
  bobotKehadiranPenuh: number | null;
  /** Komponen kehadiran yang BENAR-BENAR tersimpan di baris kalkulasi, buat dibandingkan. */
  nilaiTersimpan?: number | null;
  /**
   * Pejabat Pimpinan Tinggi - potongan dihitung tapi tidak diterapkan.
   * Pelanggarannya TETAP ditampilkan (fakta tidak disembunyikan), cuma
   * kolom rupiahnya nol dan diberi keterangan. Lihat pejabatPimpinanTinggi.ts.
   */
  dikecualikan?: boolean;
  /**
   * Daftar tanggal pelanggaran tidak presensi masuk/pulang (Pasal 13 ayat (2)),
   * misal: ["05/09 (masuk)", "12/09 (pulang)"].
   */
  keteranganTidakPresensi?: string[];
}) {
  const { totalPersen, rincian } = hitungPotonganKehadiranPersen(rekap);
  const totalPersenDiterapkan = dikecualikan ? 0 : totalPersen;

  const rupiahPotongan = (p: number) => (bobotKehadiranPenuh === null ? null : bobotKehadiranPenuh * p);
  const totalRupiah = rupiahPotongan(totalPersenDiterapkan);
  const sisa = bobotKehadiranPenuh === null || totalRupiah === null ? null : bobotKehadiranPenuh - totalRupiah;

  // Selisih terhadap angka tersimpan. Toleransi 1 rupiah = pembulatan
  // floating point, bukan toleransi kebijakan.
  const selisih = sisa !== null && nilaiTersimpan != null ? sisa - nilaiTersimpan : null;
  const perluHitungUlang = selisih !== null && Math.abs(selisih) > 1;

  if (rincian.length === 0) {
    return (
      <div className="card mt-4 p-4">
        <p className="text-sm font-bold text-ink">Rincian potongan kehadiran</p>
        <p className="mt-1 text-sm text-muted">
          Tidak ada pelanggaran Pasal 13 pada rekap presensi periode ini - komponen kehadiran dibayar penuh
          {bobotKehadiranPenuh !== null && <> ({rupiah(bobotKehadiranPenuh)})</>}.
        </p>
      </div>
    );
  }

  return (
    <div className="card mt-4 overflow-x-auto">
      <div className="p-4 pb-2">
        <p className="text-sm font-bold text-ink">Rincian potongan kehadiran</p>
        <p className="mt-0.5 text-xs text-muted">
          Bobot kehadiran sebesar <strong>30%</strong> dari tunjangan kinerja (Pasal 5 ayat (2) huruf b). Potongan
          dihitung dari bobot kehadiran, <strong>bukan</strong> dari total tunjangan kinerja.
        </p>
      </div>

      {dikecualikan && (
        <p className="border-y border-line bg-gold-tint px-3 py-2.5 text-sm text-ink-2">
          <strong>Pejabat Pimpinan Tinggi</strong> - komponen kehadiran dibayar <strong>penuh</strong> sebagai
          kompensasi jabatan. Pelanggaran di bawah tetap ditampilkan apa adanya, tapi <strong>tidak memotong</strong>{" "}
          tunjangan kinerja periode ini. Dasar hukum pengecualian ini masih menunggu konfirmasi.
        </p>
      )}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5">Jenis pelanggaran</th>
            <th className="px-3 py-2.5">Dasar</th>
            <th className="px-3 py-2.5">Jumlah</th>
            <th className="px-3 py-2.5">Tarif</th>
            <th className="px-3 py-2.5">Potongan</th>
            <th className="px-3 py-2.5">Rupiah</th>
          </tr>
        </thead>
        <tbody>
          {rincian.map((r) => {
            const rp = rupiahPotongan(r.totalPersen);
            const isTidakPresensi = r.dasarHukum.includes("ayat (2)");
            return (
              <tr key={`${r.jenis}-${r.dasarHukum}`} className={`border-b border-line-2 ${dikecualikan ? "text-muted" : ""}`}>
                <td className="px-3 py-2.5 text-ink">{r.jenis}</td>
                <td className="px-3 py-2.5 text-xs text-muted">{r.dasarHukum}</td>
                <td className="px-3 py-2.5 font-mono whitespace-nowrap">
                  <span className="inline-flex items-center">
                    {r.jumlah} {r.satuan}
                    {isTidakPresensi && (
                      <InfoTanggalPopover tanggalList={keteranganTidakPresensi ?? []} />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-muted">{persen(r.tarifPersen, 2)}</td>
                <td className={`px-3 py-2.5 font-mono ${dikecualikan ? "line-through" : ""}`}>
                  {persen(r.totalPersen, 2)}
                </td>
                <td className={`px-3 py-2.5 font-mono ${dikecualikan ? "line-through" : ""}`}>
                  {rp === null ? "-" : rupiah(rp)}
                </td>
              </tr>
            );
          })}
          <tr className="border-b border-line bg-surface-2 font-bold">
            <td className="px-3 py-2.5 text-ink" colSpan={4}>
              Total potongan {dikecualikan && <span className="font-normal text-muted">(dikecualikan)</span>}
            </td>
            <td className="px-3 py-2.5 font-mono">{persen(totalPersenDiterapkan, 2)}</td>
            <td className="px-3 py-2.5 font-mono">{totalRupiah === null ? "-" : rupiah(totalRupiah)}</td>
          </tr>
          {bobotKehadiranPenuh !== null && (
            <>
              <tr className="border-b border-line-2 text-muted">
                <td className="px-3 py-2.5" colSpan={5}>
                  Bobot kehadiran penuh (30%)
                </td>
                <td className="px-3 py-2.5 font-mono">{rupiah(bobotKehadiranPenuh)}</td>
              </tr>
              <tr className="font-bold text-ink">
                <td className="px-3 py-2.5" colSpan={5}>
                  Komponen kehadiran yang dibayar
                </td>
                <td className="px-3 py-2.5 font-mono">{sisa === null ? "-" : rupiah(sisa)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>

      {perluHitungUlang && (
        <p className="border-t border-line bg-gold-tint px-3 py-2.5 text-sm text-ink-2">
          Angka di atas dihitung dari <strong>rekap presensi saat ini</strong>, dan hasilnya berbeda{" "}
          <strong>{rupiah(Math.abs(selisih!))}</strong> dari yang tersimpan di baris kalkulasi. Artinya presensinya
          berubah setelah Tukin terakhir dihitung - perlu <strong>hitung ulang</strong> supaya yang dibayarkan sesuai.
        </p>
      )}
    </div>
  );
}
