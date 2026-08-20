"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { uploadPresensiPdfAction, type UploadPresensiPdfFormState } from "./actionsPdf";
import { NAMA_BULAN } from "../../bulan";

const INITIAL_STATE: UploadPresensiPdfFormState = {};

function periodeTeks(bulan: number, tahun: number) {
  return `${NAMA_BULAN[bulan - 1] ?? bulan} ${tahun}`;
}

export function UploadPresensiPdfForm() {
  const [state, formAction, pending] = useActionState(uploadPresensiPdfAction, INITIAL_STATE);
  const inputRef = useRef<HTMLInputElement>(null);
  const [modeFolder, setModeFolder] = useState(false);
  const [terpilih, setTerpilih] = useState<{ pdf: number; bukanPdf: number; ukuranMb: number } | null>(null);

  // webkitdirectory tidak ada di tipe JSX React, jadi dipasang lewat ref.
  // Tanpa JavaScript, input ini tetap berfungsi sebagai pilih-banyak-file
  // biasa - mode folder saja yang butuh JS.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (modeFolder) el.setAttribute("webkitdirectory", "");
    else el.removeAttribute("webkitdirectory");
    el.value = "";
    setTerpilih(null);
  }, [modeFolder]);

  // Memilih satu folder ikut menyeret semua isinya. File non-PDF dibuang di
  // sini supaya tidak ikut terkirim dan memakan jatah ukuran upload.
  function saatPilihFile(e: React.ChangeEvent<HTMLInputElement>) {
    const semua = Array.from(e.target.files ?? []);
    if (semua.length === 0) {
      setTerpilih(null);
      return;
    }
    const pdf = semua.filter((f) => /\.pdf$/i.test(f.name));
    if (pdf.length !== semua.length && typeof DataTransfer !== "undefined") {
      const dt = new DataTransfer();
      for (const f of pdf) dt.items.add(f);
      e.target.files = dt.files;
    }
    setTerpilih({
      pdf: pdf.length,
      bukanPdf: semua.length - pdf.length,
      ukuranMb: pdf.reduce((a, f) => a + f.size, 0) / 1024 / 1024,
    });
  }

  return (
    <div className="card mt-4 border-l-4 border-l-teal p-4">
      <h2 className="text-sm font-bold text-ink">Upload PDF rekap presensi e-Presensi</h2>
      <p className="mt-1 text-sm text-muted">
        File hasil export <strong>&quot;Laporan Detail Presensi Harian&quot;</strong> dari e-Presensi, apa adanya - tidak
        perlu diketik ulang ke template Excel. Boleh <strong>banyak file sekaligus</strong> atau{" "}
        <strong>satu folder penuh</strong>, dan satu file boleh memuat banyak pegawai. Bulan &amp; tahun dibaca dari isi
        file, jadi periode campuran dalam satu batch tidak masalah.
      </p>

      <form action={formAction} className="mt-3">
        <label className="mb-2 flex w-fit items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={modeFolder}
            onChange={(e) => setModeFolder(e.target.checked)}
            className="h-4 w-4 rounded border-line"
          />
          Pilih satu folder sekaligus (isinya selain PDF otomatis diabaikan)
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <label className="field-label">File PDF presensi</label>
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept="application/pdf,.pdf"
              multiple
              required
              onChange={saatPilihFile}
              className="field-input py-1.5 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink-2"
            />
          </div>
          <button type="submit" disabled={pending} className="btn btn-primary">
            {pending ? "Membaca PDF..." : "Upload & proses"}
          </button>
        </div>
      </form>

      {terpilih && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-semibold text-ink-2">{terpilih.pdf} file PDF</span> terpilih (
          {terpilih.ukuranMb.toFixed(1)} MB)
          {terpilih.bukanPdf > 0 && <> - {terpilih.bukanPdf} file lain diabaikan karena bukan PDF.</>}
        </p>
      )}

      <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
        <p className="font-bold uppercase tracking-wide text-muted">Yang dilakukan sistem terhadap file ini</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>
            Membaca <strong>tanggal, status kerja (WFO/WFH/WFA/Dinas Keluar/Cuti/dst), jam masuk, dan jam pulang</strong>{" "}
            per hari, lalu menjumlahkannya jadi rekap bulanan.
          </li>
          <li>
            <strong>Kolom &quot;Potongan&quot; di PDF diabaikan</strong> - skemanya tidak sesuai Permenaker 15/2024.
            Potongan dihitung ulang dari jam presensi memakai tarif Pasal 13. Yang diambil dari kolom itu hanya penanda
            &quot;lupa presensi&quot;, karena itu fakta yang tidak ada di kolom lain.
          </li>
          <li>
            <strong>Entri ganda dibuang</strong> - e-Presensi menambahkan baris &quot;Tidak Hadir&quot; untuk hari yang
            tidak dipresensi, termasuk saat hari itu sebenarnya cuti/dinas, dan kadang dua kali untuk tanggal yang sama.
          </li>
          <li>
            Jam kerja acuan: masuk <strong>07:30</strong>, pulang <strong>16:00</strong> (Senin-Kamis) /{" "}
            <strong>16:30</strong> (Jumat). Sabtu-Minggu tidak kena potongan apa pun.
          </li>
          <li>
            Lembur diambil <strong>hanya dari baris berstatus &quot;Lembur&quot;</strong>. Pulang malam di hari WFO biasa
            tidak dihitung lembur.
          </li>
          <li>File PDF-nya sendiri tidak disimpan - yang masuk database hanya angkanya.</li>
        </ul>
      </div>

      {state.error && <p className="mt-3 text-sm font-medium text-red">{state.error}</p>}
      {state.success && <p className="mt-3 text-sm font-semibold text-green">{state.success}</p>}

      {state.perPeriode && state.perPeriode.length > 0 && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Tersimpan per periode</p>
          <ul className="mt-1.5 space-y-1 text-ink-2">
            {state.perPeriode.map((p) => (
              <li key={`${p.periodeTahun}-${p.periodeBulan}`}>
                {periodeTeks(p.periodeBulan, p.periodeTahun)}:{" "}
                <span className="font-semibold">{p.jumlahPegawai} pegawai</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.pegawai && state.pegawai.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Hasil pembacaan per pegawai</p>
          <div className="card mt-1.5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-3 py-2">Pegawai</th>
                  <th className="px-3 py-2">Periode</th>
                  <th className="px-3 py-2">WFO + WFH/WFA</th>
                  <th className="px-3 py-2">Dinas / Diklat</th>
                  <th className="px-3 py-2">Alpha</th>
                  <th className="px-3 py-2">Tdk presensi</th>
                  <th className="px-3 py-2">Telat / Plg cepat</th>
                  <th className="px-3 py-2">Lembur</th>
                </tr>
              </thead>
              <tbody>
                {state.pegawai.map((p) => (
                  <tr key={`${p.nip}-${p.periodeTahun}-${p.periodeBulan}`} className="border-b border-line-2 align-top">
                    <td className="col-nama px-3 py-2">
                      <span className="font-semibold text-ink">{p.nama}</span>
                      <span className="block font-mono text-xs text-muted">{p.nip}</span>
                      <span className="block text-xs text-muted">{p.satuanKerja}</span>
                    </td>
                    <td className="px-3 py-2 text-ink-2">
                      {periodeTeks(p.periodeBulan, p.periodeTahun)}
                      <span className="block text-xs text-muted">
                        {p.jumlahHariDetail} hari terbaca / {p.jumlahHariKerja} hari kerja
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-semibold text-ink">
                      {p.jumlahHariWfo + p.jumlahHariWfhWfa} hari
                    </td>
                    <td className="px-3 py-2 font-mono text-muted">
                      {p.jumlahHariDinasLuar} / {p.jumlahHariDiklat}
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-2">{p.jumlahHariAlpha}</td>
                    <td className="px-3 py-2 font-mono text-ink-2">{p.jumlahTidakPresensi}x</td>
                    <td className="px-3 py-2 font-mono text-ink-2">
                      {p.totalMenitTerlambat} / {p.totalMenitPulangCepat} mnt
                    </td>
                    <td className="px-3 py-2 font-mono text-ink-2">
                      {p.totalJamLembur} jam
                      {p.totalJamLemburHariLibur > 0 && (
                        <span className="block text-xs font-semibold text-gold-deep">
                          + {p.totalJamLemburHariLibur} jam hari libur (2x)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.jumlahDetailTidakDitampilkan ? (
            <p className="mt-1 text-xs text-muted">
              Menampilkan {state.pegawai.length} dari {state.jumlahPegawaiTersimpan} pegawai yang tersimpan.
            </p>
          ) : null}

          {state.pegawai.some((p) => p.catatan.length > 0 || p.selisihRingkasan.length > 0) && (
            <details className="card mt-2 p-3">
              <summary className="cursor-pointer text-sm font-bold text-ink">
                Catatan yang perlu dicek manusia (
                {state.pegawai.reduce((a, p) => a + p.catatan.length + (p.selisihRingkasan.length > 0 ? 1 : 0), 0)})
              </summary>
              <ul className="mt-2 space-y-3 text-sm">
                {state.pegawai
                  .filter((p) => p.catatan.length > 0 || p.selisihRingkasan.length > 0)
                  .map((p) => (
                    <li key={`${p.nip}-${p.periodeTahun}-${p.periodeBulan}-catatan`}>
                      <span className="font-semibold text-ink">{p.nama}</span>{" "}
                      <span className="text-xs text-muted">
                        ({periodeTeks(p.periodeBulan, p.periodeTahun)} - {p.namaFile})
                      </span>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
                        {p.catatan.map((c, idx) => (
                          <li key={idx}>{c}</li>
                        ))}
                        {p.selisihRingkasan.length > 0 && (
                          <li>
                            Beda dengan &quot;Summary Presensi&quot; bawaan PDF:{" "}
                            {p.selisihRingkasan
                              .map((s) => `${s.label} (PDF ${s.sumberPdf}, Gajihub ${s.gajihub})`)
                              .join("; ")}
                            . Yang dipakai adalah hitungan dari tabel detail.
                          </li>
                        )}
                      </ul>
                    </li>
                  ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {state.dilewati && state.dilewati.length > 0 && (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2">
          <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">Yang dilewati</p>
          <ul className="mt-1.5 space-y-1 text-sm text-ink-2">
            {state.dilewati.map((d) => (
              <li key={d.alasan}>
                <span className="font-semibold">{d.jumlah}</span> - {d.alasan}
                {d.contoh.length > 0 && <span className="text-muted"> (mis. {d.contoh.join(", ")})</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.perluHitungUlang ? (
        <div className="mt-3 rounded-lg bg-gold-tint px-3 py-2 text-sm text-ink-2">
          <span className="font-semibold">{state.perluHitungUlang} pegawai</span> sudah punya kalkulasi Tukin di periode
          yang barusan diupload, dibuat SEBELUM presensi ini masuk - komponen kehadirannya masih memakai data lama.
          Hitung ulang lewat{" "}
          <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
            Kalkulasi
          </Link>
          . Ingat, menghitung ulang mereset siklus approval yang sudah jalan ke DRAFT.
        </div>
      ) : null}
    </div>
  );
}
