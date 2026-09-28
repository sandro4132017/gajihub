"use client";

import { useActionState } from "react";
import { IoMdCheckmark, IoMdRemove } from "react-icons/io";
import { setVerifikasiTabelAction, type KirimFormState } from "./actions";
import {
  LABEL_TABEL_KALKULASI,
  TABEL_KALKULASI,
  TABEL_WAJIB_DIVERIFIKASI,
  type JenisTabelKalkulasi,
} from "../../../business-logic/pengirimanUnit";

/**
 * Daftar periksa tiga tabel kalkulasi, syarat sebelum rekap dikirim ke PPABP.
 *
 * KENAPA CENTANGNYA DISIMPAN, bukan sekadar pernyataan di dialog Kirim
 * (keputusan user 2026-09-22): memeriksa tiga tabel bukan pekerjaan sekali
 * duduk - orang membuka tabel Tukin hari ini, tabel lembur besok. Centang yang
 * hilang tiap halaman ditutup memaksa semuanya diperiksa ulang dalam satu
 * sesi, dan yang terjadi di lapangan bukan orang memeriksa lebih teliti,
 * melainkan orang mencentang tanpa membaca.
 *
 * Yang disimpan juga menjawab pertanyaan yang tidak bisa dijawab pernyataan
 * sesaat: siapa memeriksa tabel MANA, kapan.
 */

export interface VerifikasiTabel {
  jenisTabel: JenisTabelKalkulasi;
  olehNama: string;
  pada: Date;
}

function tanggalTeks(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function VerifikasiTabelPanel({
  periodeBulan,
  periodeTahun,
  verifikasi,
  terkunci,
  tautan,
}: {
  periodeBulan: number;
  periodeTahun: number;
  verifikasi: readonly VerifikasiTabel[];
  terkunci: boolean;
  /**
   * Anchor ke tabel masing-masing, DITENTUKAN HALAMAN - bukan dikarang di
   * sini.
   *
   * Sebabnya Uang Makan: di tampilan ringkas ia cuma satu KOLOM di tabel
   * Rincian Tukin, dan tabel tersendirinya hanya lahir pada `?rincian=1`.
   * Anchor yang dipatok di komponen ini akan menunjuk elemen yang separuh
   * waktu tidak ada - dan tautan yang diklik lalu tidak terjadi apa-apa lebih
   * buruk daripada tidak ada tautan.
   */
  tautan: Record<JenisTabelKalkulasi, string>;
}) {
  const peta = new Map(verifikasi.map((v) => [v.jenisTabel, v]));
  const wajib = new Set(TABEL_WAJIB_DIVERIFIKASI);
  const kurang = TABEL_WAJIB_DIVERIFIKASI.filter((t) => !peta.has(t));

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-extrabold text-white">
            1
          </span>
          Periksa tabel kalkulasi
        </h3>
        {/* BADGE, bukan teks polos - status ini yang paling sering dicari mata
            waktu halaman dibuka, dan latar berwarna membuatnya bisa ditemukan
            tanpa dibaca dulu. */}
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
            kurang.length === 0 ? "bg-green/10 text-green" : "bg-gold-tint text-gold-deep"
          }`}
        >
          {kurang.length === 0 ? (
            <>
              <IoMdCheckmark aria-hidden className="shrink-0" /> Semua diperiksa
            </>
          ) : (
            `${kurang.length} belum diperiksa`
          )}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">Periksa setiap tabel sebelum mengirim.</p>

      <ul className="mt-3 divide-y divide-line-2 border-t border-line-2">
        {TABEL_KALKULASI.map((jenis) => (
          <BarisTabel
            key={jenis}
            jenis={jenis}
            wajib={wajib.has(jenis)}
            tersimpan={peta.get(jenis) ?? null}
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            terkunci={terkunci}
            tautan={tautan[jenis]}
          />
        ))}
      </ul>
    </div>
  );
}

function BarisTabel({
  jenis,
  wajib,
  tersimpan,
  periodeBulan,
  periodeTahun,
  terkunci,
  tautan,
}: {
  jenis: JenisTabelKalkulasi;
  wajib: boolean;
  tersimpan: VerifikasiTabel | null;
  periodeBulan: number;
  periodeTahun: number;
  terkunci: boolean;
  tautan: string;
}) {
  const [state, formAction, pending] = useActionState(setVerifikasiTabelAction, {} as KirimFormState);
  const sudah = tersimpan !== null;

  return (
    // JUDUL + TOMBOL selalu satu baris, sisanya di bawah.
    //
    // Pernah dibuat satu baris ber-`flex-wrap` dengan `justify-between`, dan
    // akibatnya posisi tombol ikut panjang teks di sebelahnya - yang pendek
    // tombolnya di kanan, yang panjang mendorongnya turun lalu menempel ke
    // KIRI. Empat baris dengan tombol di tiga posisi berbeda, padahal
    // keempatnya aksi yang sama. Susunan di bawah membuatnya tidak bisa
    // terjadi lagi.
    <li className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
          {/* <a> biasa, BUKAN next/link: tujuannya anchor di halaman yang sama,
              jadi tidak ada navigasi yang perlu di-prefetch atau dirutekan.
              Garis bawahnya TETAP tampil (tidak cuma saat hover) - kalau
              keberadaan tautan baru terungkap setelah kursor lewat, yang tidak
              menggerakkan kursor ke situ tidak akan pernah tahu. */}
          <a
            href={tautan}
            className="underline decoration-line-2 underline-offset-2 hover:decoration-navy"
          >
            {LABEL_TABEL_KALKULASI[jenis]}
          </a>
          {/* Yang belum diwajibkan ditandai APA ADANYA, bukan disembunyikan:
              ketiganya tetap terlihat sebagai satu rangkaian, dan yang membaca
              tahu mana yang menahan pengiriman dan mana yang tidak. */}
          {!wajib && (
            <span className="ml-2 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
              belum diwajibkan
            </span>
          )}
        </p>

        <form action={formAction} className="flex shrink-0 items-center gap-2">
          <input type="hidden" name="bulan" value={periodeBulan} />
          <input type="hidden" name="tahun" value={periodeTahun} />
          <input type="hidden" name="jenisTabel" value={jenis} />
          {/* Nilai lawan dari keadaan sekarang - satu tombol yang memasang DAN
              mencabut. Dua tombol terpisah membuat keadaan "sudah dicentang"
              harus dibaca dari mana tombol yang menyala, bukan dari chip-nya. */}
          <input type="hidden" name="centang" value={sudah ? "tidak" : "ya"} />
          <button
            type="submit"
            disabled={pending || terkunci}
            className={`btn btn-sm ${sudah ? "btn-ghost" : "btn-secondary"} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {pending ? "..." : sudah ? "Batalkan centang" : "Tandai sudah diperiksa"}
          </button>
          {/* Tadinya huruf "v" dan "-" biasa - bentuknya memang mirip centang
              dan strip, tapi ia huruf, jadi tebalnya ikut font dan tingginya
              ikut baris teks. */}
          <span
            aria-hidden
            className={`grid size-6 shrink-0 place-items-center rounded-full ${
              sudah ? "bg-green/15 text-green" : "bg-surface-2 text-muted"
            }`}
          >
            {sudah ? <IoMdCheckmark /> : <IoMdRemove />}
          </span>
        </form>
      </div>

      {/* KETERANGAN TIAP TABEL DICABUT (permintaan user 2026-09-28).
          Keterangannya tidak hilang - ia pindah ke ikon "i" di samping judul
          tabelnya masing-masing, tempat sumber data & acuannya juga berada.
          Diulang di sini cuma menambah empat baris yang dibaca sekali lalu
          jadi latar. */}
      {sudah && (
        <p className="mt-0.5 text-[11px] text-muted">
          Diperiksa {tersimpan.olehNama} &middot; {tanggalTeks(tersimpan.pada)}
        </p>
      )}
      {state.error && <p className="mt-1 text-[11px] font-medium text-red">{state.error}</p>}
    </li>
  );
}
