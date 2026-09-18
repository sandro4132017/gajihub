"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { tglTampil } from "../../../tanggalTampil";
import {
  koreksiJamPresensiAction,
  hapusKoreksiJamAction,
  type KoreksiJamFormState,
} from "./actionsKoreksi";

const AWAL: KoreksiJamFormState = {};

/**
 * Ajakan menerapkan koreksi - muncul tepat sesudah koreksi tersimpan/dihapus.
 *
 * KENAPA PERLU ADA. Koreksi cuma menulis baris pengganti; angkanya baru ikut
 * berubah waktu presensi ditarik ulang. Dulu satu-satunya yang memberi tahu
 * hal itu adalah kalimat di pesan sukses - dan kalimat itu lenyap begitu
 * halaman berpindah. Kalau terlewat, gejalanya DIAM: angkanya tetap salah,
 * tidak ada peringatan, dan rekapnya terkirim ke PPABP apa adanya.
 *
 * Tautan biasa, bukan tombol ber-JavaScript: tujuannya memang halaman lain,
 * dan di sana tombolnya sudah berganti nama jadi "Terapkan Koreksi Presensi"
 * supaya orang tahu dia sedang meneruskan pekerjaan yang sama - bukan
 * mengulang langkah yang tadi.
 */
function AjakanTerapkan({ pesan, tanggalIso }: { pesan: string; tanggalIso: string }) {
  const tahun = tanggalIso.slice(0, 4);
  const bulan = Number(tanggalIso.slice(5, 7));
  return (
    <div className="mt-1.5 rounded-md border border-gold bg-gold-tint p-2">
      <p className="text-xs font-semibold text-ink">{pesan}</p>
      <a
        href={`/tukin/presensi?bulan=${bulan}&tahun=${tahun}`}
        className="btn btn-secondary btn-sm mt-1.5 text-xs"
      >
        Terapkan koreksi &rarr;
      </a>
    </div>
  );
}

export interface KoreksiTersimpan {
  id: string;
  jamMasuk: string | null;
  jamKeluar: string | null;
  alasan: string;
  olehNama: string;
}

/**
 * Form koreksi jam untuk SATU hari - dibuka sebagai DIALOG, bukan dilipat di
 * dalam sel tabel.
 *
 * KENAPA DIALOG. Waktu formnya tumbuh di dalam sel, satu baris tabel
 * mendadak setinggi ~500px dan seluruh baris lain terdorong jauh ke bawah -
 * tabel yang gunanya justru membandingkan hari per hari jadi tidak bisa
 * dibaca selama form terbuka.
 *
 * `<dialog>` BAWAAN HTML + `showModal()`, bukan div melayang buatan sendiri.
 * Yang didapat gratis: Escape menutup, fokus terkurung di dalamnya, dan latar
 * belakang teredam - tiga hal yang kalau dibuat manual hampir selalu ada yang
 * terlewat.
 *
 * SATU HAL YANG MENENTUKAN, dan ini bukan sekadar kerapian: tabelnya
 * dibungkus `overflow-x-auto`. Panel melayang biasa akan TERPOTONG oleh
 * pembungkus itu. `showModal()` menaikkan dialognya ke *top layer* browser,
 * di luar seluruh konteks tumpukan dan pemotongan induknya - jadi masalah itu
 * tidak pernah muncul.
 *
 * Sel tabelnya sendiri cukup memuat penanda ringkas + satu tautan pembuka:
 * koreksi jam adalah pengecualian, bukan cara kerja sehari-hari.
 */
export function KoreksiJamForm({
  nip,
  tanggalIso,
  jamMasukAsli,
  jamKeluarAsli,
  koreksi,
}: {
  nip: string;
  tanggalIso: string;
  jamMasukAsli: string;
  jamKeluarAsli: string;
  koreksi: KoreksiTersimpan | null;
}) {
  const [state, formAction, pending] = useActionState(koreksiJamPresensiAction, AWAL);
  const [hapusState, hapusAction, hapusPending] = useActionState(hapusKoreksiJamAction, AWAL);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [buka, setBuka] = useState(false);

  /**
   * MENGUNCI GULUNG HALAMAN selama panel terbuka.
   *
   * Panelnya dipaku di tengah-kanan layar (`fixed`), jadi ia sendiri memang
   * tidak ikut bergerak. Yang bergerak isi halaman di belakangnya - dan itu
   * yang bikin terasa berpindah: baris tabel yang sedang dikoreksi menggeser
   * pergi sementara panelnya diam, lalu orang kehilangan hari mana yang
   * sebenarnya sedang dia ubah.
   *
   * Nilai `overflow` yang lama disimpan lalu dikembalikan, bukan dihapus -
   * kalau suatu saat ada yang menyetel `overflow` pada <body>, menghapusnya
   * berarti diam-diam mencabut setelan orang lain.
   */
  useEffect(() => {
    if (!buka) return;
    const sebelumnya = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = sebelumnya;
    };
  }, [buka]);

  return (
    <div>
      {/* Di dalam sel cukup penanda sebaris. Rinciannya - jam, alasan, siapa
          yang mengoreksi - ada di dialognya, sekali klik. */}
      {koreksi && (
        <span
          className="mb-1 block text-[11px] font-semibold text-teal-deep"
          title={`Masuk ${koreksi.jamMasuk ?? "tetap"}, pulang ${koreksi.jamKeluar ?? "tetap"} - ${koreksi.alasan} (oleh ${koreksi.olehNama})`}
        >
          Dikoreksi manual
        </span>
      )}

      <button
        type="button"
        onClick={() => {
          dialogRef.current?.showModal();
          setBuka(true);
        }}
        className="link text-xs"
      >
        {koreksi ? "Ubah koreksi" : "Koreksi jam"}
      </button>

      <dialog
        ref={dialogRef}
        // Escape menutup dialog TANPA lewat tombol mana pun, jadi status buka
        // dibaca dari sini - kalau tidak, kunci gulung halaman ikut tertinggal
        // menyala dan halamannya mati tidak bisa digulung sama sekali.
        onClose={() => setBuka(false)}
        // DIPAKU DI TENGAH-KANAN LAYAR, dan sengaja TIDAK dihitung dari
        // posisi tombolnya (permintaan user 2026-09-14). Penempatan yang ikut
        // tombol berarti panelnya muncul di tempat berbeda tiap baris - mata
        // harus mencarinya lagi tiap kali, dan itu justru yang terasa
        // berantakan.
        //
        // DUA KELAS YANG KELIHATANNYA MUBAZIR TAPI MENENTUKAN, keduanya
        // melawan stylesheet bawaan browser untuk <dialog>:
        //   dialog { position: absolute; left: 0; right: 0; margin: auto }
        //
        // `m-0` - preflight Tailwind sudah menyetel `margin: 0` ke semua
        // elemen, jadi `margin: auto` di atas hilang dan pemusatannya mati.
        //   left-auto - INI yang bikin panelnya tetap nempel di kiri walau
        // sudah diberi `right-4`. `left: 0` bawaan itu tidak ikut hilang, dan
        // kotak ber-lebar-tetap yang punya left DAN right sekaligus itu
        // over-constrained: di arah baca kiri-ke-kanan, `right` yang dibuang.
        // Baru setelah `left: auto`, `right` benar-benar dipakai.
        //
        // p-0 di dialognya, padding dipindah ke isi: <dialog> punya padding
        // bawaan browser yang tidak seragam antar mesin.
        //
        // max-h + overflow DIPERTAHANKAN sebagai jaring pengaman: di layar
        // pendek panelnya bisa lebih tinggi dari jendela, dan isi yang
        // terpotong tanpa jalan keluar lebih buruk daripada gulungan pendek
        // di dalam panel. Pada layar normal keduanya tidak pernah aktif.
        className="fixed top-1/2 right-4 left-auto m-0 max-h-[85vh] w-[min(30rem,92vw)] -translate-y-1/2 overflow-y-auto rounded-2xl border border-line bg-surface p-0 text-left shadow-[0_12px_40px_rgba(19,65,107,0.18)] backdrop:bg-navy/40"
      >
        <div className="p-5">
          <div className="flex items-start justify-between gap-3 border-b border-line-2 pb-3">
            <div>
              <h2 className="text-sm font-bold text-ink">Koreksi jam presensi</h2>
              <p className="text-xs text-muted">{tglTampil(tanggalIso)}</p>
            </div>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              aria-label="Tutup"
              className="rounded-lg px-2 py-1 text-lg leading-none text-muted transition hover:bg-surface-2 hover:text-ink"
            >
              &times;
            </button>
          </div>

          {koreksi && (
            <div className="mt-3 rounded-lg border border-teal-deep/30 bg-teal-tint px-3 py-2 text-xs text-ink-2">
              <p className="font-semibold text-ink">
                Koreksi tersimpan: masuk {koreksi.jamMasuk ?? "tetap"}, pulang {koreksi.jamKeluar ?? "tetap"}
              </p>
              <p className="mt-0.5">{koreksi.alasan}</p>
              <p className="mt-0.5 text-muted">oleh {koreksi.olehNama}</p>
              <form action={hapusAction} className="mt-1.5">
                <input type="hidden" name="id" value={koreksi.id} />
                <button type="submit" disabled={hapusPending} className="link text-xs">
                  {hapusPending ? "Menghapus..." : "Hapus koreksi"}
                </button>
              </form>
              {hapusState.error && <p className="mt-1 font-medium text-red">{hapusState.error}</p>}
              {hapusState.sukses && <AjakanTerapkan pesan={hapusState.sukses} tanggalIso={tanggalIso} />}
            </div>
          )}

          <form action={formAction} className="mt-3">
            <input type="hidden" name="nip" value={nip} />
            <input type="hidden" name="tanggal" value={tanggalIso} />
            <p className="text-xs text-muted">
              e-Presensi mencatat masuk <strong>{jamMasukAsli}</strong>, pulang <strong>{jamKeluarAsli}</strong>.
              Kosongkan kolom yang tidak perlu diubah.
            </p>
            <div className="mt-2 flex gap-2">
              <label className="flex-1">
                <span className="field-label">Jam masuk</span>
                <input
                  type="time"
                  name="jamMasuk"
                  defaultValue={koreksi?.jamMasuk ?? ""}
                  className="field-input w-full text-sm"
                />
              </label>
              <label className="flex-1">
                <span className="field-label">Jam pulang</span>
                <input
                  type="time"
                  name="jamKeluar"
                  defaultValue={koreksi?.jamKeluar ?? ""}
                  className="field-input w-full text-sm"
                />
              </label>
            </div>
            <label className="mt-2 block">
              <span className="field-label">Dasar koreksi (wajib)</span>
              <input
                type="text"
                name="alasan"
                required
                minLength={10}
                defaultValue={koreksi?.alasan ?? ""}
                placeholder="Link Google Drive"
                className="field-input w-full text-sm"
              />
            </label>
            <div className="mt-3 flex gap-2">
              <button type="submit" disabled={pending} className="btn btn-primary text-sm">
                {pending ? "Menyimpan..." : "Simpan"}
              </button>
              {/* type="button", BUKAN formmethod="dialog": tombol submit apa pun
                  di dalam form ini ikut mengirimkannya. */}
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="btn btn-ghost text-sm"
              >
                Batal
              </button>
            </div>
            {state.error && <p className="mt-2 text-xs font-medium text-red">{state.error}</p>}
            {/* Dialognya SENGAJA tidak menutup sendiri sesudah tersimpan -
                ajakan "Terapkan koreksi" muncul di sini, dan menutup paksa
                berarti membuangnya sebelum sempat dibaca. */}
            {state.sukses && <AjakanTerapkan pesan={state.sukses} tanggalIso={tanggalIso} />}
          </form>
        </div>
      </dialog>
    </div>
  );
}
