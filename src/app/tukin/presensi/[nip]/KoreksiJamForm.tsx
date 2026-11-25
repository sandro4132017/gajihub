"use client";

import Link from "next/link";

import { useActionState, useEffect, useRef, useState } from "react";
import { RiCloseLine, RiImageLine, RiInformationLine, RiTimeLine, RiUserLine } from "react-icons/ri";
import { TombolBukti } from "../../../../components/shared/PenampilBukti";
import type { TautanBukti } from "../../../../components/shared/TautanBuktiKoreksi";
import { EVENT_BUKA_KOREKSI } from "./SelJamKoreksi";
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
      <Link href={`/tukin/presensi?bulan=${bulan}&tahun=${tahun}`} className="btn btn-secondary btn-sm mt-1.5 text-xs">
        Terapkan koreksi &rarr;
      </Link>
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
  tautanBukti: TautanBukti[];
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
  tanggalLabel,
  namaPegawai,
  statusLabel,
  jamMasukAsli,
  jamKeluarAsli,
  potonganHariIniPersen,
  koreksi,
}: {
  nip: string;
  tanggalIso: string;
  /** Mis. "05/10 Senin" - kepala dialog. */
  tanggalLabel: string;
  namaPegawai: string;
  /** Status kehadiran hari itu, mis. "WFO". */
  statusLabel: string;
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
  // Tombol "Ubah koreksi" di kotak keterangan jam (SelJamKoreksi) membuka
  // form tanggal yang sama lewat event, tanpa mengangkat state ke halaman.
  useEffect(() => {
    const onBuka = (e: Event) => {
      if ((e as CustomEvent<string>).detail === tanggalIso) setBuka(true);
    };
    window.addEventListener(EVENT_BUKA_KOREKSI, onBuka);
    return () => window.removeEventListener(EVENT_BUKA_KOREKSI, onBuka);
  }, [tanggalIso]);
  const [bukaHapus, setBukaHapus] = useState(false);
  const [langkah, setLangkah] = useState<"isi" | "konfirmasi">("isi");
  const [ringkasan, setRingkasan] = useState<Ringkasan | null>(null);
  const [dicentang, setDicentang] = useState(false);
  // Dasar koreksi diisi di langkah konfirmasi (tampilan isian dibuat bersih,
  // desain user 2026-11-16). Disimpan di state supaya tidak hilang saat
  // bolak-balik langkah.
  const [alasan, setAlasan] = useState(koreksi?.alasan ?? "");
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

  // Escape menutup dialog (kecuali selagi menyimpan); latar tidak bergulir.
  useEffect(() => {
    if (!buka) return;
    const onTombol = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) tutup();
    };
    document.addEventListener("keydown", onTombol);
    const gulungAsli = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onTombol);
      document.body.style.overflow = gulungAsli;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buka, pending]);

  const buktiMasukTersimpan = koreksi?.tautanBukti.find((t) => t.sisi === "masuk") ?? null;
  const buktiPulangTersimpan = koreksi?.tautanBukti.find((t) => t.sisi === "keluar") ?? null;

  return (
    <div>
      {/* Di sel cukup satu pembuka: chip "Dikoreksi" bila sudah dikoreksi,
          tautan "Koreksi jam" bila belum. Rincian (jam awal/koreksi,
          pengoreksi, bukti) ada di kotak keterangan saat jamnya disorot dan
          di dialog ini. */}
      {koreksi ? (
        <button
          type="button"
          onClick={() => setBuka(true)}
          title={`Dikoreksi oleh ${koreksi.olehNama} - klik untuk mengubah`}
          className="inline-flex items-center gap-1 rounded-full border border-biru/30 bg-biru/5 px-2.5 py-0.5 text-xs font-semibold text-navy hover:border-biru/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biru"
        >
          Dikoreksi
          <RiInformationLine aria-hidden="true" className="size-3.5" />
        </button>
      ) : (
        <button type="button" onClick={() => setBuka(true)} className="link text-xs">
          Koreksi jam
        </button>
      )}

      {/* Dialog dirender DI DALAM <form> (tanpa portal) supaya tombol submit
          di kakinya mengirim form ini. text-left & font-sans: tanpa portal,
          dialog mewarisi perataan tengah & font dari sel tabel. Tampilan
          mengikuti desain user 2026-11-16. */}
      <form ref={formRef} action={formAction} autoComplete="off" className="text-left font-sans">
        {buka && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-navy-deep/50 p-4 backdrop-blur-[2px]"
            onClick={(e) => {
              if (e.target === e.currentTarget && !pending) tutup();
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`${koreksi ? "Rincian koreksi" : "Koreksi"} jam kehadiran ${namaPegawai} - ${tanggalLabel}`}
              className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-5"
              style={{ animation: "gj-masuk 180ms ease-out both" }}
            >
              <input type="hidden" name="nip" value={nip} />
              <input type="hidden" name="tanggal" value={tanggalIso} />

              {/* Kepala */}
              <div className="flex items-start justify-between gap-3 border-b border-line-2 pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        koreksi ? "bg-biru/10 text-biru-deep" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {koreksi ? "Sudah dikoreksi" : "Belum dikoreksi"}
                    </span>
                    <span className="text-sm font-semibold text-muted">{tanggalLabel}</span>
                  </div>
                  <h2 className="mt-2 text-lg font-extrabold text-ink">
                    {koreksi ? "Rincian Koreksi Jam Kehadiran" : "Koreksi Jam Kehadiran"}
                  </h2>
                  <p className="text-xs text-muted">
                    {namaPegawai} &middot; Status: <strong className="font-bold text-ink-2">{statusLabel}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={tutup}
                  disabled={pending}
                  aria-label="Tutup"
                  className="rounded-lg p-1 text-muted hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biru"
                >
                  <RiCloseLine aria-hidden="true" className="size-5" />
                </button>
              </div>

              {sukses ? (
                <div className="mt-4">
                  <AjakanTerapkan pesan={hasil.sukses as string} tanggalIso={tanggalIso} />
                  <div className="mt-4 flex justify-end">
                    <button type="button" onClick={tutup} className="btn btn-ghost text-sm">
                      Tutup
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* LANGKAH 1 - isian. Tetap di DOM saat langkah 2 (hidden)
                      supaya nilainya, termasuk berkas, ikut terkirim. */}
                  <div hidden={langkah !== "isi"}>
                    {koreksi && (
                      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3.5">
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-muted">Dikoreksi oleh</span>
                          <span className="inline-flex items-center gap-1.5 font-semibold text-ink">
                            <RiUserLine aria-hidden="true" className="size-4 text-muted" />
                            {koreksi.olehNama}
                          </span>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          {[
                            { t: buktiMasukTersimpan, label: "Bukti masuk" },
                            { t: buktiPulangTersimpan, label: "Bukti pulang" },
                          ].map(({ t, label }) =>
                            t ? (
                              <TombolBukti
                                key={label}
                                label={label}
                                judul={`${label} - ${tanggalLabel}`}
                                href={t.href}
                                jenis={t.jenis}
                                ikon={<RiImageLine aria-hidden="true" className="size-4" />}
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold text-navy hover:border-biru/50"
                              />
                            ) : (
                              <span
                                key={label}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-line px-3 py-2 text-xs text-muted"
                              >
                                <RiImageLine aria-hidden="true" className="size-4" />
                                {label}: tidak ada
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-muted">
                      {koreksi ? "Ubah koreksi jam kehadiran" : "Isi koreksi jam kehadiran"}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3">
                      {(
                        [
                          {
                            nama: "jamMasuk",
                            label: "Jam Masuk",
                            asli: jamMasukAsli,
                            nilai: koreksi?.jamMasuk,
                            namaBukti: "buktiMasuk",
                            labelBukti: "Unggah Bukti Masuk",
                            adaBukti: koreksi?.buktiMasuk,
                          },
                          {
                            nama: "jamKeluar",
                            label: "Jam Pulang",
                            asli: jamKeluarAsli,
                            nilai: koreksi?.jamKeluar,
                            namaBukti: "buktiKeluar",
                            labelBukti: "Unggah Bukti Pulang",
                            adaBukti: koreksi?.buktiKeluar,
                          },
                        ]
                      ).map((k) => (
                        <div key={k.nama}>
                          <label className="block">
                            <span className="text-xs font-semibold text-ink-2">
                              {k.label} <span className="font-normal text-muted">(Asli: {k.asli})</span>
                            </span>
                            {/* Teks HH:MM, bukan type="time": input waktu bawaan browser
                                ikut locale OS dan bisa tampil "07:30 AM". Server menerima
                                format yang sama (HH:MM, 24 jam). */}
                            <span className="relative mt-1 block">
                              <input
                                type="text"
                                name={k.nama}
                                inputMode="numeric"
                                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                                title="Format 24 jam, contoh 07:30 atau 16:00"
                                placeholder="--:--"
                                maxLength={5}
                                defaultValue={k.nilai ?? ""}
                                className="field-input w-full pr-10 font-mono text-sm"
                              />
                              <RiTimeLine
                                aria-hidden="true"
                                className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-muted"
                              />
                            </span>
                          </label>
                          <label className="mt-3 block">
                            <span className="text-xs font-semibold text-ink-2">{k.labelBukti}</span>
                            <input
                              type="file"
                              name={k.namaBukti}
                              accept={TERIMA_BUKTI}
                              title="Wajib bila jam diubah; JPG/PNG/PDF, maks 2 MB"
                              className="mt-1 block w-full text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-ink-2 hover:file:bg-line-2"
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                    {/* Jam lembur SENGAJA tidak ada di form ini (keputusan user
                        2026-11-11): lembur mengikuti hitungan mesin. Koreksi lembur
                        yang sudah tersimpan tidak disentuh - lihat actionsKoreksi.ts. */}
                  </div>

                  {/* LANGKAH 2 - konfirmasi. */}
                  {langkah === "konfirmasi" && ringkasan && (
                    <div className="mt-4 text-xs text-ink-2">
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

                      <label className="mt-3 block">
                        <span className="text-xs font-semibold text-ink-2">
                          Dasar koreksi (wajib, minimal {PANJANG_MIN_ALASAN_KOREKSI} karakter)
                        </span>
                        <input
                          type="text"
                          name="alasan"
                          required
                          minLength={PANJANG_MIN_ALASAN_KOREKSI}
                          autoComplete="off"
                          value={alasan}
                          onChange={(e) => setAlasan(e.target.value)}
                          placeholder="Foto timestamp"
                          className="field-input mt-1 w-full text-sm"
                        />
                      </label>

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

                  {/* Kaki */}
                  <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-line-2 pt-4">
                    {langkah === "isi" ? (
                      <>
                        {koreksi && (
                          <button
                            type="button"
                            onClick={() => setBukaHapus(true)}
                            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold text-red hover:border-red/40 hover:bg-red-tint"
                          >
                            Batalkan Koreksi
                          </button>
                        )}
                        <button type="button" onClick={keKonfirmasi} className="btn btn-primary text-sm">
                          {koreksi ? "Simpan Perubahan" : "Lanjut"}
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
                          disabled={pending || !dicentang || buktiKurang || alasan.trim().length < PANJANG_MIN_ALASAN_KOREKSI}
                          className="btn btn-primary text-sm"
                        >
                          {pending ? "Menyimpan..." : "Simpan koreksi"}
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
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
