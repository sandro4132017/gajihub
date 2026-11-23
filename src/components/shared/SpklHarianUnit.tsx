import { FiExternalLink, FiLock, FiUnlock } from "react-icons/fi";
import { Paginasi, hitungPaginasi } from "../tables/Paginasi";
import { spklHarianSiap, spklHarianTerkunci } from "../../business-logic/perintahLembur";
import type { BarisDaftarSpklHarian, RekapSpklHarian } from "../../lib/lembur/rekapSpklHarian";
import { tanggalIsoTeks } from "../../lib/lembur/waktuTampil";
import { susunBarisLampiranSpklHarian } from "../../lib/tte/spklHarianPdf";

// ============================================================================
// SPKL HARIAN UNIT - tampilan bersama (Kasubag TU, PPABP/ADMIN lihat-saja, dan
// Pimpinan untuk unitnya sendiri): daftar tanggal ber-perintah, rincian per
// pemberi perintah, tombol buka PDF, dan lampiran di layar.
//
// Murni tampilan: pemanggil yang memuat data, menjaga wewenang, dan memilih
// `basePath` halamannya sendiri. Tombol PDF SELALU ada: sebelum 15.00 WIB
// dokumen dibuka berlabel SEMENTARA (lihat /berkas/spkl-harian).
// ============================================================================

export interface SpklHarianUnitProps {
  /** Halaman pemanggil, dipakai untuk tautan "Lihat" dan paginasi. */
  basePath: string;
  satuanKerja: string;
  labelPeriode: string;
  daftar: readonly BarisDaftarSpklHarian[];
  tanggalDipilih: string | null;
  rekap: RekapSpklHarian | null;
  sekarang: Date;
  /** Parameter dasar URL (bulan, tahun, satker) yang dibawa ke tautan. */
  paramDasar: URLSearchParams;
  hal?: string;
  per?: string;
}

export function SpklHarianUnit({
  basePath,
  satuanKerja,
  labelPeriode,
  daftar,
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

  return (
    <>
      <div className="mt-4 border-l-4 border-l-gold bg-gold-tint px-4 py-3 text-sm text-ink-2" role="status">
        Perintah lembur masih bisa masuk sampai pukul 15.00 WIB pada hari lemburnya. SPKL yang dibuka sebelum itu
        berlabel <strong className="font-bold text-ink">SEMENTARA</strong> dan isinya bisa bertambah; sesudahnya
        final. Belum memakai tanda tangan elektronik.
      </div>

      <section className="mt-6" aria-labelledby="spkl-daftar">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="spkl-daftar" className="text-base font-bold text-ink">
            Tanggal ber-perintah
          </h2>
          <span className="text-xs text-muted">
            {daftar.length} tanggal pada {labelPeriode}
          </span>
        </div>
        <div className="card mt-2 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Pegawai</th>
                  <th className="px-3 py-2.5">Total jam</th>
                  <th className="col-nama px-3 py-2.5">Per pemberi perintah</th>
                  <th className="px-3 py-2.5">Lampiran</th>
                  <th className="px-3 py-2.5">SPKL</th>
                </tr>
              </thead>
              <tbody>
                {daftar.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-muted">
                      Belum ada perintah lembur terkirim untuk {labelPeriode} di unit ini. SPKL harian dibentuk
                      otomatis dari perintah yang dikirim; pilih bulan lain di filter bila perintahnya ada di bulan
                      lain.
                    </td>
                  </tr>
                )}
                {daftar.map((d, i) => {
                  const kunci = spklHarianTerkunci(d.tanggalIso, sekarang);
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
                        {kunci ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-2">
                            <FiLock className="size-3.5" aria-hidden="true" />
                            Terkunci
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-gold-deep">
                            <FiUnlock className="size-3.5" aria-hidden="true" />
                            Terbuka
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-ink-2">{d.jumlahPegawai}</td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-ink">{d.totalJam}</td>
                      <td className="col-nama px-3 py-2.5 text-xs text-ink-2">
                        <ul className="space-y-0.5">
                          {d.perPemberi.map((p) => (
                            <li key={p.nama}>
                              {p.nama}:{" "}
                              <span className="font-mono text-ink">
                                {p.jumlahPegawai} pegawai, {p.totalJam} jam
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2.5">
                        <a href={`${basePath}?${linkLampiran.toString()}`} className="font-semibold text-teal-deep underline">
                          Lihat
                        </a>
                      </td>
                      <td className="px-3 py-2.5">
                        <a
                          href={`/berkas/spkl-harian?${linkPdf.toString()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 whitespace-nowrap font-semibold text-teal-deep underline"
                        >
                          <FiExternalLink className="size-3.5" aria-hidden="true" />
                          {siap ? "Buka" : "Buka (sementara)"}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {tanggalDipilih && rekap && (
        <section className="mt-6" aria-labelledby="spkl-lampiran">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="spkl-lampiran" className="text-base font-bold text-ink">
              Lampiran {tanggalIsoTeks(tanggalDipilih)}
            </h2>
            <span className="text-xs text-muted">Isi yang sama dengan lampiran di PDF</span>
          </div>
          {baris.length === 0 ? (
            <p className="mt-2 text-sm text-ink-2">Tidak ada perintah lembur terkirim pada tanggal ini.</p>
          ) : (
            <div className="card mt-2 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                      <th className="px-3 py-2.5">No.</th>
                      <th className="col-nama px-3 py-2.5">Nama / NIP</th>
                      <th className="px-3 py-2.5">Gol.</th>
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
                            <span className="font-semibold text-ink">{nama}</span>
                            <span className="block font-mono text-xs text-muted">{nip}</span>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-ink-2">{r[2]}</td>
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
