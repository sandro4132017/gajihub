"use client";

import { useActionState, useState } from "react";
import { kirimRekapUnitAction, type KirimFormState } from "./actions";
import { Modal } from "../../Modal";

const INITIAL_STATE: KirimFormState = {};

/**
 * Panel "Kirim rekap ke PPABP" - pengganti tombol approval berjenjang.
 *
 * SATU keputusan untuk seluruh unit, bukan ratusan keputusan per pegawai.
 *
 * TIGA LAPIS PERINGATAN, DAN URUTANNYA DISENGAJA:
 *   1. Daftar akibat yang tertulis di halaman - dibaca sebelum apa pun.
 *   2. Kotak centang pernyataan - harus dicentang sadar, dan dicek lagi di
 *      server (lihat ./actions.ts) supaya bukan sekadar hiasan.
 *   3. Dialog konfirmasi berisi ANGKA nyata unit ini.
 *
 * Yang dihindari: dialog "Anda yakin?" tanpa isi. Kalimat itu sudah lama
 * berhenti dibaca orang, dan yang menekan "OK" secara refleks tidak lebih
 * yakin daripada sebelum ditanya. Karena itu tiap lapis menyebut AKIBAT yang
 * konkret, bukan meminta penegasan kosong.
 */
export function KirimRekapForm({
  periodeBulan,
  periodeTahun,
  satuanKerja,
  jumlahPegawai,
  jumlahKalkulasi,
  alasanTertahan,
  terkunci,
}: {
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  /** Pegawai AKTIF saja - lihat catatan di pemanggilnya. */
  jumlahPegawai: number;
  jumlahKalkulasi: number;
  /** Diisi kalau belum boleh dikirim - ditampilkan sebagai ganti tombolnya. */
  alasanTertahan: string | null;
  /**
   * Rekap periode ini sudah terkirim & terkunci.
   *
   * KOMPONEN INI TETAP DIRENDER SAAT TERKUNCI, dan itu bukan kelalaian.
   * Aksi kirim memanggil `revalidatePath`, jadi begitu pengiriman berhasil
   * halaman induknya langsung dirender ulang dalam keadaan terkunci. Kalau
   * komponennya ikut dilepas di situ, popup "berhasil dikirim" lenyap dalam
   * sekejap dan orang tidak pernah melihat hasil dari tombol yang baru saja
   * ditekannya. Yang disembunyikan formnya, bukan komponennya.
   */
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
    <section className="card mt-6 border-l-4 border-l-navy p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Kirim rekap ke PPABP</h2>
        <span className="text-xs text-muted">
          {jumlahKalkulasi} dari {jumlahPegawai} pegawai sudah terhitung
        </span>
      </div>

      {alasanTertahan ? (
        <p className="mt-3 rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep">
          {alasanTertahan}
        </p>
      ) : (
        <>
          {/* --- DISCLAIMER: akibat yang konkret, bukan "harap diperiksa" --- */}
          <div className="mt-3 rounded-lg border border-gold bg-gold-tint px-3.5 py-3">
            <p className="text-xs font-bold text-gold-deep">
              Perhatian - pengiriman tidak dapat dibatalkan secara mandiri
            </p>
            <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
              <li>
                <strong>Data final &amp; terkunci.</strong> Seluruh kalkulasi periode {periodeBulan}/
                {periodeTahun} akan langsung menjadi berkas ADK untuk Web Gaji. Tidak ada pemeriksaan lanjutan
                setelah ini.
              </li>
              <li>
                <strong>Dikirim sekaligus.</strong> {jumlahKalkulasi} pegawai terkirim utuh. Data pegawai yang
                belum terhitung tidak dapat disusulkan kemudian.
              </li>
              <li>
                <strong>Pembatalan terbatas.</strong> Jika terjadi kesalahan, hanya PPABP yang bisa membuka
                kembali kunci data, dan proses ini membutuhkan waktu.
              </li>
            </ul>
          </div>

          <form action={formAction} className="mt-3">
            <input type="hidden" name="bulan" value={periodeBulan} />
            <input type="hidden" name="tahun" value={periodeTahun} />

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-2 bg-surface-2 px-3 py-2.5">
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
              placeholder="Mis. 3 pegawai baru mutasi masuk bulan ini."
            />

            {/* Tombol ini TIDAK mengirim form - ia membuka dialog konfirmasi,
                dan tombol submit yang sebenarnya ada di dalam dialog itu.
                Dialognya dirender di dalam <form> ini, jadi `type="submit"` di
                sana mengirimnya tanpa sambungan tambahan. */}
            <button
              type="button"
              disabled={pending || !setuju}
              onClick={() => setKonfirmasiTerbuka(true)}
              className="btn btn-primary mt-3"
            >
              {pending ? "Mengirim..." : "Kirim & kunci"}
            </button>
            {!setuju && <span className="ml-2 text-xs text-muted">Centang pernyataan di atas dulu.</span>}

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
    </section>
  );
}
