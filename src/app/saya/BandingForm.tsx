"use client";

import { useActionState, useState, useRef } from "react";
import { ajukanBandingAction, type AjukanBandingFormState } from "./actions";
import {
  JENIS_BANDING,
  isReferensiData,
  type ReferensiData,
} from "../../business-logic/bandingData";
import {
  kompresGambarKlien,
  formatUkuranBerkas,
  type KompresiBerkasResult,
} from "../../lib/clientImageCompress";

const INITIAL_STATE: AjukanBandingFormState = {};

/**
 * Satu sasaran yang bisa dibanding - satu baris nyata milik pegawai ini.
 *
 * `nilai` berbentuk "TIPE|id" supaya seluruh pilihan muat di SATU <select>.
 * Alternatifnya dua dropdown bertingkat (pilih jenis, lalu pilih periode) yang
 * isinya harus saling menyesuaikan - lebih banyak yang bisa salah, dan tidak
 * ada gunanya di sini karena daftarnya toh sudah disusun di server dari baris
 * yang benar-benar ada.
 */
export interface SasaranBanding {
  nilai: string;
  label: string;
  /** Sudah ada banding yang belum diputuskan untuk baris ini. */
  sedangBerjalan: boolean;
}

/**
 * Formulir banding - SATU pintu untuk semuanya.
 *
 * Sebelumnya formulirnya tersebar: banding angka di tab Pendapatan, banding
 * data di tab Profil/Kehadiran/Kinerja. Akibatnya orang yang tahu ada fasilitas
 * banding tetap harus menebak tab mana yang menyimpannya, dan tab Banding -
 * satu-satunya tempat yang namanya menjanjikan itu - justru cuma berisi
 * riwayat. Sekarang tab Banding memuat keduanya: tombol pengajuan, lalu
 * prosesnya.
 *
 * Isian menyesuaikan sasaran. Banding atas DATA wajib menyebut bagian mana yang
 * keliru dan nilai yang diharapkan; banding atas ANGKA tidak punya "bagian",
 * dan usulannya opsional - yang dipersoalkan hasil hitungnya, bukan satu kolom.
 */
export function BandingForm({ sasaran }: { sasaran: SasaranBanding[] }) {
  const [state, formAction, pending] = useActionState(
    ajukanBandingAction,
    INITIAL_STATE,
  );
  const [dipilih, setDipilih] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [compressionInfo, setCompressionInfo] =
    useState<KompresiBerkasResult | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tipe, referensiId] = dipilih ? dipilih.split("|") : ["", ""];
  const jenisData = isReferensiData(tipe) ? (tipe as ReferensiData) : null;
  const info = jenisData ? JENIS_BANDING[jenisData] : null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);
    if (!file) {
      setSelectedFile(null);
      setCompressionInfo(null);
      return;
    }

    const MAKS_UKURAN_BERKAS = 2 * 1024 * 1024; // 2 MB

    // Validasi ukuran PDF (maksimal 2MB)
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      if (file.size > MAKS_UKURAN_BERKAS) {
        setFileError(
          `Ukuran dokumen PDF (${formatUkuranBerkas(file.size)}) melebihi batas maksimal 2 MB.`,
        );
        setSelectedFile(null);
        setCompressionInfo(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setSelectedFile(file);
      setCompressionInfo({
        file,
        originalSize: file.size,
        compressedSize: file.size,
        reductionPercentage: 0,
        previewUrl: "",
      });
      return;
    }

    // Jika gambar, jalankan kompresi otomatis client-side
    if (file.type.startsWith("image/")) {
      setIsCompressing(true);
      try {
        const result = await kompresGambarKlien(file, {
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.8,
          outputType: "image/jpeg",
        });

        if (result.compressedSize > MAKS_UKURAN_BERKAS) {
          setFileError(
            `Ukuran gambar setelah kompresi (${formatUkuranBerkas(result.compressedSize)}) masih melebihi batas maksimal 2 MB. Harap gunakan gambar dengan dimensi/resolusi lebih kecil.`,
          );
          setSelectedFile(null);
          setCompressionInfo(null);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        setSelectedFile(result.file);
        setCompressionInfo(result);
      } catch {
        setFileError("Gagal mengompresi gambar. Coba gunakan berkas lain.");
      } finally {
        setIsCompressing(false);
      }
    } else {
      setFileError(
        "Format berkas tidak didukung. Harap unggah PDF atau gambar (PNG/JPG/WebP).",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleHapusBerkas = () => {
    setSelectedFile(null);
    setCompressionInfo(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = (formData: FormData) => {
    if (selectedFile) {
      formData.set("lampiran", selectedFile);
    }
    formAction(formData);
  };

  if (state.success) {
    return (
      <p className="rounded-lg bg-green/10 px-3 py-2.5 text-sm font-semibold text-green">
        {state.success}
      </p>
    );
  }

  if (sasaran.length === 0) {
    return (
      <p className="text-sm text-muted">
        Belum ada yang bisa dibanding. Banding diajukan atas data atau kalkulasi
        yang sudah tercatat - kalau semuanya masih kosong, tanyakan dulu ke
        Kasubag TU unit kamu.
      </p>
    );
  }

  return (
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="referensiTipe" value={tipe} />
      <input type="hidden" name="referensiId" value={referensiId} />

      <label className="block">
        <span className="field-label">Yang mau dibanding</span>
        <select
          required
          value={dipilih}
          onChange={(e) => setDipilih(e.target.value)}
          className="field-input"
        >
          <option value="" disabled>
            Pilih data atau kalkulasi
          </option>
          {sasaran.map((s) => (
            <option key={s.nilai} value={s.nilai} disabled={s.sedangBerjalan}>
              {s.label}
              {s.sedangBerjalan ? " - banding masih berjalan" : ""}
            </option>
          ))}
        </select>
      </label>

      {/* Bagian data hanya ada pada banding atas DATA. Pada banding atas angka
          tidak ada satu kolom pun yang bisa ditunjuk - yang dipersoalkan
          hasil hitungnya. */}
      {info && (
        <label className="block">
          <span className="field-label">Bagian yang keliru</span>
          <select
            name="bagianData"
            required
            defaultValue=""
            className="field-input"
          >
            <option value="" disabled>
              Pilih bagian data
            </option>
            {info.bagian.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="block">
        <span className="field-label">Data saat ini</span>
        <textarea
          name="alasan"
          required
          rows={2}
          placeholder="Contoh: tanggal 12 tercatat alpha, padahal saya hadir dan tap masuk 07.20 - tap pulang yang tidak terbaca."
          className="field-input"
        />
      </label>

      <label className="block">
        <span className="field-label">
          Seharusnya
          {!info && (
            <span className="font-normal text-muted"> (boleh dikosongkan)</span>
          )}
        </span>
        <textarea
          name="usulanPerbaikan"
          required={Boolean(info)}
          rows={2}
          placeholder="Contoh: tanggal 12 dihitung hadir, jam pulang 16.05."
          className="field-input"
        />
      </label>

      {/* Lampiran Bukti Dukung (Opsional) */}
      <div className="rounded-xl border border-dashed border-line bg-surface-2/40 p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <label
            htmlFor="lampiran-input"
            className="field-label mb-0 cursor-pointer flex items-center gap-1.5 font-bold"
          >
            <svg
              className="size-4 text-biru"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
            <span>Lampiran Bukti Pendukung</span>
            <span className="font-normal text-xs text-muted">(Opsional)</span>
          </label>
          {selectedFile && (
            <button
              type="button"
              onClick={handleHapusBerkas}
              className="text-xs font-semibold text-red hover:underline"
            >
              Hapus berkas
            </button>
          )}
        </div>

        <p className="text-[11px] text-muted leading-relaxed">
          Unggah dokumen atau gambar yang mendukung pengajuan banding, seperti SK Grade, surat tugas, surat sakit, atau bukti presensi.
          <br />
          Format yang didukung: PDF, PNG, JPG, dan WebP.
        </p>

        {/* Peringatan batas ukuran 2 MB */}
        <div className="flex items-center gap-2 rounded-lg border border-teal-tint bg-teal-tint/50 px-2.5 py-1.5 text-[11px] text-navy">
          <svg className="size-4 shrink-0 text-biru" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Ukuran berkas <strong>maksimal 2 MB</strong>.
          </span>
        </div>

        {!selectedFile ? (
          <div>
            <input
              id="lampiran-input"
              ref={fileInputRef}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={handleFileChange}
              disabled={isCompressing || pending}
              className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-teal-tint file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-navy hover:file:bg-biru/20 file:cursor-pointer cursor-pointer"
            />
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2.5 shadow-xs">
            {compressionInfo?.previewUrl ? (
              <img
                src={compressionInfo.previewUrl}
                alt="Preview Lampiran"
                className="size-12 shrink-0 rounded-md object-cover border border-line"
              />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-md bg-teal-tint text-navy font-bold text-xs uppercase">
                PDF
              </div>
            )}

            <div className="min-w-0 grow">
              <p className="truncate text-xs font-bold text-ink">
                {selectedFile.name}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                {compressionInfo && compressionInfo.reductionPercentage > 0 ? (
                  <>
                    <span className="font-bold text-green">
                      {formatUkuranBerkas(compressionInfo.compressedSize)}
                    </span>
                    <span className="text-muted line-through">
                      {formatUkuranBerkas(compressionInfo.originalSize)}
                    </span>
                    <span className="rounded bg-green/10 px-1 text-[10px] font-bold text-green">
                      Hemat {compressionInfo.reductionPercentage}%
                    </span>
                  </>
                ) : (
                  <span className="font-semibold text-muted">
                    {formatUkuranBerkas(selectedFile.size)}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {isCompressing && (
          <p className="text-xs font-semibold text-biru animate-pulse flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-biru animate-ping" />
            Mengoptimalkan dan mengompresi gambar...
          </p>
        )}

        {fileError && (
          <p className="text-xs font-semibold text-red">{fileError}</p>
        )}
      </div>

      {/* Harapan yang keliru paling mahal di sini: orang mengira menekan tombol
          ini langsung mengubah angkanya. Sumber datanya disebut eksplisit
          supaya jelas perbaikannya terjadi di tempat lain. */}
      {info && (
        <p className="text-[11px] leading-relaxed text-muted">
          Diperiksa oleh{" "}
          <strong className="text-ink-2">{info.ditanganiOleh}</strong>. Kalau
          disetujui, perbaikannya dilakukan di{" "}
          <strong className="text-ink-2">{info.sistemSumber}</strong> - angka di
          Gajihub ikut berubah setelah data itu ditarik ulang, bukan seketika.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !dipilih || isCompressing}
        className="btn btn-gold btn-sm"
      >
        {pending
          ? "Mengirim..."
          : isCompressing
            ? "Mengompresi berkas..."
            : "Ajukan banding"}
      </button>
      {state.error && (
        <p className="text-sm font-medium text-red">{state.error}</p>
      )}
    </form>
  );
}
