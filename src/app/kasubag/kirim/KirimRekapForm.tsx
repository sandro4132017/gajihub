"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IoMdCheckmark } from "react-icons/io";
import { RiErrorWarningLine } from "react-icons/ri";
import type { KirimFormState } from "./actions";
import { Modal } from "../../../components/feedback/Modal";
import { kirimAksiJson } from "../../../lib/koneksi/jawabanAksi";
import { labelTombolKirim, type ButirChecklist } from "../../../business-logic/tahapKalkulasiUnit";

const INITIAL_STATE: KirimFormState & { tidakPasti?: boolean } = {};

/** Bunyi pernyataan - SAMA dengan yang dicatat di AuditTrail oleh kirimRekapUnitAction. */
export const TEKS_PERNYATAAN_KIRIM =
  "Saya menyatakan data telah diperiksa dengan benar dan memahami bahwa periode yang dikirim akan terkunci otomatis serta hanya dapat dibuka kembali melalui pengembalian oleh PPABP.";

/**
 * Isi Tahap 4: checklist syarat, catatan, pernyataan, dan tombol Kirim.
 *
 * Checklist & `alasanTertahan` datang dari halaman (business-logic yang sama
 * dengan gerbang di server - cekBolehKirim). Komponen ini tidak menghitung
 * syarat sendiri; ia hanya menampilkan dan menahan tombolnya.
 */
export function KirimRekapForm({
  periodeBulan,
  periodeTahun,
  satuanKerja,
  jumlahKalkulasi,
  checklist,
  daftarNominalNol,
  alasanTertahan,
  alasanKembali,
  terkunci,
}: {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  jumlahKalkulasi: number;
  checklist: readonly ButirChecklist[];
  /** Nama pegawai bertukin bersih 0 - INFO saja, tidak menahan pengiriman. */
  daftarNominalNol: readonly string[];
  alasanTertahan: string | null;
  alasanKembali: string | null;
  terkunci: boolean;
}) {
  // Dikirim lewat Route Handler JSON (/api/kasubag/kirim), bukan Server Action:
  // firewall jaringan memblokir body multipart Server Action.
  const [state, setState] = useState(INITIAL_STATE);
  const [pending, setPending] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();
  const router = useRouter();
  // Penjaga kirim ganda yang dicek SINKRON - `pending` baru terbaca di render
  // berikutnya, jadi dua klik cepat bisa lolos kalau hanya mengandalkannya.
  const sedangKirim = useRef(false);
  // Selama halaman dimuat ulang tombol tetap mati, supaya tidak ada kiriman
  // kedua di atas data yang belum diperbarui.
  const sibuk = pending || isRefreshing;

  async function kirim(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sedangKirim.current) return;
    sedangKirim.current = true;
    const data = new FormData(e.currentTarget);
    setPending(true);
    try {
      const jawaban = await kirimAksiJson("/api/kasubag/kirim", {
        bulan: periodeBulan,
        tahun: periodeTahun,
        pernyataan: String(data.get("pernyataan") ?? ""),
        catatan: String(data.get("catatan") ?? ""),
      });
      setState(jawaban);
      // revalidatePath di route tidak menyegarkan RSC client; sukses dan hasil
      // yang tidak pasti sama-sama memuat ulang supaya status terkunci terbaca.
      if (jawaban.success || jawaban.tidakPasti) startRefresh(() => router.refresh());
    } finally {
      sedangKirim.current = false;
      setPending(false);
    }
  }
  const [setuju, setSetuju] = useState(false);
  const [konfirmasiTerbuka, setKonfirmasiTerbuka] = useState(false);
  const [notifTertutup, setNotifTertutup] = useState(false);

  // Menutup dialog konfirmasi begitu server menjawab, lalu membuka popup
  // hasilnya. Dibaca dari perubahan identitas `state` - bukan lewat useEffect -
  // supaya perpindahan dialognya terjadi di render yang sama dan tidak ada
  // sekejap di mana dua dialog sama-sama tampil.
  const [jawabanTerakhir, setJawabanTerakhir] = useState(state);
  if (state !== jawabanTerakhir) {
    setJawabanTerakhir(state);
    setKonfirmasiTerbuka(false);
    setNotifTertutup(false);
  }

  const tutupNotif = () => setNotifTertutup(true);

  // Popup hasil - dipakai saat panelnya masih tampil MAUPUN sesudah terkunci
  // (lihat catatan di prop `terkunci`).
  const popupHasil = (
    <>
      <Modal
        terbuka={!!state.success && !notifTertutup}
        nada="sukses"
        judul="Rekap berhasil dikirim ke PPABP"
        onTutup={tutupNotif}
        aksi={
          <button type="button" onClick={tutupNotif} className="btn btn-primary btn-sm">
            Mengerti
          </button>
        }
      >
        <p>
          <strong className="text-ink">{jumlahKalkulasi} pegawai</strong> {satuanKerja} periode{" "}
          <strong className="text-ink">
            {periodeBulan}/{periodeTahun}
          </strong>{" "}
          sudah terkirim, dan kalkulasinya sekarang terkunci.
        </p>
        <p className="mt-2">
          Periode ini tidak bisa dihitung ulang atau disunting lagi. Kalau ada yang keliru, hubungi PPABP
          untuk mengembalikannya ke unit.
        </p>
      </Modal>

      <Modal
        terbuka={!!state.error && !notifTertutup}
        nada="bahaya"
        judul="Rekap belum bisa dikirim"
        onTutup={tutupNotif}
        aksi={
          <button type="button" onClick={tutupNotif} className="btn btn-ghost btn-sm">
            Tutup
          </button>
        }
      >
        <p>{state.error}</p>
        <p className="mt-2 text-muted">
          {state.tidakPasti
            ? "Status pengiriman belum pasti - halaman dimuat ulang; periksa apakah rekap sudah terkunci sebelum mengirim lagi."
            : "Tidak ada data yang berubah - rekap unit ini masih bisa disunting seperti biasa."}
        </p>
      </Modal>
    </>
  );

  if (terkunci) return popupHasil;

  const syaratLengkap = alasanTertahan === null;

  return (
    <div className="flex h-full flex-col">
      {/* CHECKLIST SYARAT - daftar utuh, bukan hanya satu alasan: cekBolehKirim()
          `return` pada syarat PERTAMA yang gagal, jadi tanpa daftar ini orang
          membereskan satu alasan lalu menemukan alasan kedua yang sejak awal
          sudah ada. */}
      <ol className="space-y-2" aria-label="Syarat pengiriman">
        {checklist.map((b, i) => (
          <Syarat key={b.kunci} nomor={i + 1} butir={b} />
        ))}
      </ol>

      {/* Nominal nol: INFO. Siapa saja yang tukin bersihnya 0 supaya bisa
          dicek sebelum dikirim - tidak menahan pengiriman. */}
      {daftarNominalNol.length > 0 && (
        <div className="mt-2 border-l-2 border-l-gold pl-3 text-xs text-ink-2">
          <p className="font-bold text-gold-deep">
            {daftarNominalNol.length} pegawai bertukin bersih Rp 0 (info, tidak menahan pengiriman)
          </p>
          <p className="mt-0.5 text-muted">
            {daftarNominalNol.slice(0, 5).join(", ")}
            {daftarNominalNol.length > 5 && ` - dan ${daftarNominalNol.length - 5} lainnya`}
          </p>
        </div>
      )}

      {/* Catatan pengembalian PPABP PINDAH ke spanduk di puncak halaman
          Kalkulasi (SpandukPengembalian) - tidak diulang di sini. */}

      {/* Kalimat "Belum siap dikirim" DICABUT (keputusan user 2026-11-16):
          kotak syarat di atas sudah menyebut yang belum terpenuhi.
          `alasanTertahan` tetap dipakai untuk mematikan tombol Kirim. */}

      <form onSubmit={kirim} className="mt-auto pt-4">
        <label className="block text-xs font-medium text-ink-2" htmlFor="catatan-kirim">
          Catatan Pengiriman ke PPABP <span className="font-normal text-muted">(Opsional)</span>
        </label>
        <textarea
          id="catatan-kirim"
          name="catatan"
          rows={2}
          placeholder="Tambahkan catatan jika ada keterangan khusus untuk PPABP..."
          className="field-input mt-1.5 w-full text-xs"
        />

        {/* PERNYATAAN - SELALU TAMPIL, nonaktif selama syarat belum lengkap.
            Inilah yang menahan pengiriman, jadi dibuat satu-satunya blok
            berkotak di kolom ini. Server mengecek `pernyataan` juga; kotak
            ini bukan penjagaan satu-satunya. */}
        <label
          className={`mt-4 flex items-start gap-2.5 rounded-lg border border-gold/40 bg-gold-tint/60 px-3 py-3 ${
            syaratLengkap ? "cursor-pointer" : "cursor-not-allowed"
          }`}
        >
          <input
            type="checkbox"
            name="pernyataan"
            value="ya"
            checked={setuju && syaratLengkap}
            disabled={!syaratLengkap}
            onChange={(e) => setSetuju(e.target.checked)}
            className="mt-0.5"
          />
          <TeksPernyataan />
        </label>

        {/* Tombol ini TIDAK mengirim form - ia membuka dialog konfirmasi, dan
            tombol submit yang sebenarnya ada di dalam dialog itu. Dialognya
            dirender di dalam <form> ini, jadi `type="submit"` di sana
            mengirimnya tanpa sambungan tambahan. */}
        <button
          type="button"
          disabled={sibuk || !syaratLengkap || !setuju}
          onClick={() => setKonfirmasiTerbuka(true)}
          className="btn btn-primary mt-4 w-full disabled:bg-line disabled:text-muted disabled:opacity-100"
        >
          {sibuk ? "Mengirim..." : labelTombolKirim({ syaratLengkap, pernyataanDicentang: setuju })}
        </button>

        <Modal
          terbuka={konfirmasiTerbuka}
          nada="netral"
          judul={`Kirim rekap ${satuanKerja} ke PPABP?`}
          // Tidak bisa ditutup selagi permintaannya berjalan: menutup dialog di
          // tengah pengiriman membuat orang mengira kirimannya batal, padahal
          // servernya tetap memprosesnya.
          onTutup={sibuk ? null : () => setKonfirmasiTerbuka(false)}
          aksi={
            <>
              <button
                type="button"
                disabled={sibuk}
                onClick={() => setKonfirmasiTerbuka(false)}
                className="btn btn-ghost btn-sm"
              >
                Batal
              </button>
              <button type="submit" disabled={sibuk} className="btn btn-primary btn-sm">
                {sibuk ? "Mengirim..." : "Ya, kirim & kunci"}
              </button>
            </>
          }
        >
          <p>
            Periode{" "}
            <strong className="text-ink">
              {periodeBulan}/{periodeTahun}
            </strong>
            , <strong className="text-ink">{jumlahKalkulasi} pegawai</strong> akan terkirim sekaligus.
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Kalkulasi periode ini langsung terkunci - tidak bisa dihitung ulang atau disunting.</li>
            <li>Angkanya yang dipakai menyusun berkas ADK untuk Web Gaji.</li>
            <li>Hanya PPABP yang bisa membuka kuncinya kembali.</li>
          </ul>
        </Modal>
      </form>

      {popupHasil}
    </div>
  );
}

/** Pernyataan dengan frasa akibatnya ditebalkan; isinya tetap TEKS_PERNYATAAN_KIRIM. */
function TeksPernyataan() {
  const frasa = "periode yang dikirim akan terkunci otomatis";
  const i = TEKS_PERNYATAAN_KIRIM.indexOf(frasa);
  if (i < 0) return <span className="text-[11px] leading-relaxed text-ink-2">{TEKS_PERNYATAAN_KIRIM}</span>;
  return (
    <span className="text-[11px] leading-relaxed text-ink-2">
      {TEKS_PERNYATAAN_KIRIM.slice(0, i)}
      <strong className="font-bold text-gold-deep">{frasa}</strong>
      {TEKS_PERNYATAAN_KIRIM.slice(i + frasa.length)}
    </span>
  );
}

/**
 * Satu butir checklist.
 *
 * Penandanya BUKAN cuma warna - lolos memakai centang, belum memakai strip,
 * butir informasi yang perlu dilihat memakai tanda seru. Yang tidak bisa
 * membedakan hijau dari abu tetap bisa membaca barisnya.
 */
function Syarat({ nomor, butir }: { nomor: number; butir: ButirChecklist }) {
  const info = !butir.menahan;
  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-[11px] ${
        butir.lolos ? "border-green-tint bg-green-tint/50" : "border-line-2 bg-surface-2"
      }`}
    >
      <span className="min-w-0 text-muted">
        {nomor}. {butir.label}
        {info && <span className="ml-1 text-muted">(info)</span>}
      </span>
      <span
        className={`inline-flex shrink-0 items-center gap-1 font-mono font-bold ${
          butir.lolos ? "text-green" : "text-gold-deep"
        }`}
      >
        {butir.lolos ? (
          <IoMdCheckmark aria-hidden className="shrink-0" />
        ) : info ? (
          <RiErrorWarningLine aria-hidden className="shrink-0" />
        ) : null}
        {butir.nilai}
      </span>
    </li>
  );
}
