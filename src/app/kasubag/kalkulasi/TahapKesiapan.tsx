import { RiArrowRightSLine } from "react-icons/ri";
import {
  kalimatAnomali,
  type RingkasKesiapanPegawai,
} from "../../../business-logic/tahapKalkulasiUnit";
import { KepalaTahap } from "./KepalaTahap";
import type { KandidatLaci } from "./PengecualianForm";
import { LaciPengecualian, TombolBukaPengecualian } from "./LaciPengecualian";

export interface SumberTukinTampil {
  /** Label sumber dari ambilSumberData ("e-Presensi", "Belum ada data", ...). */
  sumber: string;
  terisi: number;
  dari: number;
  href: string;
  labelAksi: string;
}

export type KandidatTampil = KandidatLaci;

export interface DikecualikanTampil {
  id: string;
  pegawaiId: string;
  nama: string;
  nip: string;
  alasanKode: string;
  alasan: string;
  penjelasan: string | null;
}

/**
 * TAHAP 1 - ringkasan kesiapan data pegawai & komponen.
 *
 * Tiga kartu: kesiapan pegawai, kelengkapan sumber data Tukin, dan kotak
 * anomali dengan tombol yang membuka laci pengecualian di sisi kanan
 * (`?tinjau=1#kecualikan`). Di bawahnya: daftar pegawai yang sedang
 * dikecualikan (wajib terlihat).
 */
export function TahapKesiapan({
  ringkas,
  presensi,
  predikat,
  jumlahBelumPredikat,
  kandidat,
  hrefTinjau,
  tinjauTerbuka,
  periodeBulan,
  periodeTahun,
  satuanKerja,
  namaBulan,
  dikecualikan,
  terkunci = false,
}: {
  ringkas: RingkasKesiapanPegawai;
  presensi: SumberTukinTampil;
  predikat: SumberTukinTampil;
  jumlahBelumPredikat: number;
  kandidat: readonly KandidatTampil[];
  hrefTinjau: string;
  tinjauTerbuka: boolean;
  periodeBulan: number;
  periodeTahun: number;
  satuanKerja: string;
  namaBulan: string;
  dikecualikan: readonly DikecualikanTampil[];
  /**
   * Rekap sudah dikirim & terkunci: kotak ketiga menyebut yang DIKECUALIKAN
   * (bukan "perlu tinjau"), kotak anomali & laci pengecualian hilang karena
   * daftar pegawainya tidak bisa diubah lagi.
   */
  terkunci?: boolean;
}) {
  const adaAnomali = kandidat.length > 0 && !terkunci;
  const semuaSiap = ringkas.perluTinjau === 0;
  const jumlahKecuali = dikecualikan.length;
  const totalUnit = terkunci ? ringkas.total + jumlahKecuali : ringkas.total;

  return (
    <section id="tahap-1" className="card mt-4 scroll-mt-4 p-4 sm:p-5" aria-labelledby="judul-tahap-1">
      <div id="judul-tahap-1">
        <KepalaTahap nomor={1} judul="Ringkasan Kesiapan Data Pegawai & Komponen" />
      </div>

      <div className={`mt-4 grid gap-3 ${terkunci ? "lg:grid-cols-2" : "lg:grid-cols-3"}`}>
        {/* (1) KESIAPAN PEGAWAI */}
        <div className="rounded-xl border border-line bg-surface-2/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold text-ink-2">Kesiapan Pegawai Unit</h3>
            <span
              className={`rounded-md px-2 py-0.5 font-mono text-[11px] font-bold ${
                semuaSiap && ringkas.total > 0 ? "bg-green-tint text-green" : "bg-gold-tint text-gold-deep"
              }`}
            >
              {ringkas.persenSiap}% Siap
            </span>
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-line bg-surface px-2 py-2.5">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">Total Unit</dt>
              <dd className="mt-0.5 font-mono text-lg font-bold text-ink">{totalUnit}</dd>
            </div>
            <div className="rounded-lg border border-green/20 bg-green-tint px-2 py-2.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-green">Siap Hitung</dt>
              <dd className="mt-0.5 font-mono text-lg font-bold text-green">{ringkas.siap}</dd>
            </div>
            <div className="rounded-lg border border-gold/30 bg-gold-tint px-2 py-2.5">
              <dt className="text-[10px] font-semibold uppercase tracking-wide text-gold-deep">
                {terkunci ? "Dikecualikan" : "Perlu Tinjau"}
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-bold text-gold-deep">
                {terkunci ? jumlahKecuali : ringkas.perluTinjau}
              </dd>
            </div>
          </dl>
          {/* Satu batang dua warna: hijau = siap, oranye = perlu tinjau. */}
          <div
            role="progressbar"
            aria-label="Pegawai siap hitung"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ringkas.persenSiap}
            className="mt-4 flex h-1.5 w-full overflow-hidden rounded-full bg-line"
          >
            <div className="h-full bg-green" style={{ width: `${ringkas.persenSiap}%` }} />
            <div
              className="h-full bg-gold"
              style={{
                width: `${!terkunci && ringkas.total > 0 ? Math.round((ringkas.perluTinjau / ringkas.total) * 100) : 0}%`,
              }}
            />
          </div>
        </div>

        {/* (2) KELENGKAPAN SUMBER DATA TUKIN - tiap baris menaut ke halaman
            pengelolaan sumbernya (dulu tautan "Kelola ..." terpisah). */}
        <div className="rounded-xl border border-line bg-surface-2/60 p-4">
          <h3 className="text-xs font-semibold text-ink-2">Kelengkapan Sumber Data Tukin</h3>
          <ul className="mt-3 space-y-2">
            {[
              {
                s: presensi,
                judul: "Presensi",
                bobot: "30%",
                sub: presensi.sumber,
                subPerhatian: false,
              },
              {
                s: predikat,
                judul: "Predikat Kinerja",
                bobot: "70%",
                sub:
                  jumlahBelumPredikat > 0
                    ? `${jumlahBelumPredikat} belum punya predikat`
                    : terkunci && jumlahKecuali > 0
                      ? `${jumlahKecuali} dikecualikan`
                      : "Lengkap",
                subPerhatian: jumlahBelumPredikat > 0,
              },
            ].map(({ s, judul, bobot, sub, subPerhatian }) => {
              const lengkap = s.terisi >= s.dari && s.dari > 0;
              return (
                <li key={judul}>
                  <a
                    href={s.href}
                    title={s.labelAksi}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 no-underline transition hover:border-biru/50"
                  >
                    <span
                      aria-hidden
                      className={`size-2 shrink-0 rounded-full ${lengkap ? "bg-green" : "bg-gold"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">
                        {judul} <span className="text-xs font-normal text-muted">({bobot})</span>
                      </span>
                      <span className={`block text-[11px] ${subPerhatian ? "text-gold-deep" : "text-muted"}`}>
                        {sub}
                      </span>
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ${
                        lengkap ? "bg-green-tint text-green" : "bg-gold-tint text-gold-deep"
                      }`}
                    >
                      {s.terisi}/{s.dari}
                    </span>
                    <span className="sr-only">{s.labelAksi}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>

        {/* (3) ANOMALI DATA - tidak ada saat terkunci. */}
        {!terkunci && (
        <div
          className={`flex flex-col rounded-xl border p-4 ${
            adaAnomali ? "border-gold/40 bg-gold-tint/60" : "border-green/30 bg-green-tint"
          }`}
        >
          <h3
            className={`text-xs font-extrabold uppercase tracking-wider ${adaAnomali ? "text-gold-deep" : "text-green"}`}
          >
            Anomali Data
          </h3>
          {adaAnomali ? (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{kalimatAnomali(kandidat.length)}</p>
              <div className="mt-auto flex justify-end pt-3">
                <TombolBukaPengecualian
                  href={hrefTinjau}
                  className="inline-flex items-center gap-1 rounded-lg bg-gold px-3.5 py-2 text-sm font-bold text-white no-underline shadow-sm hover:brightness-95"
                >
                  Tinjau &amp; Kecualikan ({kandidat.length})
                  <RiArrowRightSLine aria-hidden className="size-4" />
                </TombolBukaPengecualian>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
                Tidak ada anomali. Semua pegawai punya predikat dan kehadiran tercatat pada periode ini.
              </p>
              {jumlahKecuali > 0 && (
                <div className="mt-auto flex justify-end pt-3">
                  <TombolBukaPengecualian
                    href={hrefTinjau}
                    className="inline-flex items-center gap-1 rounded-lg border border-green/30 bg-surface px-3.5 py-2 text-sm font-bold text-green no-underline hover:border-green"
                  >
                    Lihat yang dikecualikan ({jumlahKecuali})
                    <RiArrowRightSLine aria-hidden className="size-4" />
                  </TombolBukaPengecualian>
                </div>
              )}
            </>
          )}
        </div>
        )}
      </div>

      {/* Daftar "n pegawai dikecualikan" DICABUT (keputusan user 2026-11-16).
          Jejaknya tetap ada: kartu di laci pengecualian (dengan Batalkan),
          chip "dikecualikan" di tabel Tukin, dan kotak Dikecualikan saat
          terkunci. */}

      {/* KECUALIKAN PEGAWAI - laci kanan, terbuka hanya lewat tombol
          "Tinjau & Kecualikan" (atau ?tinjau=1). Lihat LaciPengecualian. */}
      {!terkunci && (adaAnomali || dikecualikan.length > 0) && (
        <LaciPengecualian
          terbukaAwal={tinjauTerbuka}
          satuanKerja={satuanKerja}
          namaBulan={namaBulan}
          periodeBulan={periodeBulan}
          periodeTahun={periodeTahun}
          kandidat={kandidat}
          dikecualikan={dikecualikan}
        />
      )}

    </section>
  );
}
