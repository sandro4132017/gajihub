"use client";

import Link from "next/link";
import { useActionState } from "react";
import { uploadRekapPredikatAction, type UploadRekapPredikatFormState } from "./actions";
import { NAMA_BULAN } from "../../bulan";

const INITIAL_STATE: UploadRekapPredikatFormState = {};

/**
 * Form ini SENGAJA tidak meminta pernyataan periode/unit/penilai sebelum
 * upload. Semuanya diturunkan dari isi file - periode dari baris kepala tiap
 * sheet, unit dari lookup NIP ke tabel Pegawai, penilai dari baris kedua
 * kepala file. Kewenangan tetap dicek PER BARIS di action terhadap satuan
 * kerja pegawainya, jadi file unit lain tetap tidak bisa ditulis walaupun
 * tidak ada dropdown yang menghadangnya di depan.
 */
export function UploadRekapForm() {
  const [state, formAction, pending] = useActionState(uploadRekapPredikatAction, INITIAL_STATE);

  return (
    <div className="card mt-4 p-4">
      <h2 className="text-sm font-bold text-ink">Upload Rekap Penilaian e-Kinerja BKN</h2>
      <p className="mt-1 text-sm text-muted">
        Unduh <span className="font-semibold">Rekap Penilaian</span> periode <span className="font-semibold">Bulanan</span>{" "}
        dari portal e-Kinerja BKN, lalu upload filenya di sini. Periode diambil dari isi file, jadi tidak perlu dipilih
        manual. Kalau satu file berisi beberapa sheet bulan (Januari, Februari, dst),{" "}
        <span className="font-semibold">semuanya diproses sekaligus</span> - tidak perlu dipisah per bulan.
      </p>
      <p className="mt-1.5 text-sm text-muted">
        <span className="font-semibold text-ink-2">Bisa pilih beberapa file sekaligus.</span> Satu satuan kerja sering
        dinilai lebih dari satu penilai (mis. Subbagian Tata Usaha dan Biro), masing-masing punya file sendiri berisi
        orang yang berbeda - pilih semuanya dalam satu kali upload. Unit penilainya dibaca dari isi file, tidak perlu
        kamu tandai sendiri.
      </p>

      <form action={formAction} className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            name="file"
            multiple
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
            required
            className="field-input py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-2"
          />
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Memproses..." : "Upload & proses"}
          </button>
        </div>
      </form>

      <p className="mt-2 text-xs text-muted">
        File-nya sendiri TIDAK disimpan - yang masuk database cuma NIP, periode, dan predikatnya. Predikat yang labelnya
        tidak dikenali akan dilewati dan dilaporkan, bukan ditebak. Kalau ada typo, cukup perbaiki di Excel lalu upload
        ulang: nilainya tertimpa berdasarkan NIP + periode, tidak perlu menghapus siapa pun dulu.
      </p>
      <p className="mt-1 text-xs text-muted">
        Upload ulang file yang sama <span className="font-semibold text-ink-2">tidak menghapus apa pun</span>: pegawai
        yang sudah punya predikat nilainya ditulis ulang dengan isi yang sama, pegawai yang belum punya ditambahkan, dan
        pegawai yang tidak ada di file tidak disentuh. Jadi file penilai kedua bisa menyusul kapan saja.
      </p>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {/* VERIFIKASI KELENGKAPAN - inti dari upload beberapa file. Muncul
          langsung setelah upload supaya file penilai yang belum masuk
          ketahuan saat itu juga, bukan nanti waktu kalkulasi. */}
      {state.kelengkapan?.map((k) => (
        <div
          key={`${k.periode}-${k.satuanKerja}`}
          className={`mt-3 rounded-lg p-3 text-sm ${
            k.belumPunya === 0 ? "border border-line bg-surface-2" : "bg-gold-tint"
          }`}
        >
          <p className="font-semibold text-ink">
            {k.satuanKerja} - periode {k.periode}
          </p>
          <p className="mt-1 text-ink-2">
            <span className="font-semibold">
              {k.sudahPunya} / {k.totalAktif}
            </span>{" "}
            pegawai aktif sudah punya predikat kinerja.
          </p>
          {k.sumberPenilaian.length > 0 && (
            <p className="mt-1 text-xs text-muted">
              Sumber penilaian yang sudah masuk: {k.sumberPenilaian.join(", ")}
            </p>
          )}

          {k.belumPunya > 0 ? (
            <>
              <p className="mt-2 text-ink-2">
                <span className="font-semibold">{k.belumPunya} pegawai belum punya predikat.</span> Kalau unit ini
                dinilai lebih dari satu penilai, kemungkinan besar filenya belum semua diupload.
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-ink-2">
                {k.contohBelum.map((nama) => (
                  <li key={nama}>{nama}</li>
                ))}
                {k.belumPunya > k.contohBelum.length && (
                  <li className="text-muted">...dan {k.belumPunya - k.contohBelum.length} pegawai lainnya</li>
                )}
              </ul>
            </>
          ) : (
            <p className="mt-2 text-sm font-semibold text-green">
              Lengkap - semua pegawai aktif unit ini sudah punya predikat, siap dihitung.
            </p>
          )}
        </div>
      ))}

      {state.ringkasanPerPeriode && state.ringkasanPerPeriode.length > 0 && (
        <div className="mt-3 space-y-2">
          {state.ringkasanPerPeriode.map((r) => (
            <div
              key={`${r.namaSheet}-${r.periodeBulan}-${r.periodeTahun}`}
              className="rounded-lg border border-line bg-surface-2 p-3 text-sm"
            >
              <p className="text-ink-2">
                <span className="font-semibold text-ink">
                  {NAMA_BULAN[r.periodeBulan - 1] ?? r.periodeBulan} {r.periodeTahun}
                </span>
                <span className="text-muted"> - {r.namaSheet}</span>
                {r.unitPenilaian && (
                  <span className="text-muted"> - penilai: {r.unitPenilaian}</span>
                )}
              </p>
              <ul className="mt-1.5 space-y-1 text-ink-2">
                {r.perSatuanKerja.map((s) => (
                  <li key={s.satuanKerja}>
                    {s.satuanKerja}: <span className="font-semibold">{s.jumlah} pegawai</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-ink-2">
                Sebaran predikat: {r.perPredikat.map((p) => `${p.predikat} (${p.jumlah})`).join(", ")}
              </p>
            </div>
          ))}
        </div>
      )}

      {state.sheetDilewati && state.sheetDilewati.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Sheet yang dilewati</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.sheetDilewati.map((s) => (
              <li key={s.namaSheet}>
                <span className="font-semibold">{s.namaSheet}</span> - {s.alasan}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.dilewati && state.dilewati.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Baris yang dilewati</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.dilewati.map((d) => (
              <li key={d.alasan}>
                <span className="font-semibold">{d.jumlah} baris</span> - {d.alasan}
                {d.contohNip.length > 0 && <span className="text-muted"> (mis. {d.contohNip.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.perluHitungUlang && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Kalkulasi Tukin perlu dihitung ulang</p>
          <p className="mt-1.5 text-sm text-ink-2">
            Pegawai berikut sudah punya kalkulasi Tukin untuk periode ini, yang dibuat SEBELUM predikat barusan masuk -
            jadi komponen kinerja 70%-nya masih memakai nilai lama:
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.perluHitungUlang.map((s) => (
              <li key={`${s.periode}-${s.satuanKerja}`}>
                <span className="font-semibold">{s.periode}</span> - {s.satuanKerja}:{" "}
                <span className="font-semibold">{s.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs text-muted">
            Hitung ulang lewat{" "}
            <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
              Kalkulasi Unit
            </Link>
            . Ingat: menghitung ulang MERESET status approval yang sudah jalan ke DRAFT - lakukan kalau memang
            predikatnya berubah, bukan sebagai rutinitas.
          </p>
        </div>
      )}
    </div>
  );
}
