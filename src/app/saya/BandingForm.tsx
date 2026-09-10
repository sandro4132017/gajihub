"use client";

import { useActionState, useState } from "react";
import { ajukanBandingAction, type AjukanBandingFormState } from "./actions";
import { JENIS_BANDING, isReferensiData, type ReferensiData } from "../../business-logic/bandingData";

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
  const [state, formAction, pending] = useActionState(ajukanBandingAction, INITIAL_STATE);
  const [dipilih, setDipilih] = useState("");

  const [tipe, referensiId] = dipilih ? dipilih.split("|") : ["", ""];
  const jenisData = isReferensiData(tipe) ? (tipe as ReferensiData) : null;
  const info = jenisData ? JENIS_BANDING[jenisData] : null;

  if (state.success) {
    return (
      <p className="rounded-lg bg-green/10 px-3 py-2.5 text-sm font-semibold text-green">{state.success}</p>
    );
  }

  if (sasaran.length === 0) {
    return (
      <p className="text-sm text-muted">
        Belum ada yang bisa dibanding. Banding diajukan atas data atau kalkulasi yang sudah tercatat - kalau
        semuanya masih kosong, tanyakan dulu ke Kasubag TU unit kamu.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
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
          <select name="bagianData" required defaultValue="" className="field-input">
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
          Seharusnya{!info && <span className="font-normal text-muted"> (boleh dikosongkan)</span>}
        </span>
        <textarea
          name="usulanPerbaikan"
          required={Boolean(info)}
          rows={2}
          placeholder="Contoh: tanggal 12 dihitung hadir, jam pulang 16.05."
          className="field-input"
        />
      </label>

      {/* Harapan yang keliru paling mahal di sini: orang mengira menekan tombol
          ini langsung mengubah angkanya. Sumber datanya disebut eksplisit
          supaya jelas perbaikannya terjadi di tempat lain. */}
      {info && (
        <p className="text-[11px] leading-relaxed text-muted">
          Diperiksa oleh <strong className="text-ink-2">{info.ditanganiOleh}</strong>. Kalau disetujui, perbaikannya
          dilakukan di <strong className="text-ink-2">{info.sistemSumber}</strong> - angka di Gajihub ikut berubah
          setelah data itu ditarik ulang, bukan seketika.
        </p>
      )}

      <button type="submit" disabled={pending || !dipilih} className="btn btn-gold btn-sm">
        {pending ? "Mengirim..." : "Ajukan banding"}
      </button>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
