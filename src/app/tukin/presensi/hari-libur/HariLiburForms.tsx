"use client";

import { useActionState, useState } from "react";
import { SearchableSelect } from "../../../SearchableSelect";
import {
  tambahHariLiburAction,
  ubahHariLiburAction,
  hapusHariLiburAction,
  imporHariLiburAction,
  type HariLiburFormState,
} from "./actions";

const AWAL: HariLiburFormState = {};

/**
 * Tarik kalender setahun penuh dari e-Presensi - satu klik.
 *
 * Ini jalur UTAMA sekarang: e-Presensi memang merawat tabel `libur`-nya
 * (dicek 2026-08-13, 127 baris sampai 2026), jadi mengetik ulang dari SKB 3
 * Menteri satu per satu itu pekerjaan yang tidak perlu. Form manual di
 * bawahnya tetap ada buat tanggal yang tidak tercakup atau kalau server
 * e-Presensi tidak terjangkau.
 */
export function ImporHariLiburForm({ tahun }: { tahun: number }) {
  const [state, formAction, pending] = useActionState(imporHariLiburAction, AWAL);
  // Tahun terpilih dijaga di klien supaya tombolnya bisa menyebut tahun yang
  // benar tanpa memuat ulang halaman.
  const [th, setTh] = useState(String(tahun));
  const pilihan = [tahun - 1, tahun, tahun + 1];

  return (
    <form action={formAction} className="card border-l-4 border-l-teal p-4">
      <p className="text-sm font-bold text-ink">Tarik dari e-Presensi</p>
      <p className="mt-0.5 text-xs text-muted">
        e-Presensi sudah punya daftar hari libur nasional &amp; cuti bersamanya sendiri - tidak perlu diketik ulang dari
        SKB 3 Menteri. Tanggal yang sudah ada di kalender ini <strong>tidak ditimpa</strong>.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <span className="field-label">Tahun</span>
          {/* SearchableSelect, bukan <select> polos - konvensi yang dipegang
              seluruh aplikasi (lihat catatan di SearchableSelect.tsx). */}
          <SearchableSelect
            name="tahun"
            className="w-32"
            options={pilihan.map((y) => ({ value: String(y), label: String(y) }))}
            defaultValue={String(tahun)}
            onValueChange={setTh}
          />
        </div>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Menarik..." : `Tarik kalender ${th}`}
        </button>
      </div>
      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.sukses && <p className="mt-3 text-sm font-semibold text-green">{state.sukses}</p>}
    </form>
  );
}

export function TambahHariLiburForm({ tanggalDisarankan }: { tanggalDisarankan?: string }) {
  const [state, formAction, pending] = useActionState(tambahHariLiburAction, AWAL);

  return (
    <form action={formAction} className="card p-4">
      <p className="text-sm font-bold text-ink">Tetapkan hari libur</p>
      <p className="mt-0.5 text-xs text-muted">
        Sumbernya SKB 3 Menteri tentang hari libur nasional &amp; cuti bersama. Tanggal di sini diperlakukan{" "}
        <strong>sama persis dengan Sabtu/Minggu</strong>.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="field-label">Tanggal</span>
          <input type="date" name="tanggal" required defaultValue={tanggalDisarankan} className="field-input w-full" />
        </label>
        <label className="block">
          <span className="field-label">Keterangan</span>
          <input
            type="text"
            name="keterangan"
            required
            minLength={3}
            placeholder="Hari Lahir Pancasila"
            className="field-input w-full"
          />
        </label>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-semibold text-teal-deep">
          Tetapkan banyak tanggal sekaligus (mis. satu tahun dari SKB 3 Menteri)
        </summary>
        <textarea
          name="tanggalBanyak"
          rows={3}
          placeholder="2026-01-01 2026-03-19 2026-03-20&#10;2026-05-01, 2026-06-01"
          className="field-input mt-1 w-full font-mono text-xs"
        />
        <span className="mt-1 block text-xs text-muted">
          Pisahkan dengan spasi, koma, atau baris baru. Format <span className="font-mono">YYYY-MM-DD</span>. Semuanya
          memakai keterangan yang sama - ubah satu per satu setelahnya kalau perlu. Menetapkan sekaligus jauh lebih
          hemat: <strong>tarik ulang presensi cukup SEKALI</strong> setelah semua tanggal masuk.
        </span>
      </details>

      <label className="mt-3 flex items-start gap-2 text-xs text-ink-2">
        <input type="checkbox" name="cutiBersama" value="1" className="mt-0.5" />
        <span>
          <strong>Cuti bersama</strong> (bukan libur nasional). Perlakuan pembayarannya SAMA - penanda ini cuma supaya
          bisa dilaporkan terpisah, karena cuti bersama memotong jatah cuti tahunan pegawai.
        </span>
      </label>

      <button type="submit" disabled={pending} className="btn btn-primary mt-3">
        {pending ? "Menyimpan..." : "Tetapkan hari libur"}
      </button>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.sukses && <p className="mt-3 text-sm font-semibold text-green">{state.sukses}</p>}
    </form>
  );
}

export function HapusHariLiburForm({ id, tanggal }: { id: string; tanggal: string }) {
  const [state, formAction, pending] = useActionState(hapusHariLiburAction, AWAL);
  // Konfirmasi dua langkah, pola sama dengan pencabutan penanda kendala:
  // confirm() bawaan browser tidak bisa menyebut tanggal mana yang dihapus.
  const [yakin, setYakin] = useState(false);

  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="id" value={id} />
      {!yakin ? (
        <button type="button" onClick={() => setYakin(true)} className="btn btn-ghost text-xs">
          Hapus
        </button>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-xs text-ink-2">Hapus {tanggal} dari kalender?</span>
          <button type="submit" disabled={pending} className="btn btn-danger text-xs">
            {pending ? "..." : "Ya, hapus"}
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

/**
 * Tombol sekali klik di daftar kandidat hasil deteksi.
 *
 * Keterangannya diisi otomatis "Libur nasional" - bisa diperbaiki lewat tombol
 * Ubah. Itu disengaja: menuntut orang mengetik nama harinya dulu sebelum boleh
 * menandai membuat daftar kandidat jadi tidak ada gunanya, padahal justru
 * kandidat itu yang sudah menunjuk tanggalnya.
 */
export function TandaiCepatForm({ tanggal }: { tanggal: string }) {
  const [state, formAction, pending] = useActionState(tambahHariLiburAction, AWAL);
  return (
    <form action={formAction} className="inline-block">
      <input type="hidden" name="tanggal" value={tanggal} />
      <input type="hidden" name="keterangan" value="Libur nasional" />
      <button type="submit" disabled={pending} className="btn btn-primary btn-sm">
        {pending ? "..." : "Tetapkan libur"}
      </button>
      {state.error && <span className="ml-2 text-xs font-medium text-red">{state.error}</span>}
    </form>
  );
}

export function UbahHariLiburForm({
  id,
  tanggal,
  keterangan,
  cutiBersama,
}: {
  id: string;
  tanggal: string;
  keterangan: string;
  cutiBersama: boolean;
}) {
  const [state, formAction, pending] = useActionState(ubahHariLiburAction, AWAL);
  const [buka, setBuka] = useState(false);

  if (!buka) {
    return (
      <button type="button" onClick={() => setBuka(true)} className="btn btn-ghost text-xs">
        Ubah
      </button>
    );
  }

  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="date" name="tanggal" defaultValue={tanggal} required className="field-input mt-0 w-[9.5rem] text-xs" />
      <input
        type="text"
        name="keterangan"
        defaultValue={keterangan}
        required
        minLength={3}
        className="field-input mt-0 w-48 text-xs"
      />
      <label className="inline-flex items-center gap-1 text-xs text-ink-2">
        <input type="checkbox" name="cutiBersama" value="1" defaultChecked={cutiBersama} />
        cuti bersama
      </label>
      <button type="submit" disabled={pending} className="btn btn-primary text-xs">
        {pending ? "..." : "Simpan"}
      </button>
      <button type="button" onClick={() => setBuka(false)} className="btn btn-ghost text-xs">
        Batal
      </button>
      {state.error && <span className="text-xs font-medium text-red">{state.error}</span>}
      {state.sukses && <span className="text-xs font-semibold text-green">{state.sukses}</span>}
    </form>
  );
}
