"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { KirimFormState } from "./actions";
import { Modal } from "../../../components/feedback/Modal";
import { kirimAksiJson } from "../../../lib/koneksi/jawabanAksi";

const INITIAL_STATE: KirimFormState & { tidakPasti?: boolean } = {};

/**
 * "Kembalikan ke unit" - satu-satunya jalan membuka kiriman yang terkunci.
 *
 * Dipegang PPABP, dan alasannya WAJIB. Unit tidak punya cara lain mengetahui
 * apa yang harus diperbaiki: yang mereka lihat cuma rekap yang tadinya
 * terkunci tiba-tiba terbuka lagi. Panjang minimalnya dijaga di server juga
 * (lihat ./actions.ts) - `minLength` di sini cuma memberi tahu lebih cepat.
 */
export function KembalikanRekapForm({
  satuanKerja,
  periodeBulan,
  periodeTahun,
  bisaDikembalikan,
}: {
  satuanKerja: string;
  periodeBulan: number;
  periodeTahun: number;
  /**
   * Unit ini berstatus Terkirim, jadi masih ada yang bisa dikembalikan.
   *
   * Dikirim sebagai PROP, bukan dipakai pemanggilnya untuk memilih merender
   * komponen ini atau tidak: aksinya memanggil `revalidatePath`, jadi begitu
   * pengembalian berhasil barisnya berubah jadi "Dikembalikan". Kalau
   * komponennya ikut dilepas di situ, popup hasilnya lenyap sebelum sempat
   * terbaca.
   */
  bisaDikembalikan: boolean;
}) {
  // Lewat Route Handler JSON (/api/ppabp/kembalikan-rekap), bukan Server
  // Action: firewall jaringan memblokir body multipart Server Action.
  const [state, setState] = useState(INITIAL_STATE);
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();
  const sedangKirim = useRef(false);
  const sibuk = pending || isRefreshing;

  async function kembalikan(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sedangKirim.current) return;
    sedangKirim.current = true;
    const data = new FormData(e.currentTarget);
    setPending(true);
    try {
      const jawaban = await kirimAksiJson("/api/ppabp/kembalikan-rekap", {
        satuanKerja,
        bulan: periodeBulan,
        tahun: periodeTahun,
        alasan: String(data.get("alasan") ?? ""),
      });
      setState(jawaban);
      if (jawaban.success || jawaban.tidakPasti) startRefresh(() => router.refresh());
    } finally {
      sedangKirim.current = false;
      setPending(false);
    }
  }
  const [notifTertutup, setNotifTertutup] = useState(false);

  const [jawabanTerakhir, setJawabanTerakhir] = useState(state);
  if (state !== jawabanTerakhir) {
    setJawabanTerakhir(state);
    setNotifTertutup(false);
  }

  const tutupNotif = () => setNotifTertutup(true);

  const popupHasil = (
    <>
      <Modal
        terbuka={!!state.success && !notifTertutup}
        nada="sukses"
        judul="Rekap dikembalikan ke unit"
        onTutup={tutupNotif}
        aksi={
          <button type="button" onClick={tutupNotif} className="btn btn-primary btn-sm">
            Mengerti
          </button>
        }
      >
        <p>
          <strong className="text-ink">{satuanKerja}</strong> periode{" "}
          <strong className="text-ink">
            {periodeBulan}/{periodeTahun}
          </strong>{" "}
          sudah terbuka lagi. Unit bisa menghitung ulang dan mengirimnya kembali.
        </p>
        <p className="mt-2">
          Alasan yang kamu tulis tersimpan di audit trail dan itulah satu-satunya keterangan yang dimiliki
          unit tentang apa yang harus diperbaiki.
        </p>
      </Modal>

      <Modal
        terbuka={!!state.error && !notifTertutup}
        nada="bahaya"
        judul="Rekap tidak bisa dikembalikan"
        onTutup={tutupNotif}
        aksi={
          <button type="button" onClick={tutupNotif} className="btn btn-ghost btn-sm">
            Tutup
          </button>
        }
      >
        <p>{state.error}</p>
        {state.tidakPasti && (
          <p className="mt-2 text-muted">
            Status belum pasti - halaman dimuat ulang; periksa apakah rekap sudah dikembalikan sebelum mengulang.
          </p>
        )}
      </Modal>
    </>
  );

  if (!bisaDikembalikan) {
    return (
      <>
        <span className="text-xs text-muted">-</span>
        {popupHasil}
      </>
    );
  }

  return (
    <form onSubmit={kembalikan} className="flex flex-col items-stretch gap-1.5">
      {/* Placeholder dipendekkan supaya terbaca utuh di kolom yang sempit -
          yang panjang terpotong di tengah kata dan tidak menerangkan apa pun.
          Kalimat lengkapnya pindah ke `title`, muncul saat kursor berhenti. */}
      <input
        type="text"
        name="alasan"
        required
        minLength={10}
        placeholder="Yang harus diperbaiki?"
        title="Tulis apa yang harus diperbaiki unit ini - ini satu-satunya keterangan yang mereka terima."
        className="field-input w-full min-w-0 py-1 text-xs"
      />
      <button type="submit" disabled={sibuk} className="btn btn-ghost btn-sm w-full">
        {sibuk ? "..." : "Kembalikan"}
      </button>
      {popupHasil}
    </form>
  );
}
