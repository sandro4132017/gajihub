"use client";

import { useActionState, useState } from "react";
import { hapusPredikatPeriodeAction, type KelolaPredikatFormState } from "./actionsKelola";

const INITIAL_STATE: KelolaPredikatFormState = {};

/**
 * Hapus seluruh predikat satu satuan kerja pada satu periode, buat mengganti
 * file rekap yang salah.
 *
 * Konfirmasi DUA LANGKAH dan menyebut angka & nama unitnya - bukan
 * `confirm()` bawaan browser, yang tidak bisa menampilkan konteks sebanyak ini
 * dan gampang di-klik refleks. Pola yang sama dipakai hapus per orang.
 */
export function HapusPeriodeForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
  namaPeriode,
  jumlahBaris,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  namaPeriode: string;
  /** Jumlah yang sedang dilihat user - dikirim ulang & dicocokkan di server. */
  jumlahBaris: number;
}) {
  const [state, formAction, pending] = useActionState(hapusPredikatPeriodeAction, INITIAL_STATE);
  const [terbuka, setTerbuka] = useState(false);

  if (jumlahBaris === 0) return null;

  return (
    // ZONA BERBAHAYA, bukan kartu setara (permintaan user 2026-09-14).
    // Dipisah garis di kaki halaman tanpa bingkai merah sendiri: yang datang
    // ke halaman ini datang untuk mengunggah, melihat, lalu memperbaiki -
    // bukan menghapus. Panel merah setinggi kartu unggah menarik perhatian
    // sebesar pekerjaan utamanya, padahal ini jalan keluar yang jarang
    // dipakai. Yang MERAH tinggal tombolnya, dan itu memang cukup.
    <div className="mt-8 border-t border-line-2 pt-4">
      {/* SATU BARIS waktu tertutup: keterangan kiri, tombol kanan. Judul
          "Ganti seluruh data periode ini" dan paragraf "Sering kali ini tidak
          perlu..." dua-duanya dicabut - yang pertama mengulang tombolnya,
          yang kedua sistem mengajari orang kapan boleh menekan.

          Yang menahan salah klik bukan teks di halaman, melainkan konfirmasi
          dua langkah di bawah: centang wajib yang menyebut jumlah baris DAN
          nama unitnya, plus kolom alasan. Itu tetap utuh. */}
      {!terbuka ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted">
            Mau unggah ulang <span className="font-semibold text-ink-2">{namaPeriode}</span> dari awal? Hapus dulu data
            lamanya.
          </p>
          <button
            type="button"
            onClick={() => setTerbuka(true)}
            className="shrink-0 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
          >
            Hapus {jumlahBaris} predikat
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="satuanKerja" value={satuanKerja} />
          <input type="hidden" name="periodeBulan" value={periodeBulan} />
          <input type="hidden" name="periodeTahun" value={periodeTahun} />
          <input type="hidden" name="jumlahDilihat" value={jumlahBaris} />

          <label className="flex items-start gap-2 rounded-lg bg-gold-tint p-3 text-xs text-ink-2">
            <input type="checkbox" name="konfirmasi" value="1" required className="mt-0.5 shrink-0" />
            <span>
              Saya paham <strong>{jumlahBaris} baris predikat {satuanKerja}</strong> periode{" "}
              <strong>{namaPeriode}</strong> akan dihapus. Kalkulasi Tukin yang sudah ada TIDAK ikut terhapus dan perlu
              dihitung ulang setelah file baru diupload.
            </span>
          </label>

          <input
            type="text"
            name="alasan"
            placeholder="Alasan (opsional, tercatat di audit trail)"
            className="field-input w-full text-sm"
          />

          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={pending} className="btn btn-danger text-sm">
              {pending ? "Menghapus..." : `Ya, hapus ${jumlahBaris} predikat`}
            </button>
            <button
              type="button"
              onClick={() => setTerbuka(false)}
              className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm font-semibold text-ink-2"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}
    </div>
  );
}
