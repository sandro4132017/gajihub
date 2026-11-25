"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IoMdCheckmark, IoMdRemove } from "react-icons/io";
import type { KirimFormState } from "./actions";
import { kirimAksiJson } from "../../../lib/koneksi/jawabanAksi";
import {
  TABEL_WAJIB_DIVERIFIKASI,
  type JenisTabelKalkulasi,
} from "../../../business-logic/pengirimanUnit";

/**
 * Kontrol "Tandai sudah diperiksa" untuk SATU tabel kalkulasi - syarat sebelum
 * rekap dikirim ke PPABP. Dipasang di kepala tab/tabel masing-masing, tepat di
 * samping barang yang diperiksa.
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
 *
 * Panel gabungan empat tabel yang dulu tinggal di berkas ini DICABUT (rombak
 * 2026-11): kontrolnya pindah ke kepala tiap tab, ringkasan jumlahnya ke
 * checklist Tahap 4.
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

export function KontrolVerifikasiTabel({
  jenis,
  tersimpan,
  periodeBulan,
  periodeTahun,
  terkunci,
}: {
  jenis: JenisTabelKalkulasi;
  tersimpan: VerifikasiTabel | null;
  periodeBulan: number;
  periodeTahun: number;
  terkunci: boolean;
}) {
  const wajib = TABEL_WAJIB_DIVERIFIKASI.includes(jenis);
  const [state, setState] = useState<KirimFormState>({});
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();
  const sedangKirim = useRef(false);
  const sudah = tersimpan !== null;

  // Lewat Route Handler JSON, bukan Server Action (firewall memblokir
  // multipart). `centang` selalu eksplisit dari keadaan tersimpan, jadi kirim
  // ulang tidak mengubah hasil akhir (idempoten).
  async function simpan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sedangKirim.current) return;
    sedangKirim.current = true;
    setPending(true);
    try {
      const jawaban = await kirimAksiJson("/api/kasubag/kirim/verifikasi-tabel", {
        bulan: periodeBulan,
        tahun: periodeTahun,
        jenisTabel: jenis,
        centang: sudah ? "tidak" : "ya",
      });
      setState(jawaban);
      if (jawaban.success || jawaban.tidakPasti) startRefresh(() => router.refresh());
    } finally {
      sedangKirim.current = false;
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <form onSubmit={simpan} className="flex shrink-0 items-center gap-2">
        {/* Yang belum diwajibkan ditandai APA ADANYA, bukan disembunyikan:
            yang membaca tahu mana yang menahan pengiriman dan mana yang tidak. */}
        {!wajib && (
          <span className="whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-muted">
            belum diwajibkan
          </span>
        )}
        {/* Satu tombol yang memasang DAN mencabut (nilai lawan dari keadaan
            sekarang). */}
        <button
          type="submit"
          disabled={pending || isRefreshing || terkunci}
          className={`btn btn-sm ${sudah ? "btn-ghost" : "btn-secondary"} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {pending || isRefreshing ? "..." : sudah ? "Batalkan centang" : "Tandai sudah diperiksa"}
        </button>
        <span
          aria-hidden
          className={`grid size-6 shrink-0 place-items-center rounded-full ${
            sudah ? "bg-green/15 text-green" : "bg-surface-2 text-muted"
          }`}
        >
          {sudah ? <IoMdCheckmark /> : <IoMdRemove />}
        </span>
        <span className="sr-only">{sudah ? "Tabel sudah diperiksa" : "Tabel belum diperiksa"}</span>
      </form>
      {sudah && (
        <p className="text-[11px] text-muted">
          Diperiksa {tersimpan.olehNama} &middot; {tanggalTeks(tersimpan.pada)}
        </p>
      )}
      {state.error && <p className="text-[11px] font-medium text-red">{state.error}</p>}
    </div>
  );
}
