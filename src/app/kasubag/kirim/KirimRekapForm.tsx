"use client";

import { useActionState, useState } from "react";
import { IoMdCheckmark, IoMdRemove } from "react-icons/io";
import { RiErrorWarningLine } from "react-icons/ri";
import { kirimRekapUnitAction, type KirimFormState } from "./actions";
import { Modal } from "../../Modal";

const INITIAL_STATE: KirimFormState = {};

export function KirimRekapForm({
  periodeBulan,
  periodeTahun,
  satuanKerja,
  jumlahPegawai,
  jumlahKalkulasi,
  jumlahBasi,
  tabelKurang,
  tabelWajib,
  alasanTertahan,
  alasanKembali,
  terkunci,
}: {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  jumlahPegawai: number;
  jumlahKalkulasi: number;
  /** Kalkulasi yang sumbernya berubah/dihapus setelah angkanya dibekukan. */
  jumlahBasi: number;
  /** Tabel WAJIB yang belum dicentang, dan berapa jumlah wajibnya. */
  tabelKurang: number;
  tabelWajib: number;
  alasanTertahan: string | null;
  alasanKembali: string | null;
  terkunci: boolean;
}) {
  const [state, formAction, pending] = useActionState(kirimRekapUnitAction, INITIAL_STATE);
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
          Tidak ada data yang berubah - rekap unit ini masih bisa disunting seperti biasa.
        </p>
      </Modal>
    </>
  );

  if (terkunci) return popupHasil;

  return (
    // FLEX TEGAK supaya blok aksi bisa didorong ke DASAR kolom lewat `mt-auto`.
    //
    // Tanpa itu, kolom kanan berhenti di tengah dan menyisakan ruang kosong
    // besar - kolom kiri selalu lebih tinggi karena memuat empat baris tabel.
    // Yang hilang bukan cuma kerapian: tombol akhir ikut berpindah-pindah
    // tinggi mengikuti ada-tidaknya catatan pengembalian.
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-navy text-[11px] font-extrabold text-white">
            2
          </span>
          Kirim rekap ke PPABP
        </h3>
        <span className="shrink-0 text-xs text-muted">
          {jumlahKalkulasi} dari {jumlahPegawai} pegawai sudah terhitung
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">Kirim rekap setelah seluruh pemeriksaan selesai.</p>

      {/* Catatan PPABP di ATAS blok perhatian & tombol - dan tetap tampil
          walaupun pengirimannya sedang tertahan, karena justru itu yang
          menjelaskan kenapa unit ini harus mengerjakan sesuatu lagi. */}
      {alasanKembali && (
        // INFORMASI, bukan alarm. Dulu kotak merah penuh - dan berdampingan
        // dengan peringatan pengiriman, keduanya berebut jadi yang paling
        // mendesak. Ini sebenarnya keterangan: inilah yang harus diperbaiki.
        // Aksennya tetap merah supaya asalnya jelas, tapi bobotnya sejajar
        // dengan strip peringatan di bawahnya.
        <div className="mt-3 rounded-r-lg border-l-2 border-l-red bg-surface-2 px-3 py-2.5">
          <p className="text-xs font-bold text-red">Catatan pengembalian dari PPABP</p>
          <p className="mt-1 text-sm italic text-ink">&ldquo;{alasanKembali}&rdquo;</p>
          <p className="mt-1 text-xs text-muted">
            Pastikan sudah ditindaklanjuti sebelum mengirim ulang.
          </p>
        </div>
      )}

      {alasanTertahan ? (
        <>
          {/* TIGA SYARAT SEKALIGUS, dan ini bukan sekadar mengisi ruang.
              cekBolehKirim() `return` pada syarat PERTAMA yang gagal, jadi yang
              sampai ke layar cuma satu alasan - orang membereskannya, lalu
              menemukan alasan kedua yang sejak awal sudah ada. Didaftar utuh,
              seluruh jarak ke tombol Kirim terlihat sekali baca.

              Ini juga yang mengisi kolom kanan waktu belum ada yang dicentang:
              sebelumnya `mt-auto` cuma memindahkan ruang kosongnya dari bawah
              ke tengah. */}
          <div className="mt-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted">
              Syarat pengiriman
            </p>
            <ul className="mt-1.5 space-y-1">
              <Syarat
                label="Kalkulasi lengkap"
                nilai={`${jumlahKalkulasi} dari ${jumlahPegawai}`}
                lolos={jumlahKalkulasi >= jumlahPegawai && jumlahPegawai > 0}
              />
              <Syarat
                label="Tidak ada angka basi"
                nilai={jumlahBasi === 0 ? "tidak ada" : `${jumlahBasi} basi`}
                lolos={jumlahBasi === 0}
              />
              <Syarat
                label="Tabel wajib diperiksa"
                nilai={`${tabelWajib - tabelKurang} dari ${tabelWajib}`}
                lolos={tabelKurang === 0}
              />
            </ul>
          </div>

          {/* TERTAHAN - tombolnya TETAP DIRENDER, hanya dimatikan. Sebelumnya
              tombolnya tidak ada sama sekali, jadi tidak ada tanda di mana aksi
              akhirnya berada; yang membaca cuma menemukan peringatan lalu ruang
              kosong. Tombol mati menjawab dua hal sekaligus: di sini tempatnya,
              dan belum boleh sekarang.

              `alasanTertahan` DIPERTAHANKAN di samping daftar di atas, dan
              bukan pengulangan: daftar menyebut KEADAAN tiap syarat, kalimat
              ini menyebut APA YANG HARUS DIKERJAKAN sekarang ("Tekan Hitung
              sekarang dulu", "Centang setelah memeriksanya"). */}
          <div className="mt-auto pt-4">
            <p className="text-sm font-bold text-gold-deep">Belum siap dikirim</p>
            <p className="mt-1 text-xs text-ink-2">{alasanTertahan}</p>
            <button type="button" disabled className="btn btn-primary mt-3 w-full">
              Kirim rekap
            </button>
          </div>
        </>
      ) : (
        <>
          {/* PERINGATAN = STRIP, bukan kartu. Empat kotak bergaris di satu
              kolom membuat hierarkinya datar: catatan PPABP (informasi),
              peringatan (akibat), status (hasil), dan pernyataan (aksi)
              sama-sama menuntut perhatian, jadi tidak ada yang mendapatkannya.
              Yang membedakan sekarang BOBOTNYA - strip bergaris kiri, bukan
              kotak penuh.

              Butir "data pegawai yang belum terhitung tidak dapat disusulkan"
              DIBUANG, dan bukan karena panjang: cekBolehKirim() menahan
              pengiriman selama `jumlahKalkulasi < totalPegawai`, jadi di cabang
              ini jumlahnya SELALU sama. Butir itu tidak pernah bisa terbaca
              dalam keadaan yang membuatnya berlaku. */}
          <div className="mt-3 border-l-2 border-l-gold pl-3">
            <p className="flex items-center gap-1 text-xs font-bold text-gold-deep">
              <RiErrorWarningLine aria-hidden className="shrink-0" /> Pengiriman mengunci periode ini
            </p>
            <p className="mt-1 text-xs text-ink-2">
              Kalkulasi periode {periodeBulan}/{periodeTahun} difinalisasi dan langsung menjadi berkas ADK
              untuk Web Gaji - tidak ada pemeriksaan lanjutan setelah ini.
            </p>
            <p className="mt-1 text-xs text-muted">
              Pembatalan hanya lewat koreksi terbatas oleh PPABP, dan butuh waktu.
            </p>
          </div>

          {/* STATUS - sengaja setenang mungkin. Badge di kolom kiri sudah
              mengatakan hal yang sama; mengulangnya dengan bobot besar cuma
              menambah satu lagi yang berebut perhatian. */}
          <div className="mt-auto pt-4">
            <p className="flex items-center gap-1 text-xs font-bold text-green">
              <IoMdCheckmark aria-hidden className="shrink-0" /> Semua pemeriksaan selesai
            </p>
            <p className="mt-0.5 text-xs text-muted">Rekap siap dikirim ke PPABP.</p>
          </div>

          <form action={formAction} className="mt-3">
            <input type="hidden" name="bulan" value={periodeBulan} />
            <input type="hidden" name="tahun" value={periodeTahun} />

            {/* PERNYATAAN - satu-satunya blok berkotak yang tersisa di kolom
                ini, dan itu disengaja: inilah yang menahan pengiriman. Saat
                dicentang kotaknya berubah hijau, jadi keadaan "sudah
                menyatakan" terbaca dari bloknya - bukan cuma dari kotak
                centang kecil yang gampang terlewat. */}
            <label
              className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                setuju ? "border-green bg-green/10" : "border-line-2 bg-surface-2"
              }`}
            >
              <input
                type="checkbox"
                name="pernyataan"
                value="ya"
                checked={setuju}
                onChange={(e) => setSetuju(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-ink-2">
                Saya telah memeriksa presensi, predikat kinerja, dan hasil kalkulasi{" "}
                <strong>{jumlahKalkulasi} pegawai</strong>, serta menyatakan data sudah benar dan siap dikirim
                ke PPABP.
              </span>
            </label>

            <label className="mt-3 block text-xs font-semibold text-ink-2" htmlFor="catatan-kirim">
              Catatan untuk PPABP <span className="font-normal text-muted">(opsional)</span>
            </label>
            <textarea
              id="catatan-kirim"
              name="catatan"
              rows={2}
              className="field-input mt-1 w-full"
            />

            {/* Tombol ini TIDAK mengirim form - ia membuka dialog konfirmasi,
                dan tombol submit yang sebenarnya ada di dalam dialog itu.
                Dialognya dirender di dalam <form> ini, jadi `type="submit"` di
                sana mengirimnya tanpa sambungan tambahan. */}
            <button
              type="button"
              disabled={pending || !setuju}
              onClick={() => setKonfirmasiTerbuka(true)}
              className="btn btn-primary mt-3 w-full"
            >
              {pending ? "Mengirim..." : "Kirim & kunci"}
            </button>

            <Modal
              terbuka={konfirmasiTerbuka}
              nada="netral"
              judul={`Kirim rekap ${satuanKerja} ke PPABP?`}
              // Tidak bisa ditutup selagi permintaannya berjalan: menutup
              // dialog di tengah pengiriman membuat orang mengira kirimannya
              // batal, padahal servernya tetap memprosesnya.
              onTutup={pending ? null : () => setKonfirmasiTerbuka(false)}
              aksi={
                <>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setKonfirmasiTerbuka(false)}
                    className="btn btn-ghost btn-sm"
                  >
                    Batal
                  </button>
                  <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
                    {pending ? "Mengirim..." : "Ya, kirim & kunci"}
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
        </>
      )}

      {popupHasil}
    </div>
  );
}

/**
 * Satu baris syarat pengiriman.
 *
 * Penandanya BUKAN cuma warna - lolos memakai centang, belum memakai strip.
 * Yang tidak bisa membedakan hijau dari abu tetap bisa membaca barisnya, dan
 * itu syarat yang menentukan apakah rekap satu unit boleh dibayar.
 */
function Syarat({ label, nilai, lolos }: { label: string; nilai: string; lolos: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className={`flex min-w-0 items-center gap-1.5 ${lolos ? "text-ink-2" : "text-ink"}`}>
        {/* Keduanya IKON, bukan salah satu ikon dan satunya tanda hubung -
            campuran SVG dan glif teks dalam satu daftar tidak pernah sejajar
            karena keduanya dirata dengan acuan berbeda. */}
        {lolos ? (
          <IoMdCheckmark aria-hidden className="shrink-0 text-green" />
        ) : (
          <IoMdRemove aria-hidden className="shrink-0 text-muted" />
        )}
        {label}
      </span>
      <span className={`shrink-0 font-mono ${lolos ? "text-muted" : "font-bold text-gold-deep"}`}>
        {nilai}
      </span>
    </li>
  );
}
