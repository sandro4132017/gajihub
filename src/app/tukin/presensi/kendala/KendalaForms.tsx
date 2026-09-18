"use client";

import { useActionState, useState } from "react";
import { SearchableSelect } from "../../../SearchableSelect";
import { NAMA_BULAN, daftarTahunPeriode } from "../../../bulan";
import { tandaiKendalaAction, cabutKendalaAction, type KendalaFormState } from "./actions";

const AWAL: KendalaFormState = {};

const HARI = Array.from({ length: 31 }, (_, i) => i + 1);

/** "2026-08-31" -> potongan yang cocok dengan value <option> (tanpa nol depan). */
function pecahIso(iso?: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return { hari: "", bulan: "", tahun: "" };
  return { hari: String(Number(m[3])), bulan: String(Number(m[2])), tahun: m[1] };
}

export function TandaiKendalaForm({
  daftarSatker,
  satkerTerkunci,
  tanggalDisarankan,
}: {
  daftarSatker: string[];
  /**
   * Satuan kerja yang DIPAKSA untuk akun ini (Kasubag TU), atau null kalau
   * boleh memilih (Admin). Nilainya tetap ditentukan ulang di server -
   * yang di sini cuma supaya tampilannya tidak menawarkan cakupan yang
   * nanti ditolak.
   */
  satkerTerkunci: string | null;
  /** Tanggal hasil deteksi - dipakai sebagai isian awal supaya tidak perlu diketik ulang. */
  tanggalDisarankan?: string;
}) {
  const [state, formAction, pending] = useActionState(tandaiKendalaAction, AWAL);
  const awal = pecahIso(tanggalDisarankan);
  // Tahun sarannya ikut dimasukkan kalau kebetulan di luar daftar - kalau
  // tidak, isian awalnya diam-diam jatuh ke opsi kosong dan orang mengira
  // sarannya tidak pernah ada.
  const tahunOpsi = [...new Set([...daftarTahunPeriode(), ...(awal.tahun ? [Number(awal.tahun)] : [])])].sort(
    (a, b) => a - b
  );

  return (
    <form action={formAction} className="card p-4">
      <p className="text-sm font-bold text-ink">Tandai tanggal kendala e-Presensi</p>
      <p className="mt-0.5 text-xs text-muted">
        Dasar: Pasal 10 ayat (2) Permenaker 15/2024. Potongan &quot;tidak melakukan presensi&quot; (Pasal 13 ayat 2) di
        tanggal ini tidak akan diterapkan. Keterlambatan dan ketidakhadiran <strong>tetap</strong> dihitung.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <span className="field-label">Tanggal</span>
          {/* TIGA PILIHAN TANGGAL-BULAN-TAHUN, BUKAN <input type="date">.
              Urutan tampil `type="date"` ditentukan LOCALE BROWSER, bukan
              halaman - `<html lang="id">` pun diabaikan Chrome - jadi di mesin
              ber-locale Inggris field itu tampil MM/DD/YYYY. "03/04" lalu
              terbaca dua tanggal berbeda oleh dua orang, dan di halaman ini
              satu penanda salah hari membatalkan potongan Pasal 13 ayat (2)
              untuk seluruh unit di hari yang keliru.

              Bulan ditulis sebagai NAMA ("Agustus"), bukan angka: itu satu-
              satunya bentuk yang tidak bisa tertukar di locale mana pun.

              <select> NATIVE, bukan SearchableSelect seperti dropdown lain di
              project ini - dua sebabnya: 31 angka tidak perlu kotak pencarian,
              dan tanpa JavaScript SearchableSelect mengirim `<input hidden>`
              hasil render server BERSAMA <select> di dalam <noscript>, jadi
              yang terbaca server justru nilai bawaannya - bukan yang dipilih.
              Untuk field yang menentukan hari mana yang dikecualikan, cara
              gagal seperti itu tidak boleh ada.

              Opsi kosong di tiap dropdown DISENGAJA supaya `required` tetap
              memaksa pilihan sadar; tanpa itu browser memilihkan opsi pertama
              dan tanggal yang tidak pernah dilihat siapa pun ikut terkirim. */}
          <div className="mt-1 flex gap-2">
            <select
              name="tanggalHari"
              required
              defaultValue={awal.hari}
              aria-label="Tanggal"
              className="field-input mt-0 w-20"
            >
              <option value="">--</option>
              {HARI.map((h) => (
                <option key={h} value={String(h)}>
                  {h}
                </option>
              ))}
            </select>
            <select
              name="tanggalBulan"
              required
              defaultValue={awal.bulan}
              aria-label="Bulan"
              className="field-input mt-0 flex-1"
            >
              <option value="">-- Bulan --</option>
              {NAMA_BULAN.map((nama, i) => (
                <option key={nama} value={String(i + 1)}>
                  {nama}
                </option>
              ))}
            </select>
            <select
              name="tanggalTahun"
              required
              defaultValue={awal.tahun}
              aria-label="Tahun"
              className="field-input mt-0 w-24"
            >
              <option value="">--</option>
              {tahunOpsi.map((t) => (
                <option key={t} value={String(t)}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
        {satkerTerkunci ? (
          <div>
            <span className="field-label">Cakupan</span>
            <p className="mt-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-ink">
              {satkerTerkunci}
            </p>
            <p className="mt-1 text-[11px] text-muted">
              Penanda berlaku untuk unitmu saja. Cakupan seluruh kementerian hanya bisa dibuat Admin.
            </p>
          </div>
        ) : (
          <label className="block">
            <span className="field-label">Cakupan</span>
            <SearchableSelect
              name="satuanKerja"
              options={[
                {
                  value: "",
                  label: "Seluruh kementerian",
                  keterangan: "dipakai kalau e-Presensi mati untuk semua",
                },
                ...daftarSatker.map((s) => ({ value: s, label: s })),
              ]}
              defaultValue=""
            />
          </label>
        )}
      </div>

      <label className="mt-3 block">
        <span className="field-label">Alasan (wajib)</span>
        <textarea
          name="alasan"
          required
          minLength={10}
          rows={2}
          placeholder="Contoh: web e-Presensi tidak bisa diakses sejak siang, pegawai melapor ke petugas absensi unit dengan foto bertimestamp."
          className="field-input w-full"
        />
        <span className="mt-1 block text-xs text-muted">
          Ini yang dibaca kalau suatu saat ditanya kenapa potongan sehari hilang untuk banyak orang.
        </span>
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary mt-3">
        {pending ? "Menyimpan..." : "Tandai tanggal ini"}
      </button>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.sukses && <p className="mt-3 text-sm font-semibold text-green">{state.sukses}</p>}
    </form>
  );
}

export function CabutKendalaForm({ id, tanggal }: { id: string; tanggal: string }) {
  const [state, formAction, pending] = useActionState(cabutKendalaAction, AWAL);
  // Konfirmasi dua langkah, bukan confirm() bawaan browser - dialog itu tidak
  // bisa menyebut tanggal mana yang dicabut, padahal justru itu yang perlu
  // dibaca sebelum menekan.
  const [yakin, setYakin] = useState(false);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      {!yakin ? (
        <button type="button" onClick={() => setYakin(true)} className="btn btn-ghost text-xs">
          Cabut
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-xs text-ink-2">Cabut penanda {tanggal}?</span>
          <button type="submit" disabled={pending} className="btn btn-danger text-xs">
            {pending ? "..." : "Ya, cabut"}
          </button>
          <button type="button" onClick={() => setYakin(false)} className="btn btn-ghost text-xs">
            Batal
          </button>
        </span>
      )}
      {state.error && <span className="ml-2 text-xs font-medium text-red">{state.error}</span>}
      {state.sukses && <span className="ml-2 text-xs font-semibold text-green">{state.sukses}</span>}
    </form>
  );
}
