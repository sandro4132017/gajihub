import { FiCheckCircle, FiClock, FiExternalLink, FiInbox } from "react-icons/fi";
import { Paginasi, hitungPaginasi } from "../tables/Paginasi";
import { spklHarianSiap } from "../../business-logic/perintahLembur";
import type { BarisDaftarSpklHarian, RekapSpklHarian } from "../../lib/lembur/rekapSpklHarian";
import { tanggalIsoTeks } from "../../lib/lembur/waktuTampil";
import { susunBarisLampiranSpklHarian } from "../../lib/tte/spklHarianPdf";

// ============================================================================
// SPKL HARIAN UNIT - tampilan bersama (Kasubag TU, PPABP/ADMIN lihat-saja, dan
// Pimpinan untuk unitnya sendiri): kartu ringkasan, daftar tanggal ber-perintah,
// rincian per pemberi perintah, tombol buka PDF, dan lampiran di layar.
//
// Murni tampilan: pemanggil yang memuat data, menjaga wewenang, dan memilih
// `basePath` halamannya sendiri. Tombol PDF SELALU ada: sebelum 15.00 WIB
// isinya masih bisa bertambah; PDF-nya sendiri tanpa cap (lihat /berkas/spkl-harian).
// ============================================================================

export interface SpklHarianUnitProps {
  /** Halaman pemanggil, dipakai untuk tautan "Lihat" dan paginasi. */
  basePath: string;
  satuanKerja: string;
  labelPeriode: string;
  daftar: readonly BarisDaftarSpklHarian[];
  /** Pegawai unik (NIP berbeda) di seluruh periode; bukan jumlah orang-hari. */
  jumlahPegawaiUnik: number;
  tanggalDipilih: string | null;
  rekap: RekapSpklHarian | null;
  sekarang: Date;
  /** Parameter dasar URL (bulan, tahun, satker) yang dibawa ke tautan. */
  paramDasar: URLSearchParams;
  hal?: string;
  per?: string;
}

function KartuMetrik({ label, nilai, kuning = false }: { label: string; nilai: number; kuning?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <p className={`mt-1 font-mono text-2xl font-black ${kuning ? "text-gold-deep" : "text-ink"}`}>{nilai}</p>
    </div>
  );
}

export function SpklHarianUnit({
  basePath,
  satuanKerja,
  labelPeriode,
  daftar,
  jumlahPegawaiUnik,
  tanggalDipilih,
  rekap,
  sekarang,
  paramDasar,
  hal,
  per,
}: SpklHarianUnitProps) {
  const baris = rekap && tanggalDipilih ? susunBarisLampiranSpklHarian(rekap.baris, tanggalDipilih) : [];
  const paginasi = hitungPaginasi(baris.length, hal, per);
  const barisHalaman = baris.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams(paramDasar);
  if (tanggalDipilih) paramPaginasi.set("tanggal", tanggalDipilih);

  const totalJam = daftar.reduce((n, d) => n + d.totalJam, 0);
  const jumlahSementara = daftar.filter((d) => !spklHarianSiap(d.tanggalIso, sekarang)).length;

  return (
    <>
      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Ringkasan SPKL harian">
        <KartuMetrik label="Tanggal Perintah" nilai={daftar.length} />
        <KartuMetrik label="Jumlah Pegawai" nilai={jumlahPegawaiUnik} />
        <KartuMetrik label="Total Jam Perintah" nilai={totalJam} />
        <KartuMetrik label="Belum Final" nilai={jumlahSementara} kuning={jumlahSementara > 0} />
      </section>

      <section className="mt-6 space-y-3" aria-labelledby="spkl-daftar">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <h2
            id="spkl-daftar"
            className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-ink"
          >
            <span className="size-2 rounded-full bg-biru" aria-hidden="true" />
            Tanggal Perintah ({daftar.length})
          </h2>
          <span className="text-xs text-muted">
            Periode {labelPeriode}. Perintah lembur masih dapat diterbitkan hingga pukul 15.00 WIB. SPKL belum menggunakan
            tanda tangan elektronik.
          </span>
        </div>
        {daftar.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
              <FiInbox className="size-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-sm font-black text-ink">Belum ada perintah lembur yang diterbitkan</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              Belum ada perintah untuk {labelPeriode} di unit ini. SPKL harian terbentuk otomatis dari perintah yang
              diterbitkan; pilih bulan lain di filter bila perintahnya ada di bulan lain.
            </p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5">No.</th>
                    <th className="px-3 py-2.5">Tanggal</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Pegawai</th>
                    <th className="px-3 py-2.5">Total jam</th>
                    <th className="col-nama px-3 py-2.5">Pemberi Perintah</th>
                    <th className="px-3 py-2.5">Lampiran</th>
                    <th className="px-3 py-2.5">SPKL</th>
                  </tr>
                </thead>
                <tbody>
                  {daftar.map((d, i) => {
                    const siap = spklHarianSiap(d.tanggalIso, sekarang);
                    const linkLampiran = new URLSearchParams(paramDasar);
                    linkLampiran.set("tanggal", d.tanggalIso);
                    const linkPdf = new URLSearchParams({ tanggal: d.tanggalIso, satker: satuanKerja });
                    return (
                      <tr
                        key={d.tanggalIso}
                        className={`border-b border-line-2 align-top ${d.tanggalIso === tanggalDipilih ? "bg-surface-2" : ""}`}
                      >
                        <td className="px-3 py-2.5 font-mono text-xs text-muted">{i + 1}</td>
                        <td className="px-3 py-2.5 font-mono text-ink-2">{tanggalIsoTeks(d.tanggalIso)}</td>
                        <td className="px-3 py-2.5">
                          {/* Dua status saja (keputusan user 2026-11-23): hijau Selesai, kuning Sementara. */}
                          {siap ? (
                            <span className="chip chip-ok">
                              <FiCheckCircle className="size-3.5" aria-hidden="true" />
                              Selesai
                            </span>
                          ) : (
                            <span
                              className="chip chip-wait"
                              title="Perintah masih bisa masuk sampai pukul 15.00 WIB pada hari lemburnya"
                            >
                              <FiClock className="size-3.5" aria-hidden="true" />
                              Sementara
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-ink-2">{d.jumlahPegawai}</td>
                        <td className="px-3 py-2.5 font-mono font-semibold text-ink">{d.totalJam}</td>
                        <td className="col-nama px-3 py-2.5 text-xs text-ink-2">
                          <ul className="space-y-0.5">
                            {d.perPemberi.map((p) => (
                              <li key={p.nama}>{p.nama}</li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-2.5">
                          <a href={`${basePath}?${linkLampiran.toString()}`} className="btn btn-ghost btn-sm">
                            Lihat Lampiran
                          </a>
                        </td>
                        <td className="px-3 py-2.5">
                          <a
                            href={`/berkas/spkl-harian?${linkPdf.toString()}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-sm whitespace-nowrap"
                          >
                            <FiExternalLink className="size-3.5" aria-hidden="true" />
                            Lihat SPKL
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {tanggalDipilih && rekap && (
        <section className="mt-6 space-y-3" aria-labelledby="spkl-lampiran">
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <h2
              id="spkl-lampiran"
              className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-ink"
            >
              <span className="size-2 rounded-full bg-biru" aria-hidden="true" />
              Lampiran Perintah Lembur – {tanggalIsoTeks(tanggalDipilih)}
            </h2>
            <span className="text-xs text-muted">Isi yang sama dengan lampiran di PDF</span>
          </div>
          {baris.length === 0 ? (
            <p className="text-sm text-ink-2">Tidak ada perintah lembur yang diterbitkan pada tanggal ini.</p>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-3 py-2.5">No.</th>
                      <th className="col-nama px-3 py-2.5">Nama / NIP</th>
                      <th className="px-3 py-2.5">Golongan</th>
                      <th className="px-3 py-2.5">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {barisHalaman.map((r, i) => {
                      const [nama, nip] = r[1].split("\n");
                      return (
                        <tr key={`${nip}-${paginasi.mulai + i}`} className="border-b border-line-2 align-top">
                          <td className="px-3 py-2.5 font-mono text-xs text-muted">{r[0]}</td>
                          <td className="col-nama px-3 py-2.5">
                            <span className="font-bold text-ink">{nama}</span>
                            <span className="block font-mono text-xs text-muted">{nip}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="chip chip-draft font-mono">{r[2]}</span>
                          </td>
                          <td className="whitespace-pre-line px-3 py-2.5 text-ink-2">{r[4]}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-line-2 px-4 py-3 sm:px-6">
                <Paginasi
                  basePath={basePath}
                  params={paramPaginasi}
                  info={paginasi}
                  totalBaris={baris.length}
                  labelBaris="pegawai"
                />
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
