"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiAlertTriangle, FiDownload, FiSend } from "react-icons/fi";
import { Modal } from "@/components/feedback/Modal";
import { SearchableSelect, type OpsiSelect } from "@/components/forms/SearchableSelect";
import { validasiPerintah } from "@/business-logic/perintahLembur";
import { keadaanTanggal, labelAnggota, type AnggotaPilihan } from "@/lib/lembur/pilihanForm";
import { kunciPeriodeDariTanggal, tanggalIsoTeks } from "@/lib/lembur/waktuTampil";
import { ModalPassphraseTte } from "../tte/ModalPassphraseTte";
import type { TteActionResult } from "../tte/actions";
import { SisaWaktuKirim, useJamServer } from "./SisaWaktuKirim";

export interface PeringatanPresensi {
  /** Kunci periode "YYYY-MM" yang presensinya sudah ditarik. */
  periode: string;
  /** Teks siap tampil, mis. "Oktober 2026". */
  labelPeriode: string;
  /** Teks siap tampil, mis. "19 November 2026, 14.05 WIB". */
  ditarikPada: string;
}

interface BarisAnggota {
  pegawaiId: string;
  /** Teks mentah supaya bisa diketik; divalidasi sebagai bilangan bulat saat kirim. */
  jam: string;
}

const API = "/api/lembur/perintah";

async function panggilApi(badan: Record<string, unknown>): Promise<Record<string, unknown>> {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(badan),
  });
  // Jawaban non-JSON (halaman galat proxy) dilempar ke pemanggil sebagai kegagalan jaringan.
  return (await r.json()) as Record<string, unknown>;
}

function unduhPdf(base64: string, nama: string) {
  const biner = atob(base64);
  const bita = new Uint8Array(biner.length);
  for (let i = 0; i < biner.length; i++) bita[i] = biner.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bita], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function FormPerintahLembur({
  anggota,
  hariIni,
  berlakuMulai,
  serverNowMs,
  peringatanPresensi,
  namaPenandatangan,
  satuanKerja,
  tteAktif,
}: {
  anggota: AnggotaPilihan[];
  /** Tanggal hari ini menurut WIB (dari server), `YYYY-MM-DD`. */
  hariIni: string;
  /** Tanggal SPKL mulai berlaku untuk satker ini, `YYYY-MM-DD`. */
  berlakuMulai: string;
  serverNowMs: number;
  peringatanPresensi: PeringatanPresensi | null;
  namaPenandatangan: string;
  satuanKerja: string;
  /** TTE lembur menyala (sakelarTteLembur.ts). Mati = kirim tanpa passphrase lewat modal konfirmasi. */
  tteAktif: boolean;
}) {
  const router = useRouter();
  const tanggalMin = hariIni >= berlakuMulai ? hariIni : berlakuMulai;
  const [tanggal, setTanggal] = useState(tanggalMin);
  const [uraian, setUraian] = useState("");
  const [baris, setBaris] = useState<BarisAnggota[]>([]);
  const [kunciPilih, setKunciPilih] = useState(0);
  const [galat, setGalat] = useState<string[]>([]);
  const [pratinjauMemuat, setPratinjauMemuat] = useState(false);
  const [modalTerbuka, setModalTerbuka] = useState(false);
  const [sudahTerkirim, setSudahTerkirim] = useState(false);
  // Jalur tanpa TTE: konfirmasi -> mengirim -> berhasil.
  const [fase, setFase] = useState<"tutup" | "konfirmasi" | "mengirim" | "berhasil">("tutup");
  const [galatKirim, setGalatKirim] = useState<string | null>(null);

  const sekarang = useJamServer(serverNowMs);
  const { kosong: tanggalKosong, terkunci, alasan: alasanKunci } = keadaanTanggal({
    tanggal,
    hariIni,
    berlakuMulai,
    sekarang: new Date(sekarang),
    berlakuMulaiTeks: tanggalIsoTeks(berlakuMulai),
  });

  const dataAnggota = useMemo(() => new Map(anggota.map((a) => [a.id, a])), [anggota]);
  const opsi = useMemo<OpsiSelect[]>(() => {
    const terpilih = new Set(baris.map((b) => b.pegawaiId));
    return anggota
      .filter((a) => !terpilih.has(a.id))
      .map((a) => ({ value: a.id, label: labelAnggota(a) }));
  }, [anggota, baris]);

  const tampilPeringatanPresensi =
    peringatanPresensi !== null && peringatanPresensi.periode === kunciPeriodeDariTanggal(tanggal);

  function tambah(id: string) {
    if (!id) return;
    setBaris((b) => (b.some((x) => x.pegawaiId === id) ? b : [...b, { pegawaiId: id, jam: "" }]));
    setKunciPilih((k) => k + 1); // kosongkan kotak pilih supaya bisa menambah berikutnya
  }

  function periksa(): boolean {
    const hasil = validasiPerintah({
      anggota: baris.map((b) => ({
        pegawaiId: b.pegawaiId,
        jam: b.jam.trim() === "" ? NaN : Number(b.jam),
      })),
      uraianTugas: uraian,
    });
    setGalat(hasil);
    return hasil.length === 0;
  }

  const badanDasar = () => ({
    tanggal,
    uraianTugas: uraian,
    anggota: baris.map((b) => ({ pegawaiId: b.pegawaiId, jam: Number(b.jam) })),
  });

  async function pratinjau() {
    if (!periksa()) return;
    setPratinjauMemuat(true);
    try {
      const res = await panggilApi({ action: "pratinjau", ...badanDasar() });
      if (res.success === true && typeof res.pdfBase64 === "string") {
        unduhPdf(res.pdfBase64, String(res.namaBerkas ?? "Pratinjau Surat Tugas Lembur.pdf"));
      } else {
        setGalat([typeof res.error === "string" ? res.error : "Pratinjau gagal dibuat."]);
      }
    } catch {
      setGalat(["Tidak bisa menghubungi server untuk pratinjau. Periksa koneksi lalu coba lagi."]);
    } finally {
      setPratinjauMemuat(false);
    }
  }

  function bukaTandaTangan(e: React.FormEvent) {
    e.preventDefault();
    if (terkunci) return;
    if (!periksa()) return;
    if (tteAktif) setModalTerbuka(true);
    else {
      setGalatKirim(null);
      setFase("konfirmasi");
    }
  }

  /** Jalur TANPA TTE: tanpa NIK/passphrase; keputusan diambil di modal konfirmasi. */
  async function kirimTanpaTte() {
    setFase("mengirim");
    setGalatKirim(null);
    try {
      const res = await panggilApi({ action: "kirim", ...badanDasar() });
      if (res.success === true) {
        setFase("berhasil");
        // Kosongkan isian supaya tidak terkirim ganda, lalu muat ulang riwayat.
        setBaris([]);
        setUraian("");
        setGalat([]);
        router.refresh();
      } else {
        setGalatKirim(typeof res.error === "string" ? res.error : "Perintah gagal dikirim.");
        setFase("konfirmasi");
      }
    } catch {
      setGalatKirim("Tidak bisa menghubungi server. Periksa koneksi lalu coba lagi.");
      setFase("konfirmasi");
    }
  }

  async function kirimTandaTangan(nik: string, passphrase: string): Promise<TteActionResult> {
    try {
      const res = await panggilApi({ action: "kirim", ...badanDasar(), nik, passphrase });
      if (res.success === true) return res as TteActionResult;
      return { error: typeof res.error === "string" ? res.error : "Perintah gagal dikirim." };
    } catch {
      return { error: "Gagal menghubungi server TTE. Periksa koneksi lalu coba lagi." };
    }
  }

  function tutupModal() {
    setModalTerbuka(false);
    if (sudahTerkirim) {
      // Perintah sudah terkirim: kosongkan isian supaya tidak terkirim ganda.
      setBaris([]);
      setUraian("");
      setGalat([]);
      setSudahTerkirim(false);
    }
  }

  const totalJam = baris.reduce((s, b) => s + (Number.isInteger(Number(b.jam)) ? Number(b.jam) : 0), 0);

  return (
    <>
      <form onSubmit={bukaTandaTangan} className="card mt-4 p-4 sm:p-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <div>
            <label htmlFor="lembur-tanggal" className="block text-xs font-semibold text-ink">
              Tanggal lembur
            </label>
            <input
              id="lembur-tanggal"
              type="date"
              value={tanggal}
              min={tanggalMin}
              onChange={(e) => setTanggal(e.target.value)}
              className="field-input mt-1 w-full font-mono"
              required
            />
          </div>
          <div className="self-end pb-1">
            <SisaWaktuKirim tanggalIso={tanggal} serverNowMs={serverNowMs} hariIni={tanggal === hariIni} />
          </div>
        </div>

        {terkunci && alasanKunci && (
          <p className="mt-3 flex items-start gap-2 border-l-4 border-l-red bg-red-tint px-3 py-2 text-xs font-medium text-red">
            <FiAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {tanggalKosong
                ? alasanKunci
                : `${alasanKunci} Perintah tidak bisa dibuat untuk tanggal ini; pilih tanggal mendatang.`}
            </span>
          </p>
        )}

        {tampilPeringatanPresensi && peringatanPresensi && (
          <p className="mt-3 flex items-start gap-2 border-l-4 border-l-gold bg-gold-tint px-3 py-2 text-xs text-gold-deep">
            <FiAlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              Presensi {peringatanPresensi.labelPeriode} untuk satuan kerja ini sudah ditarik (terakhir{" "}
              {peringatanPresensi.ditarikPada}). Perintah yang terkirim sesudahnya baru berlaku di rekap setelah
              Kasubag TU atau petugas menarik ulang presensi periode ini.
            </span>
          </p>
        )}

        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-ink">Anggota dan jam lembur</legend>
          <p className="mt-0.5 text-xs text-muted">
            Pilih pegawai, lalu isi jumlah jam lembur per orang (bilangan bulat 1-24).
          </p>
          <div className="mt-2 max-w-md">
            <SearchableSelect
              key={kunciPilih}
              name="tambah-anggota"
              options={opsi}
              placeholder={opsi.length === 0 ? "Semua anggota sudah dipilih" : "Ketik nama atau jabatan anggota..."}
              onValueChange={tambah}
            />
          </div>

          {baris.length > 0 && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-line-2">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2">No.</th>
                    <th className="col-nama px-3 py-2">Anggota</th>
                    <th className="px-3 py-2">Jam lembur</th>
                    <th className="px-3 py-2">
                      <span className="sr-only">Aksi</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {baris.map((b, i) => {
                    const a = dataAnggota.get(b.pegawaiId);
                    return (
                      <tr key={b.pegawaiId} className="border-b border-line-2">
                        <td className="px-3 py-2 font-mono text-xs text-muted">{i + 1}</td>
                        <td className="col-nama px-3 py-2">
                          <span className="font-semibold text-ink">{a ? `${a.nama}${a.penanda ? ` ${a.penanda}` : ""}` : "-"}</span>
                          <span className="block text-xs text-muted">{a?.jabatan}</span>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={24}
                            step={1}
                            value={b.jam}
                            aria-label={`Jam lembur ${a?.nama ?? "anggota"}`}
                            onChange={(e) =>
                              setBaris((rs) =>
                                rs.map((r) => (r.pegawaiId === b.pegawaiId ? { ...r, jam: e.target.value } : r)),
                              )
                            }
                            className="field-input w-20 py-1 text-center font-mono"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => setBaris((rs) => rs.filter((r) => r.pegawaiId !== b.pegawaiId))}
                            className="btn btn-ghost btn-sm"
                          >
                            Keluarkan
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {baris.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              <span className="font-mono font-semibold text-ink-2">{baris.length}</span> anggota, total{" "}
              <span className="font-mono font-semibold text-ink-2">{totalJam}</span> jam.
            </p>
          )}
        </fieldset>

        <div className="mt-4">
          <label htmlFor="lembur-uraian" className="block text-xs font-semibold text-ink">
            Uraian tugas
          </label>
          <textarea
            id="lembur-uraian"
            value={uraian}
            onChange={(e) => setUraian(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Pekerjaan yang harus diselesaikan saat lembur"
            className="field-input mt-1 w-full"
          />
        </div>

        {galat.length > 0 && (
          <ul role="alert" className="mt-3 space-y-0.5 border-l-4 border-l-red bg-red-tint px-3 py-2 text-xs font-medium text-red">
            {galat.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {tteAktif && (
            <button type="button" onClick={pratinjau} disabled={pratinjauMemuat || terkunci} className="btn btn-secondary flex items-center gap-1.5">
              <FiDownload className="size-4" aria-hidden="true" />
              {pratinjauMemuat ? "Menyiapkan..." : "Unduh pratinjau PDF"}
            </button>
          )}
          <button type="submit" disabled={terkunci} className="btn btn-primary flex flex-1 items-center justify-center gap-1.5 sm:flex-none sm:min-w-64">
            <FiSend className="size-4" aria-hidden="true" />
            {tteAktif ? "Tanda tangani dan kirim" : "Kirim perintah"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {tteAktif
            ? "Perintah yang sudah terkirim tidak bisa dibatalkan atau diubah. Periksa pratinjau lebih dulu."
            : "Perintah yang sudah terkirim tidak bisa dibatalkan atau diubah. Periksa isiannya sebelum mengirim."}
        </p>
      </form>

      {/* Jalur tanpa TTE: konfirmasi lalu hasil, tanpa passphrase. */}
      {!tteAktif && (
        <Modal
          terbuka={fase !== "tutup"}
          nada={fase === "berhasil" ? "sukses" : "netral"}
          judul={fase === "berhasil" ? "Perintah terkirim" : "Kirim perintah lembur?"}
          subjudul={
            fase === "berhasil"
              ? undefined
              : [tanggalIsoTeks(tanggal), `${baris.length} anggota, total ${totalJam} jam`]
          }
          onTutup={fase === "mengirim" ? null : () => setFase("tutup")}
          aksi={
            fase === "berhasil" ? (
              <button type="button" onClick={() => setFase("tutup")} className="btn btn-primary">
                Tutup
              </button>
            ) : (
              <>
                <button type="button" onClick={() => setFase("tutup")} disabled={fase === "mengirim"} className="btn btn-secondary">
                  Batal
                </button>
                <button type="button" onClick={kirimTanpaTte} disabled={fase === "mengirim"} className="btn btn-primary">
                  {fase === "mengirim" ? "Mengirim..." : "Kirim perintah"}
                </button>
              </>
            )
          }
        >
          {fase === "berhasil" ? (
            <p>
              Perintah lembur sudah terkirim. SPKL harian tanggal ini dibentuk otomatis pukul 15.00 WIB dan
              bisa diunduh Kasubag TU setelahnya.
            </p>
          ) : (
            <>
              <p>
                Perintah yang sudah dikirim <strong className="text-ink">tidak bisa dibatalkan atau diubah</strong>.
              </p>
              <p className="mt-1.5">SPKL harian terkunci otomatis pukul 15.00 WIB pada tanggal lembur.</p>
              {galatKirim && (
                <p role="alert" className="mt-3 border-l-4 border-l-red bg-red-tint px-3 py-2 font-medium text-red">
                  {galatKirim}
                </p>
              )}
            </>
          )}
        </Modal>
      )}

      {/* Di luar <form>: modal membawa form-nya sendiri, dan form tidak boleh bersarang. */}
      {tteAktif && (
      <ModalPassphraseTte
        terbuka={modalTerbuka}
        onTutup={tutupModal}
        periodeBulan={Number(tanggal.slice(5, 7)) || 1}
        periodeTahun={Number(tanggal.slice(0, 4)) || new Date().getFullYear()}
        satuanKerja={satuanKerja}
        defaultNik=""
        namaPenandatanganDefault={namaPenandatangan}
        kirimTandaTangan={kirimTandaTangan}
        onSukses={() => setSudahTerkirim(true)}
        labelDokumen="Surat Tugas Lembur"
        ringkasan={`Tanggal lembur ${tanggalIsoTeks(tanggal)} - ${baris.length} anggota, ${totalJam} jam`}
      />
      )}
    </>
  );
}
