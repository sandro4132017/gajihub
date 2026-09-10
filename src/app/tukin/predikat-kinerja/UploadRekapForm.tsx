"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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

  // ==========================================================================
  // FILTER HALAMAN IKUT PINDAH KE PERIODE YANG BARU DIUPLOAD.
  //
  // Masalah yang sama dengan sinkronisasi presensi: upload Juli sementara
  // halaman menampilkan Agustus membuat tabel di bawah tetap kosong, dan yang
  // membacanya menyimpulkan uploadnya gagal.
  //
  // SYARATNYA: hasil uploadnya HANYA SATU periode. Satu file e-Kinerja bisa
  // memuat beberapa sheet dengan periode berbeda-beda; kalau begitu, tidak ada
  // satu periode pun yang layak dipilihkan, dan memindahkan filter ke salah
  // satunya justru menyembunyikan yang lain.
  // ==========================================================================
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sudahPindah = useRef<string | null>(null);

  const ringkasanPerPeriode = state.ringkasanPerPeriode;
  useEffect(() => {
    if (!ringkasanPerPeriode || ringkasanPerPeriode.length === 0) return;
    const periodeUnik = [
      ...new Set(ringkasanPerPeriode.map((r) => `${r.periodeBulan}-${r.periodeTahun}`)),
    ];
    if (periodeUnik.length !== 1) return;

    const kunci = periodeUnik[0];
    if (sudahPindah.current === kunci) return;
    sudahPindah.current = kunci;

    const [bulan, tahun] = kunci.split("-");
    if (searchParams.get("bulan") === bulan && searchParams.get("tahun") === tahun) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("bulan", bulan);
    params.set("tahun", tahun);
    params.delete("hal");
    router.replace(`${pathname}?${params.toString()}`);
  }, [ringkasanPerPeriode, pathname, router, searchParams]);

  return (
    <div className="card mt-4 p-5">
      <h2 className="text-base font-bold text-navy">Upload Rekap Penilaian e-Kinerja BKN</h2>
      <p className="mt-1 text-sm text-muted">
        Unggah file Rekap Penilaian e-Kinerja BKN untuk memproses predikat kinerja pegawai. Periode dan unit penilai
        dibaca otomatis dari file.
      </p>

      <form action={formAction} className="mt-3">
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
            {pending ? "Memproses..." : "Upload dan Proses"}
          </button>
        </div>
      </form>

      <p className="mt-2 text-sm text-muted">
        Upload ulang akan memperbarui data yang sesuai dan menambahkan data baru tanpa menghapus data yang sudah ada.
      </p>

      {/*
        Keterangan rinci DILIPAT, bukan dihapus. Isinya menjelaskan perilaku
        yang tidak bisa ditebak dari tampilan (beberapa sheet bulan diproses
        sekaligus, beberapa penilai per unit, file tidak disimpan, predikat
        asing dilewati) - kalau hilang, orang menebaknya sendiri.

        DIPANGKAS 2026-09-10: dua kalimat dicabut karena mengulang yang sudah
        ada di layar. Perilaku upload ulang sudah disebut di paragraf tepat di
        ATAS lipatan ini, dan unit penilai tidak lagi ditampilkan di mana pun
        (permintaan user), jadi menjelaskan cara membacanya cuma memancing
        pertanyaan tentang sesuatu yang memang tidak perlu dipikirkan. Pakai
        <details> bawaan HTML supaya tetap jalan tanpa JavaScript, pola yang
        sama dengan "Cara lain mengisi presensi" di /tukin/presensi.
      */}
      <details className="group mt-3">
        <summary className="cursor-pointer list-none text-sm font-semibold text-teal-deep underline underline-offset-2">
          Selengkapnya soal cara upload ini bekerja
        </summary>
        <div className="mt-2 space-y-2 text-sm text-muted">
          <p>
            Unduh <span className="font-semibold">Rekap Penilaian</span> periode{" "}
            <span className="font-semibold">Bulanan</span> dari portal e-Kinerja BKN. Kalau satu file berisi beberapa
            sheet bulan (Januari, Februari, dst), <span className="font-semibold">semuanya diproses sekaligus</span> -
            tidak perlu dipisah per bulan.
          </p>
          <p>
            <span className="font-semibold text-ink-2">Bisa pilih beberapa file sekaligus.</span> Satu satuan kerja
            sering dinilai lebih dari satu penilai (mis. Subbagian Tata Usaha dan Biro), masing-masing punya file
            sendiri berisi orang yang berbeda - pilih semuanya dalam satu kali upload.
          </p>
          <p>
            File-nya sendiri <span className="font-semibold text-ink-2">tidak disimpan</span> - yang masuk database cuma
            NIP, periode, dan predikatnya. Predikat yang labelnya tidak dikenali akan dilewati dan dilaporkan, bukan
            ditebak.
          </p>
        </div>
      </details>
      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {/* HIJAU HANYA kalau tidak ada unit yang datanya kurang. "Berhasil"
          berwarna hijau tepat di atas peringatan kuning membuat orang berhenti
          membaca di baris pertama - padahal berkasnya memang tersimpan, yang
          kurang justru data yang belum dikirim penilai lain. */}
      {state.success && (
        <p
          className={`mt-3 text-sm font-semibold ${
            state.kelengkapan?.some((k) => k.belumPunya > 0) ? "text-ink-2" : "text-green"
          }`}
        >
          {state.success}
        </p>
      )}

      {/* VERIFIKASI KELENGKAPAN - inti dari upload beberapa file. Muncul
          langsung setelah upload supaya file penilai yang belum masuk
          ketahuan saat itu juga, bukan nanti waktu kalkulasi. */}
      {state.kelengkapan?.map((k) => (
        <div
          key={`${k.periode}-${k.satuanKerja}`}
          className={`mt-3 rounded-lg p-3 text-sm ${
            k.belumPunya === 0 ? "border border-line bg-surface-2" : "border-l-4 border-l-gold bg-gold-tint"
          }`}
        >
          {/* ANGKA KELENGKAPAN DULUAN, baru nama unitnya. Yang dicari orang
              sesudah mengunggah adalah "kurang berapa" - bukan konfirmasi
              nama unit yang barusan dia pilih sendiri. */}
          <p className="text-[15px] font-extrabold text-ink">
            {k.sudahPunya} dari {k.totalAktif} data kinerja ditemukan
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {k.satuanKerja} &middot; periode {k.periode}
            {k.jumlahDikecualikan > 0 && (
              <> &middot; {k.jumlahDikecualikan} pegawai dikecualikan, tidak ikut dihitung</>
            )}
          </p>

          {k.belumPunya > 0 ? (
            <>
              <p className="mt-2.5 font-semibold text-gold-deep">
                <span aria-hidden>&#9888;</span> {k.belumPunya} pegawai belum memiliki predikat kinerja
              </p>
              <p className="mt-0.5 text-xs text-ink-2">
                Periksa kembali data SKP sebelum melanjutkan perhitungan. Kalau unit ini dinilai lebih dari satu
                penilai, kemungkinan besar berkas penilai lain belum diunggah.
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-ink-2">
                {k.contohBelum.map((p) => (
                  <li key={p.nama}>
                    {p.nama}
                    {/* Pejabat pimpinan tinggi ditandai: penilaiannya datang
                        dari penilai di ATAS unit, jadi menagihnya ke penilai
                        unit ini tidak akan pernah menghasilkan berkasnya. */}
                    {p.pejabatPimpinanTinggi && (
                      <span className="ml-1.5 chip chip-wait align-middle">pejabat pimpinan tinggi</span>
                    )}
                  </li>
                ))}
                {k.belumPunya > k.contohBelum.length && (
                  <li className="text-muted">...dan {k.belumPunya - k.contohBelum.length} pegawai lainnya</li>
                )}
              </ul>
            </>
          ) : (
            <p className="mt-2 font-semibold text-green">
              <span aria-hidden>&#10003;</span> Lengkap - semua pegawai yang ikut dihitung periode ini sudah punya
              predikat.
            </p>
          )}

          {k.sumberPenilaian.length > 0 && (
            <p className="mt-2 border-t border-line-2 pt-2 text-xs text-muted">
              Sumber penilaian yang sudah masuk: {k.sumberPenilaian.join(", ")}
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
