"use client";

import { useActionState } from "react";
import Link from "next/link";
import { rekonsiliasiAbsensiAction, type RekonsiliasiFormState } from "./actions";
import { NAMA_BULAN } from "../../../bulan";
import type { BedaHarian, HasilBandingPegawai } from "../../../../business-logic/bandingRekapPresensi";

const AWAL: RekonsiliasiFormState = {};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const LABEL_JENIS: Record<BedaHarian["jenis"], string> = {
  STATUS: "Status berbeda",
  JAM_MASUK: "Jam masuk berbeda",
  JAM_KELUAR: "Jam pulang berbeda",
  HANYA_PETUGAS: "Hanya ada di berkas petugas",
  HANYA_GAJIHUB: "Hanya ada di Gajihub",
};

function tanggalPendek(iso: string) {
  const [, b, t] = iso.split("-");
  return `${t} ${NAMA_BULAN[Number(b) - 1]?.slice(0, 3) ?? b}`;
}

function KartuPegawai({ p }: { p: HasilBandingPegawai }) {
  const berdampak = p.bedaHarian.filter((b) => b.berdampak);
  const kosmetik = p.bedaHarian.length - berdampak.length;

  return (
    <details className="card p-4 open:pb-5">
      <summary className="cursor-pointer list-none">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="min-w-0">
            <p className="truncate font-bold text-ink" title={p.nama}>
              {p.nama}
            </p>
            <p className="text-xs text-muted">
              {p.nip} &middot; {p.satuanKerja}
              {p.kelasJabatan !== null && <> &middot; kelas {p.kelasJabatan}</>}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {berdampak.length > 0 && (
              <span className="chip chip-danger">{berdampak.length} beda berdampak</span>
            )}
            {kosmetik > 0 && <span className="chip">{kosmetik} tidak berdampak</span>}
            {p.bedaHarian.length === 0 && p.bedaAngka.length === 0 && (
              <span className="chip chip-ok">cocok semua</span>
            )}
            {p.selisihRupiah !== null && p.selisihRupiah !== 0 && (
              <span className={p.selisihRupiah > 0 ? "font-bold text-red" : "font-bold text-teal-deep"}>
                {p.selisihRupiah > 0 ? "+" : ""}
                {rupiah(p.selisihRupiah)}
              </span>
            )}
            {p.selisihRupiah === null && (
              <span className="text-xs text-muted">kelas jabatan tidak diketahui</span>
            )}
          </div>
        </div>
      </summary>

      <div className="mt-4 space-y-4 border-t border-line pt-4">
        <p className="text-sm text-muted">
          Potongan kehadiran menurut berkas petugas{" "}
          <strong className="text-ink">{p.potonganPersenPetugas.toFixed(2)}%</strong>, menurut Gajihub{" "}
          <strong className="text-ink">{p.potonganPersenGajihub.toFixed(2)}%</strong>. Dibandingkan{" "}
          {p.jumlahHariDibandingkan} hari (berkas {p.jumlahHariPetugas} hari, Gajihub {p.jumlahHariGajihub} hari).
        </p>

        {p.bedaAngka.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Angka rekap</th>
                  <th className="py-1.5 pr-3 font-semibold">Petugas</th>
                  <th className="py-1.5 pr-3 font-semibold">Gajihub</th>
                </tr>
              </thead>
              <tbody>
                {p.bedaAngka.map((a) => (
                  <tr key={a.label} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3">{a.label}</td>
                    <td className="py-1.5 pr-3 font-mono">{a.petugas}</td>
                    <td className="py-1.5 pr-3 font-mono">{a.gajihub}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {p.bedaHarian.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-semibold">Tanggal</th>
                  <th className="py-1.5 pr-3 font-semibold">Beda</th>
                  <th className="py-1.5 pr-3 font-semibold">Petugas</th>
                  <th className="py-1.5 pr-3 font-semibold">Gajihub</th>
                </tr>
              </thead>
              <tbody>
                {p.bedaHarian.map((b, i) => (
                  <tr key={`${b.tanggalIso}-${b.jenis}-${i}`} className="border-b border-line/60 last:border-0">
                    <td className="py-1.5 pr-3 whitespace-nowrap font-mono text-xs">
                      {tanggalPendek(b.tanggalIso)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={b.berdampak ? "font-semibold text-ink" : "text-muted"}>
                        {LABEL_JENIS[b.jenis]}
                      </span>
                      {!b.berdampak && <span className="ml-1.5 chip">tidak berdampak</span>}
                      <span className="block text-xs leading-snug text-muted">{b.keterangan}</span>
                    </td>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-mono text-xs">{b.petugas}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap font-mono text-xs">{b.gajihub}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

export function RekonsiliasiForm() {
  const [state, formAction, pending] = useActionState(rekonsiliasiAbsensiAction, AWAL);
  const r = state.ringkasan;

  return (
    <>
      <form action={formAction} className="card mt-6 p-5">
        <label className="block text-sm font-semibold text-ink" htmlFor="file-rekon">
          Berkas rekap absensi petugas (.xlsx)
        </label>
        <p className="mt-1 text-sm text-muted">
          Sheet yang dibaca adalah <strong>Master Presensi</strong> (rincian harian). Sheet lain diabaikan.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input
            id="file-rekon"
            type="file"
            name="file"
            accept=".xlsx,.xls"
            required
            className="field-input max-w-md py-2"
          />
          <button type="submit" disabled={pending} className="btn btn-primary px-4 py-2.5">
            {pending ? "Membandingkan..." : "Bandingkan"}
          </button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Berkasnya <strong>tidak disimpan</strong> dan halaman ini <strong>tidak mengubah data apa pun</strong> -
          cuma menyandingkan dua sumber. Perbaikannya lewat jalur yang sudah ada.
        </p>
      </form>

      {state.error && (
        <p className="mt-4 rounded-lg border border-red/40 bg-red-tint p-3 text-sm text-red">{state.error}</p>
      )}

      {state.catatanBerkas && state.catatanBerkas.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-lg border border-gold/40 bg-gold-tint p-3 text-sm text-gold-deep">
          {state.catatanBerkas.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      )}

      {state.dilewati && state.dilewati.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-surface-2 p-3">
          <p className="text-sm font-semibold text-ink">Tidak ikut dibandingkan</p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted">
            {state.dilewati.map((d) => (
              <li key={d.alasan}>
                <strong className="text-ink">{d.jumlah}</strong> - {d.alasan}
                <span className="block text-xs">({d.contoh.join("; ")}{d.jumlah > d.contoh.length ? ", dst" : ""})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Pegawai dibandingkan</p>
              <p className="mt-1 text-2xl font-extrabold text-navy">{r.jumlahPegawai}</p>
              <p className="text-xs text-muted">{r.jumlahHariDibandingkan.toLocaleString("id-ID")} hari</p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Cocok sepenuhnya</p>
              <p className="mt-1 text-2xl font-extrabold text-teal-deep">{r.jumlahPegawaiIdentik}</p>
              <p className="text-xs text-muted">tidak ada beda sama sekali</p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Beda berdampak</p>
              <p className="mt-1 text-2xl font-extrabold text-red">{r.jumlahBedaBerdampak}</p>
              <p className="text-xs text-muted">+{r.jumlahBedaTidakBerdampak} tidak menggeser rupiah</p>
            </div>
            <div className="card p-4">
              <p className="text-xs uppercase tracking-wide text-muted">Taruhan rupiah</p>
              <p className="mt-1 text-2xl font-extrabold text-navy">
                {rupiah(r.totalSelisihRupiahMutlak)}
              </p>
              <p className="text-xs text-muted">
                jumlah mutlak, bukan selisih bersih
                {r.jumlahTanpaKelasJabatan > 0 && <> &middot; {r.jumlahTanpaKelasJabatan} tanpa kelas jabatan</>}
              </p>
            </div>
          </div>

          <p className="mt-4 text-sm text-muted">
            Berkas <strong className="text-ink">{state.namaFile}</strong>, sheet{" "}
            <strong className="text-ink">{state.namaSheet}</strong>
            {state.periode && state.periode.length > 0 && (
              <>
                {" "}
                &middot; periode{" "}
                {state.periode.map((p) => `${NAMA_BULAN[p.bulan - 1]} ${p.tahun}`).join(", ")}
              </>
            )}
            . Selisih rupiah bertanda <strong className="text-red">+</strong> berarti Gajihub membayar{" "}
            <strong>lebih besar</strong> daripada hitungan petugas.
          </p>

          {r.jumlahBedaBerdampak > 0 && (
            <div className="mt-4 rounded-lg border border-gold/40 bg-gold-tint p-4 text-sm leading-relaxed text-gold-deep">
              <p className="font-bold">Perbaikannya BUKAN di halaman ini.</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5">
                <li>
                  Jam pulang Gajihub 23:59 sementara petugas sudah mengisi manual - itu tap pulang yang hilang.
                  Kalau penyebabnya gangguan sistem, tandai tanggalnya di{" "}
                  <Link href="/tukin/presensi/kendala" className="font-semibold underline">
                    Data e-Presensi Bermasalah
                  </Link>{" "}
                  lalu koreksi jamnya per pegawai - sekali tandai berlaku untuk semua orang.
                </li>
                <li>
                  Status berbeda (mis. WFO lawan Dinas Luar) harus dibetulkan di <strong>e-Presensi</strong>,
                  lalu tarik ulang presensi periode itu. Gajihub hanya membaca, tidak pernah menulis ke sana.
                </li>
                <li>Sesudah diperbaiki, jalankan lagi perbandingan ini sampai daftar berdampaknya kosong.</li>
              </ul>
            </div>
          )}

          {r.perJenis.length > 0 && (
            <div className="card mt-4 overflow-x-auto p-4">
              <table className="w-full min-w-[24rem] text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-muted">
                    <th className="py-1.5 pr-3 font-semibold">Jenis beda</th>
                    <th className="py-1.5 pr-3 font-semibold">Berdampak</th>
                    <th className="py-1.5 pr-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {r.perJenis.map((j) => (
                    <tr key={j.jenis} className="border-b border-line/60 last:border-0">
                      <td className="py-1.5 pr-3">{LABEL_JENIS[j.jenis]}</td>
                      <td className="py-1.5 pr-3 font-mono font-semibold">{j.berdampak}</td>
                      <td className="py-1.5 pr-3 font-mono text-muted">{j.jumlah}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2 className="mt-8 text-lg font-extrabold tracking-tight text-navy">
            Rincian per pegawai
            <span className="ml-2 text-sm font-normal text-muted">
              diurutkan dari taruhan rupiah terbesar
            </span>
          </h2>
          <div className="mt-3 space-y-2">
            {state.pegawai?.map((p) => <KartuPegawai key={p.nip} p={p} />)}
          </div>
          {state.jumlahTidakDitampilkan ? (
            <p className="mt-3 text-sm text-muted">
              {state.jumlahTidakDitampilkan} pegawai lain tidak ditampilkan (dibatasi supaya halaman tetap
              bisa dibuka). Mereka ada di urutan bawah, jadi taruhan rupiahnya paling kecil.
            </p>
          ) : null}
        </>
      )}
    </>
  );
}
