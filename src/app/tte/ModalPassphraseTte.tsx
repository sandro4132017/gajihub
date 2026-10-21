"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { TteActionResult } from "./actions";
import {
  type JenisSptjm,
  BULAN_ROMAWI,
  DEFAULT_NOMOR_AGENDA_SPTJM,
  generateNomorSptjmDefault,
  generateNamaFileSptjm,
  parseNomorSptjm,
} from "@/lib/tte/sptjmTypes";
import { Modal } from "@/app/Modal";
import {
  FiCheckCircle,
  FiLock,
  FiAlertCircle,
  FiDownload,
  FiFileText,
  FiEye,
  FiEdit2,
  FiInfo,
} from "react-icons/fi";

const INITIAL_STATE: TteActionResult = {};

interface ModalPassphraseTteProps {
  terbuka: boolean;
  onTutup: () => void;
  jenisDokumen?: JenisSptjm;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja?: string;
  defaultNomorDokumen?: string;
  defaultNik?: string;
  namaPenandatanganDefault?: string;
  nipPenandatanganDefault?: string;
  jabatanPenandatanganDefault?: string;
  onSukses?: (result: TteActionResult) => void;
}

export function ModalPassphraseTte({
  terbuka,
  onTutup,
  jenisDokumen = "SPTJM_TUKIN",
  periodeBulan,
  periodeTahun,
  satuanKerja = "Biro Keuangan dan BMN",
  defaultNomorDokumen,
  defaultNik = "0803202100007062",
  // Dikosongkan, bukan diisi nama siapa pun. Identitas penanda tangan
  // ditentukan SERVER dari sesi (signSptjmUnitAction) dan empat field
  // tersembunyi di bawah sudah tidak lagi dipercaya. Nama yang muncul di
  // modal harus datang dari ppkDefault - kalau di-hardcode, layar
  // menjanjikan satu orang sementara yang tercetak orang lain.
  namaPenandatanganDefault = "",
  nipPenandatanganDefault = "",
  jabatanPenandatanganDefault = "Pejabat Pembuat Komitmen",
  onSukses,
}: ModalPassphraseTteProps) {
  const router = useRouter();
  const [state, setState] = useState<TteActionResult>(INITIAL_STATE);
  const [pending, setPending] = useState(false);
  const [passphrase, setPassphrase] = useState(
    defaultNik === "0803202100007062" ? "Bsre2026.#!" : ""
  );
  const [nik, setNik] = useState(defaultNik);
  const wasTerbukaRef = useRef(false);

  const romawi =
    BULAN_ROMAWI[Math.max(0, Math.min(11, periodeBulan - 1))] || "X";

  // Penomoran Dokumen: Bagian 1, 3, 4, 5 tetap/baku, Bagian 2 (nomor agenda) dapat diedit
  const nomorAwal =
    defaultNomorDokumen ||
    generateNomorSptjmDefault(jenisDokumen, periodeBulan, periodeTahun);

  const [nomorUrut, setNomorUrut] = useState(() => {
    return parseNomorSptjm(nomorAwal, periodeBulan, periodeTahun).nomorUrut;
  });
  const [nomorKustom, setNomorKustom] = useState(nomorAwal);
  const [isModeKustom, setIsModeKustom] = useState(() => {
    return parseNomorSptjm(nomorAwal, periodeBulan, periodeTahun).isKustom;
  });

  const nomorDokumen = isModeKustom
    ? nomorKustom
    : `1/${nomorUrut.trim() || "0000"}/KU.02/${romawi}/${periodeTahun}`;

  const [statusSertifikat, setStatusSertifikat] = useState<{
    loading: boolean;
    status?: string;
    pesan?: string;
  }>({ loading: false });

  // State untuk pratinjau draft PDF
  const [draftPending, setDraftPending] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Perbarui nomor dokumen & periksa status saat modal dibuka
  const periksaStatusNik = (targetNik: string) => {
    const cleanNik = targetNik.trim();
    if (!cleanNik) {
      setStatusSertifikat({
        loading: false,
        status: "INPUT",
        pesan: "Masukkan 16 digit NIK penandatangan untuk memeriksa sertifikat.",
      });
      return;
    }

    if (cleanNik.length !== 16) {
      setStatusSertifikat({
        loading: false,
        status: "INPUT",
        pesan:
          cleanNik.length === 18
            ? "Terdeteksi 18 digit (format NIP). BSrE mewajibkan 16 digit NIK penandatangan."
            : `Format NIK harus tepat 16 digit (saat ini ${cleanNik.length} digit).`,
      });
      return;
    }

    setStatusSertifikat({ loading: true });

    fetch("/api/tte", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "status", nik: cleanNik }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (res && typeof res.status === "string") {
          setStatusSertifikat({
            loading: false,
            status: res.status,
            pesan: res.message,
          });
        } else {
          setStatusSertifikat({
            loading: false,
            status: "OFFLINE",
            pesan: res?.error || "Server BSrE sedang offline (mode simulasi aktif).",
          });
        }
      })
      .catch(() => {
        setStatusSertifikat({
          loading: false,
          status: "OFFLINE",
          pesan: "Server BSrE sedang offline (mode simulasi aktif).",
        });
      });
  };

  const gunakanAkunDemo = () => {
    const demoNik = "0803202100007062";
    const demoPass = "Bsre2026.#!";
    setNik(demoNik);
    setPassphrase(demoPass);
    periksaStatusNik(demoNik);
  };

  // Reset form HANYA saat modal baru dibuka (transisi terbuka: false -> true),
  // BUKAN saat defaultNomorDokumen berubah setelah TTE berhasil (yang sebelumnya me-reset pop-up sukses!)
  useEffect(() => {
    if (terbuka && !wasTerbukaRef.current) {
      setState(INITIAL_STATE);
      setDraftError(null);
      const baru =
        defaultNomorDokumen ||
        generateNomorSptjmDefault(jenisDokumen, periodeBulan, periodeTahun);
      const parsed = parseNomorSptjm(baru, periodeBulan, periodeTahun);
      setNomorUrut(parsed.nomorUrut);
      setNomorKustom(baru);
      setIsModeKustom(parsed.isKustom);

      const targetNik = nik || defaultNik || "0803202100007062";
      if (!nik) setNik(targetNik);
      if (!passphrase && targetNik === "0803202100007062") {
        setPassphrase("Bsre2026.#!");
      }
    }
    wasTerbukaRef.current = terbuka;
  }, [terbuka, jenisDokumen, periodeBulan, periodeTahun, defaultNomorDokumen]);

  // Cek status sertifikat saat modal terbuka atau NIK berubah (debounced 250ms agar tidak memicu double request)
  useEffect(() => {
    if (!terbuka) return;
    const cleanNik = (nik || defaultNik || "0803202100007062").trim();

    const timer = setTimeout(() => {
      periksaStatusNik(cleanNik);
    }, 250);

    return () => {
      clearTimeout(timer);
    };
  }, [terbuka, nik, defaultNik]);

  const handleTutup = () => {
    setState(INITIAL_STATE);
    onTutup();
  };

  const labelJenis =
    jenisDokumen === "SPTJM_TUKIN"
      ? "Tunjangan Kinerja (Tukin)"
      : jenisDokumen === "SPTJM_UANG_MAKAN"
      ? "Uang Makan"
      : "Uang Lembur";

  const namaFileResmi = generateNamaFileSptjm(
    jenisDokumen,
    periodeBulan,
    periodeTahun,
    satuanKerja
  );

  const handlePratinjauDraft = async () => {
    setDraftError(null);
    setDraftPending(true);
    try {
      const r = await fetch("/api/tte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          jenis: jenisDokumen,
          bulan: periodeBulan,
          tahun: periodeTahun,
          nomorDokumen,
          satuanKerja,
        }),
      });
      const res = await r.json();
      if (res.success && res.downloadUrl) {
        window.open(res.downloadUrl, "_blank");
      } else {
        setDraftError(res.error || "Gagal membuat draft PDF.");
      }
    } catch {
      setDraftError("Gagal menghubungi server untuk pratinjau draft.");
    } finally {
      setDraftPending(false);
    }
  };

  const handleSubmitSign = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setState({});
    try {
      const r = await fetch("/api/tte", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sign",
          jenis: jenisDokumen,
          bulan: periodeBulan,
          tahun: periodeTahun,
          satuanKerja,
          namaPenandatangan: namaPenandatanganDefault,
          nipPenandatangan: nipPenandatanganDefault,
          jabatanPenandatangan: jabatanPenandatanganDefault,
          nomorDokumen,
          nik,
          passphrase,
        }),
      });
      const res = (await r.json()) as TteActionResult;
      setState(res);
      if (res.success) {
        if (onSukses) onSukses(res);
        router.refresh();
      }
    } catch (err) {
      setState({
        error: `Gagal menghubungi server TTE: ${
          err instanceof Error ? err.message : String(err)
        }`,
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <Modal
      terbuka={terbuka}
      judul={
        state.success
          ? `SPTJM ${labelJenis} Berhasil Ditandatangani!`
          : `Tanda Tangan Elektronik SPTJM PPK - ${labelJenis}`
      }
      nada={state.success ? "sukses" : state.error ? "bahaya" : "netral"}
      onTutup={pending ? null : handleTutup}
      aksi={
        state.success ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {state.downloadUrl && (
                <>
                  <a
                    href={state.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm flex items-center gap-1.5 text-xs"
                  >
                    <FiEye className="size-3.5 text-biru" /> Lihat PDF Hasil TTE
                  </a>
                  <a
                    href={state.downloadUrl}
                    download={namaFileResmi}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-primary btn-sm flex items-center gap-1.5 text-xs"
                  >
                    <FiDownload className="size-3.5" /> Unduh PDF SPTJM TTE
                  </a>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={handleTutup}
              className="btn btn-secondary btn-sm text-xs font-bold"
            >
              Selesai &amp; Tutup
            </button>
          </div>
        ) : null
      }
    >
      {state.success ? (
        <div className="space-y-3 py-1">
          <div className="rounded-xl border border-green/30 bg-green/10 p-4 text-ink-2">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-green/20 p-2 text-green shrink-0">
                <FiCheckCircle className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-green">
                  Tanda Tangan Elektronik (TTE) Selesai!
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink">
                  Dokumen <strong>SPTJM {labelJenis}</strong> periode{" "}
                  <strong>
                    {periodeBulan}/{periodeTahun}
                  </strong>{" "}
                  telah berhasil disahkan secara elektronik menggunakan sertifikat BSrE BSSN.
                </p>
              </div>
            </div>

            <div className="mt-3.5 space-y-1.5 rounded-lg border border-line-2 bg-surface p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Nomor Surat:</span>
                <span className="font-mono font-bold text-ink">NOMOR {nomorDokumen}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Nama Berkas:</span>
                <span className="font-mono text-[11px] font-semibold text-biru truncate">
                  {namaFileResmi}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Penandatangan:</span>
                <span className="font-semibold text-ink">{namaPenandatanganDefault}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">ID Dokumen BSrE:</span>
                <span className="font-mono text-[11px] font-bold text-green">
                  {state.idDokumenBsre}
                </span>
              </div>
            </div>

            {state.isSimulasi && (
              <p className="mt-2 text-[11px] text-muted italic">
                *Tanda tangan digital dibubuhkan dalam mode simulasi internal (siap masuk SAKTI).
              </p>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmitSign} className="space-y-4 pt-1">
          <input type="hidden" name="jenis" value={jenisDokumen} />
          <input type="hidden" name="bulan" value={periodeBulan} />
          <input type="hidden" name="tahun" value={periodeTahun} />
          <input type="hidden" name="satuanKerja" value={satuanKerja} />
          <input type="hidden" name="namaPenandatangan" value={namaPenandatanganDefault} />
          <input type="hidden" name="nipPenandatangan" value={nipPenandatanganDefault} />
          <input type="hidden" name="jabatanPenandatangan" value={jabatanPenandatanganDefault} />

          {/* Rangkuman Dokumen & Penandatangan PPK */}
          <div className="rounded-xl border border-line-2 bg-surface-2 p-3 text-xs space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <FiFileText className="mt-0.5 size-4 text-biru shrink-0" />
                <div>
                  <span className="font-bold text-ink">{labelJenis}</span>
                  <p className="text-muted">
                    Periode: Bulan {periodeBulan} / Tahun {periodeTahun}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handlePratinjauDraft}
                disabled={draftPending}
                className="btn btn-secondary btn-sm flex items-center gap-1 text-[11px] shrink-0"
              >
                <FiEye className="size-3" />
                {draftPending ? "Memuat Draft..." : "Pratinjau Draft"}
              </button>
            </div>

            <div className="border-t border-line-2 pt-1.5 text-[11px] text-muted flex items-center justify-between">
              <span>Penandatangan (PPK):</span>
              <span className="font-semibold text-ink">{namaPenandatanganDefault}</span>
            </div>
          </div>

          {draftError && (
            <div className="text-[11px] text-red">{draftError}</div>
          )}

          {/* Penomoran Dokumen Sesuai Format Resmi Tata Naskah Dinas Kemnaker */}
          <div>
            <div className="flex items-center justify-between">
              <label
                className="text-xs font-semibold text-ink flex items-center gap-1"
                htmlFor="tte-nomor-urut"
              >
                <FiEdit2 className="size-3 text-biru" /> Nomor Dokumen SPTJM
              </label>
              <button
                type="button"
                onClick={() => {
                  if (!isModeKustom) {
                    setNomorKustom(nomorDokumen);
                  }
                  setIsModeKustom(!isModeKustom);
                }}
                className="text-[11px] text-biru hover:underline font-medium"
              >
                {isModeKustom ? "Gunakan Format Baku Kemnaker" : "Edit Format Lengkap"}
              </button>
            </div>

            {!isModeKustom ? (
              <div className="mt-1">
                <div className="flex items-stretch rounded-lg border border-line-2 bg-surface overflow-hidden shadow-xs focus-within:border-biru focus-within:ring-1 focus-within:ring-biru">
                  <span className="inline-flex items-center bg-surface-2 px-2.5 py-1.5 font-mono text-xs font-bold text-muted border-r border-line-2 select-none">
                    1/
                  </span>
                  <input
                    id="tte-nomor-urut"
                    type="text"
                    value={nomorUrut}
                    onChange={(e) => setNomorUrut(e.target.value)}
                    className="w-24 px-2.5 py-1.5 font-mono text-xs font-bold text-ink bg-transparent focus:outline-none"
                    placeholder={DEFAULT_NOMOR_AGENDA_SPTJM[jenisDokumen] || "2903"}
                    title="Nomor agenda keluar yang dapat diedit"
                    required
                  />
                  <span className="inline-flex flex-1 items-center bg-surface-2 px-2.5 py-1.5 font-mono text-xs font-semibold text-muted border-l border-line-2 select-none">
                    /KU.02/{romawi}/{periodeTahun}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                  <span>
                    Format di surat: <strong className="font-mono text-ink">NOMOR {nomorDokumen}</strong>
                  </span>
                  <span className="text-[10px] text-muted italic">Hanya angka agenda yang diedit</span>
                </div>
              </div>
            ) : (
              <div className="mt-1">
                <input
                  id="tte-nomor"
                  type="text"
                  value={nomorKustom}
                  onChange={(e) => setNomorKustom(e.target.value)}
                  className="field-input w-full font-mono text-xs font-semibold"
                  placeholder={`1/2903/KU.02/${romawi}/${periodeTahun}`}
                  required
                />
                <p className="mt-1 text-[11px] text-muted">
                  Mode manual aktif. Masukkan nomor naskah dinas lengkap secara bebas.
                </p>
              </div>
            )}

            <input type="hidden" name="nomorDokumen" value={nomorDokumen} />
          </div>

          {/* Status Sertifikat BSrE */}
          {statusSertifikat.loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-line-2 bg-surface-2 p-2.5 text-xs text-muted">
              <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-biru border-t-transparent" />
              <span>Memeriksa sertifikat elektronik di server BSrE...</span>
            </div>
          ) : statusSertifikat.status ? (
            <div
              className={`rounded-lg border p-2.5 text-xs ${
                statusSertifikat.status === "ISSUE"
                  ? "border-green/30 bg-green/10 text-green"
                  : statusSertifikat.status === "OFFLINE" || statusSertifikat.status === "NETWORK_ERROR"
                  ? "border-biru/30 bg-biru/10 text-biru"
                  : statusSertifikat.status === "INPUT"
                  ? "border-line-2 bg-surface-2 text-muted"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-700"
              }`}
            >
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  {statusSertifikat.status === "ISSUE" ? (
                    <FiCheckCircle className="size-4 shrink-0 text-green" />
                  ) : (
                    <FiInfo className="size-4 shrink-0" />
                  )}
                  Status Sertifikat BSrE: {statusSertifikat.status === "ISSUE" ? "ISSUE (Aktif & Siap)" : statusSertifikat.status}
                </span>

                {(statusSertifikat.status === "NOT_REGISTERED" || statusSertifikat.status === "BELUM_TERDAFTAR") &&
                nik.trim() !== "0803202100007062" ? (
                  <button
                    type="button"
                    onClick={gunakanAkunDemo}
                    className="text-[11px] font-bold text-biru underline hover:text-navy"
                  >
                    Gunakan Akun Demo
                  </button>
                ) : statusSertifikat.status === "SERVER_ERROR" ||
                  statusSertifikat.status === "NETWORK_ERROR" ||
                  statusSertifikat.status === "OFFLINE" ? (
                  <button
                    type="button"
                    onClick={() => periksaStatusNik(nik)}
                    className="text-[11px] font-bold text-biru underline hover:text-navy"
                  >
                    Cek Ulang
                  </button>
                ) : null}
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed opacity-90">{statusSertifikat.pesan}</p>
            </div>
          ) : null}

          {/* NIK Penandatangan BSrE */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-ink" htmlFor="tte-nik">
                NIK Penandatangan BSrE
              </label>
              {nik !== "0803202100007062" && (
                <button
                  type="button"
                  onClick={gunakanAkunDemo}
                  className="text-[11px] font-medium text-biru hover:underline"
                >
                  Pakai NIK Demo (0803202100007062)
                </button>
              )}
            </div>
            <input
              id="tte-nik"
              type="text"
              name="nik"
              value={nik}
              onChange={(e) => setNik(e.target.value)}
              className="field-input mt-1 w-full font-mono text-xs"
              placeholder="16 digit NIK terdaftar BSrE"
              required
            />
            <p className="mt-0.5 text-[10px] text-muted">
              *Masukkan 16 digit <strong>NIK</strong> (bukan NIP). Akun uji coba server BSrE ini: <code>0803202100007062</code>
            </p>
          </div>

          {/* Passphrase BSrE (Kriteria V & VIII: type="password", autocomplete="off") */}
          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-ink" htmlFor="tte-passphrase">
                Passphrase BSrE
              </label>
              <button
                type="button"
                onClick={gunakanAkunDemo}
                className="text-[11px] font-medium text-biru hover:underline"
              >
                Gunakan Akun Demo
              </button>
            </div>
            <div className="relative mt-1">
              <input
                id="tte-passphrase"
                type="password"
                name="passphrase"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                autoComplete="off"
                placeholder="Masukkan passphrase sertifikat elektronik Anda"
                className="field-input w-full pr-8 text-xs font-mono"
                required
              />
              <FiLock className="absolute right-2.5 top-2.5 size-3.5 text-muted pointer-events-none" />
            </div>
            <p className="mt-1 text-[10px] text-muted">
              Passphrase tidak pernah disimpan di database Gajihub (Kriteria Kepatuhan BSrE BSSN).
            </p>
          </div>

          {/* Notifikasi Error */}
          {state.error && (
            <div className="rounded-lg border border-red/30 bg-red-tint p-2.5 text-xs text-red flex items-start gap-2">
              <FiAlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>{state.error}</span>
            </div>
          )}

          {/* Tombol Aksi */}
          <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-line-2">
            <button
              type="button"
              disabled={pending}
              onClick={handleTutup}
              className="btn btn-ghost btn-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={pending || !passphrase}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              {pending ? "Memproses TTE BSrE..." : "Tanda Tangani Sekarang"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
