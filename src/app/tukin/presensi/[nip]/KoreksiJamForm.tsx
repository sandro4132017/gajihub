"use client";

import { useActionState, useRef, useState } from "react";
import { Modal } from "../../../../components/feedback/Modal";
import { tglTampil } from "../../../../lib/format/tanggalTampil";
import {
  EKSTENSI_BUKTI_KOREKSI,
  PANJANG_MIN_ALASAN_KOREKSI,
  TEKS_PERNYATAAN_KOREKSI,
  butuhBukti,
} from "../../../../business-logic/koreksiPresensi";
import {
  koreksiJamPresensiAction,
  hapusKoreksiJamAction,
  type KoreksiJamFormState,
} from "./actionsKoreksi";

const AWAL: KoreksiJamFormState = {};

function AjakanTerapkan({ pesan, tanggalIso }: { pesan: string; tanggalIso: string }) {
  const tahun = tanggalIso.slice(0, 4);
  const bulan = Number(tanggalIso.slice(5, 7));
  return (
    <div className="mt-1.5 rounded-md border border-gold bg-gold-tint p-2">
      <p className="text-xs font-semibold text-ink">{pesan}</p>
      <a href={`/tukin/presensi?bulan=${bulan}&tahun=${tahun}`} className="btn btn-secondary btn-sm mt-1.5 text-xs">
        Terapkan koreksi &rarr;
      </a>
    </div>
  );
}

function BarisBukti({
  label,
  nama,
  wajib,
  adaLama,
  disentuh,
}: {
  label: string;
  nama: string | null;
  wajib: boolean;
  adaLama: boolean;
  disentuh: boolean;
}) {
  return (
    <p className="mt-2">
      {label}:{" "}
      {nama ? (
        <strong>{nama}</strong>
      ) : wajib ? (
        <strong className="text-red">belum dipilih - kembali dan unggah buktinya</strong>
      ) : (
        <span className="text-muted">
          {!disentuh ? "tidak diperlukan (jam tidak diubah)" : adaLama ? "memakai bukti yang sudah tersimpan" : "tidak ada"}
        </span>
      )}
    </p>
  );
}

export interface KoreksiTersimpan {
  id: string;
  jamMasuk: string | null;
  jamKeluar: string | null;
  /** null = pakai hitungan mesin. 0 SAH: "diperiksa, memang bukan lembur". */
  jamLembur: number | null;
  alasan: string;
  olehNama: string;
  /** Ada bukti absen masuk tersimpan. */
  buktiMasuk: boolean;
  /** Ada bukti absen pulang tersimpan. */
  buktiKeluar: boolean;
  /** Tautan ke berkas yang tersimpan (masuk/pulang/lembur) - hanya yang ada. */
  tautanBukti: { sisi: string; label: string; href: string }[];
}

interface Ringkasan {
  jamMasuk: string;
  jamKeluar: string;
  jamLembur: string;
  namaBuktiMasuk: string | null;
  namaBuktiKeluar: string | null;
}

const TERIMA_BUKTI = EKSTENSI_BUKTI_KOREKSI.join(",");

export function KoreksiJamForm({
  nip,
  tanggalIso,
  jamMasukAsli,
  jamKeluarAsli,
  potonganHariIniPersen,
  koreksi,
}: {
  nip: string;
  tanggalIso: string;
  jamMasukAsli: string;
  jamKeluarAsli: string;
  /** Tidak dipakai lagi sejak kolom lembur dicabut dari form (2026-11-11). */
  jamLemburMesin?: number;
  /**
   * Potongan hari ini SAAT INI, sebagai pecahan (0,0125 = 1,25%). Hanya
   * ditampilkan; angka sesudah koreksi sengaja TIDAK dihitung di sini.
   */
  potonganHariIniPersen: number | null;
  koreksi: KoreksiTersimpan | null;
}) {
  const [state, formAction, pending] = useActionState(koreksiJamPresensiAction, AWAL);
  const [hapusState, hapusAction, hapusPending] = useActionState(hapusKoreksiJamAction, AWAL);
  const formRef = useRef<HTMLFormElement>(null);
  const [buka, setBuka] = useState(false);
  const [bukaHapus, setBukaHapus] = useState(false);
  const [langkah, setLangkah] = useState<"isi" | "konfirmasi">("isi");
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [dicentang, setDicentang] = useState(false);
  // Hasil aksi yang sudah dilihat & ditutup tidak boleh muncul lagi saat dialog
  // dibuka ulang - state useActionState bertahan selama komponen hidup.
  const [stateDitutup, setStateDitutup] = useState<KoreksiJamFormState | null>(null);
  const [hapusStateDitutup, setHapusStateDitutup] = useState<KoreksiJamFormState | null>(null);
  const hasil = state === stateDitutup ? AWAL : state;
  const hasilHapus = hapusState === hapusStateDitutup ? AWAL : hapusState;

  function tutup() {
    setStateDitutup(state);
    setBuka(false);
    setLangkah("isi");
    setDicentang(false);
  }

  function keKonfirmasi() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    const namaDari = (v: FormDataEntryValue | null) => (v instanceof File && v.size > 0 ? v.name : null);
    setRingkasan({
      jamMasuk: String(data.get("jamMasuk") ?? "").trim(),
      jamKeluar: String(data.get("jamKeluar") ?? "").trim(),
      jamLembur: String(data.get("jamLembur") ?? "").trim(),
      namaBuktiMasuk: namaDari(data.get("buktiMasuk")),
      namaBuktiKeluar: namaDari(data.get("buktiKeluar")),
    });
    setDicentang(false);
    setLangkah("konfirmasi");
  }

  // Bukti wajib per sisi, aturan yang sama dengan server (butuhBukti).
  const wajib = ringkasan
    ? butuhBukti(
        { jamMasuk: ringkasan.jamMasuk || null, jamKeluar: ringkasan.jamKeluar || null },
        koreksi
          ? {
              jamMasuk: koreksi.jamMasuk,
              jamKeluar: koreksi.jamKeluar,
              buktiRef: koreksi.buktiMasuk ? "ada" : null,
              buktiRefKeluar: koreksi.buktiKeluar ? "ada" : null,
            }
          : null
      )
    : { masuk: false, keluar: false };
  const buktiKurang =
    (wajib.masuk && !ringkasan?.namaBuktiMasuk) || (wajib.keluar && !ringkasan?.namaBuktiKeluar);

  const sukses = !!hasil.sukses;

  return (
    <div>
      {/* Di dalam sel cukup penanda sebaris. Rinciannya - jam, alasan, siapa
          yang mengoreksi, buktinya - ada di dialog, sekali klik. */}
      {koreksi && (
        <div className="mb-1 text-[11px]">
          <span
            className="chip chip-navy"
            title={`Masuk ${koreksi.jamMasuk ?? "tetap"}, pulang ${koreksi.jamKeluar ?? "tetap"}, lembur ${
              koreksi.jamLembur === null ? "tetap" : `${koreksi.jamLembur} jam`
            } - ${koreksi.alasan} (oleh ${koreksi.olehNama})`}
          >
            Dikoreksi
          </span>
          <p className="mt-0.5 text-ink-2">oleh {koreksi.olehNama}</p>
          {koreksi.tautanBukti.length > 0 ? (
            koreksi.tautanBukti.map((t) => (
              <a key={t.sisi} href={t.href} target="_blank" rel="noopener noreferrer" className="link block">
                {t.label}
              </a>
            ))
          ) : (
            <span className="text-muted">tanpa bukti</span>
          )}
        </div>
      )}

      <button type="button" onClick={() => setBuka(true)} className="link text-xs">
        {koreksi ? "Ubah koreksi" : "Koreksi jam"}
      </button>

      {/* Modal dirender di dalam <form> supaya tombol submit-nya (di kaki
          dialog) mengirim form ini - lihat catatan "tanpa portal" di Modal. */}
      {/* text-left & font-sans: modal tanpa portal mewarisi perataan tengah
          dan font dari sel tabel tempat tombolnya berada. */}
      <form ref={formRef} action={formAction} autoComplete="off" className="text-left font-sans">
        <Modal
          terbuka={buka}
          judul="Koreksi jam presensi"
          subjudul={tglTampil(tanggalIso)}
          onTutup={pending ? null : tutup}
          aksi={
            sukses ? (
              <button type="button" onClick={tutup} className="btn btn-ghost text-sm">
                Tutup
              </button>
            ) : langkah === "isi" ? (
              <>
                <button type="button" onClick={tutup} className="btn btn-ghost text-sm">
                  Batal
                </button>
                <button type="button" onClick={keKonfirmasi} className="btn btn-primary text-sm">
                  Lanjut
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setLangkah("isi")}
                  disabled={pending}
                  className="btn btn-ghost text-sm"
                >
                  Kembali
                </button>
                <button
                  type="submit"
                  disabled={pending || !dicentang || buktiKurang}
                  className="btn btn-primary text-sm"
                >
                  {pending ? "Menyimpan..." : "Simpan koreksi"}
                </button>
              </>
            )
          }
        >
          <input type="hidden" name="nip" value={nip} />
          <input type="hidden" name="tanggal" value={tanggalIso} />

          {sukses ? (
            <AjakanTerapkan pesan={hasil.sukses as string} tanggalIso={tanggalIso} />
          ) : (
            <>
              {/* LANGKAH 1 - isian. Tetap di DOM saat langkah 2 (hidden)
                  supaya nilainya ikut terkirim. */}
              <div hidden={langkah !== "isi"}>
                {koreksi && (
                  <div className="mb-3 rounded-lg border border-teal-deep/30 bg-teal-tint px-3 py-2 text-xs text-ink-2">
                    <p className="font-semibold text-ink">
                      Koreksi tersimpan: masuk <span className="font-mono">{koreksi.jamMasuk ?? "tetap"}</span>, pulang{" "}
                      <span className="font-mono">{koreksi.jamKeluar ?? "tetap"}</span>
                    </p>
                    <p className="mt-0.5">{koreksi.alasan}</p>
                    <p className="mt-0.5 text-muted">oleh {koreksi.olehNama}</p>
                    <button type="button" onClick={() => setBukaHapus(true)} className="link mt-1.5 text-xs">
                      Hapus koreksi
                    </button>
                  </div>
                )}

                <p className="text-xs text-muted">
                  e-Presensi mencatat masuk <strong className="font-mono">{jamMasukAsli}</strong>, pulang{" "}
                  <strong className="font-mono">{jamKeluarAsli}</strong>. Kosongkan kolom yang tidak perlu diubah.
                </p>
                <div className="mt-2 flex gap-2">
                  <div className="flex-1">
                    <label className="block">
                      <span className="field-label">Jam masuk</span>
                      <input
                        type="time"
                        name="jamMasuk"
                        defaultValue={koreksi?.jamMasuk ?? ""}
                        className="field-input w-full font-mono text-sm"
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="field-label">Bukti absen masuk</span>
                      <input type="file" name="buktiMasuk" accept={TERIMA_BUKTI} className="field-input w-full text-sm" />
                      <span className="mt-1 block text-[11px] text-muted">
                        Wajib bila jam masuk diubah; JPG, PNG, atau PDF, maksimal 2 MB.
                        {koreksi?.buktiMasuk && " Sudah ada bukti tersimpan; kosongkan kalau jam masuk tidak berubah."}
                      </span>
                    </label>
                  </div>
                  <div className="flex-1">
                    <label className="block">
                      <span className="field-label">Jam pulang</span>
                      <input
                        type="time"
                        name="jamKeluar"
                        defaultValue={koreksi?.jamKeluar ?? ""}
                        className="field-input w-full font-mono text-sm"
                      />
                    </label>
                    <label className="mt-2 block">
                      <span className="field-label">Bukti absen pulang</span>
                      <input type="file" name="buktiKeluar" accept={TERIMA_BUKTI} className="field-input w-full text-sm" />
                      <span className="mt-1 block text-[11px] text-muted">
                        Wajib bila jam pulang diubah; JPG, PNG, atau PDF, maksimal 2 MB.
                        {koreksi?.buktiKeluar && " Sudah ada bukti tersimpan; kosongkan kalau jam pulang tidak berubah."}
                      </span>
                    </label>
                  </div>
                </div>
                {/* Jam lembur SENGAJA tidak ada di form ini (keputusan user
                    2026-11-11): lembur mengikuti hitungan mesin. Koreksi lembur
                    yang sudah tersimpan tidak disentuh - lihat actionsKoreksi.ts. */}
                <label className="mt-2 block">
                  <span className="field-label">Dasar koreksi (wajib, minimal {PANJANG_MIN_ALASAN_KOREKSI} karakter)</span>
                  <input
                    type="text"
                    name="alasan"
                    required
                    minLength={PANJANG_MIN_ALASAN_KOREKSI}
                    autoComplete="off"
                    defaultValue={koreksi?.alasan ?? ""}
                    placeholder="Foto timestamp"
                    className="field-input w-full text-sm"
                  />
                </label>
              </div>

              {/* LANGKAH 2 - konfirmasi. */}
              {langkah === "konfirmasi" && ringkasan && (
                <div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-line text-muted">
                        <th className="py-1.5 pr-2 font-semibold">&nbsp;</th>
                        <th className="py-1.5 pr-2 font-semibold">e-Presensi</th>
                        <th className="py-1.5 font-semibold">Pengganti</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <tr className="border-b border-line-2">
                        <th className="py-1.5 pr-2 font-sans font-semibold text-ink">Masuk</th>
                        <td className="py-1.5 pr-2">{jamMasukAsli}</td>
                        <td className="py-1.5 font-semibold text-ink">{ringkasan.jamMasuk || "tetap"}</td>
                      </tr>
                      <tr className="border-b border-line-2">
                        <th className="py-1.5 pr-2 font-sans font-semibold text-ink">Pulang</th>
                        <td className="py-1.5 pr-2">{jamKeluarAsli}</td>
                        <td className="py-1.5 font-semibold text-ink">{ringkasan.jamKeluar || "tetap"}</td>
                      </tr>
                    </tbody>
                  </table>

                  <BarisBukti
                    label="Bukti absen masuk"
                    nama={ringkasan.namaBuktiMasuk}
                    wajib={wajib.masuk}
                    adaLama={!!koreksi?.buktiMasuk}
                    disentuh={!!ringkasan.jamMasuk}
                  />
                  <BarisBukti
                    label="Bukti absen pulang"
                    nama={ringkasan.namaBuktiKeluar}
                    wajib={wajib.keluar}
                    adaLama={!!koreksi?.buktiKeluar}
                    disentuh={!!ringkasan.jamKeluar}
                  />
                  <p className="mt-1">
                    Potongan hari ini saat ini:{" "}
                    <strong className="font-mono">
                      {potonganHariIniPersen === null
                        ? "-"
                        : `${(potonganHariIniPersen * 100).toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`}
                    </strong>
                    . Potongan lupa absen/terlambat hari ini akan dihitung ulang dari jam pengganti saat presensi
                    ditarik ulang.
                  </p>

                  <label className="mt-3 flex items-start gap-2 text-ink">
                    <input
                      type="checkbox"
                      name="pernyataan"
                      value="1"
                      checked={dicentang}
                      onChange={(e) => setDicentang(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span className="font-semibold">{TEKS_PERNYATAAN_KOREKSI}</span>
                  </label>
                </div>
              )}

              {hasil.error && <p className="mt-2 text-xs font-medium text-red">{hasil.error}</p>}
            </>
          )}
        </Modal>
      </form>

      {/* Hapus lewat konfirmasi - formnya terpisah dari form koreksi. */}
      {koreksi && (
        <form action={hapusAction}>
          <input type="hidden" name="id" value={koreksi.id} />
          <Modal
            terbuka={bukaHapus}
            judul="Hapus koreksi jam presensi?"
            subjudul={tglTampil(tanggalIso)}
            nada={hasilHapus.sukses ? "sukses" : "bahaya"}
            onTutup={
              hapusPending
                ? null
                : () => {
                    setHapusStateDitutup(hapusState);
                    setBukaHapus(false);
                  }
            }
            aksi={
              hasilHapus.sukses ? (
                <button
                  type="button"
                  onClick={() => {
                    setHapusStateDitutup(hapusState);
                    setBukaHapus(false);
                  }}
                  className="btn btn-ghost text-sm"
                >
                  Tutup
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setBukaHapus(false)}
                    disabled={hapusPending}
                    className="btn btn-ghost text-sm"
                  >
                    Batal
                  </button>
                  <button type="submit" disabled={hapusPending} className="btn btn-danger text-sm">
                    {hapusPending ? "Menghapus..." : "Ya, hapus koreksi"}
                  </button>
                </>
              )
            }
          >
            {hasilHapus.sukses ? (
              <AjakanTerapkan pesan={hasilHapus.sukses} tanggalIso={tanggalIso} />
            ) : (
              <>
                <p>
                  Jam e-Presensi berlaku lagi untuk tanggal ini setelah presensi ditarik ulang. Berkas bukti tetap
                  tersimpan dan penghapusan ini dicatat di jejak audit.
                </p>
                {hasilHapus.error && <p className="mt-2 font-medium text-red">{hasilHapus.error}</p>}
              </>
            )}
          </Modal>
        </form>
      )}
    </div>
  );
}
