import Link from "next/link";
import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { RiArrowRightLine, RiRestaurant2Line, RiSearchLine, RiTimeLine, RiWallet3Line } from "react-icons/ri";
import { PencarianDebounce } from "../../../components/forms/PencarianDebounce";
import type { TabKalkulasi } from "../../../business-logic/tahapKalkulasiUnit";
import { formatRupiah } from "../../../lib/format/rupiah";
import { BantuanRincianTukin } from "./BantuanRincianTukin";
import { KepalaTahap } from "./KepalaTahap";

const TAB: readonly TabKalkulasi[] = ["tukin", "makan", "lembur"];
const IKON_TAB: Record<TabKalkulasi, IconType> = {
  tukin: RiWallet3Line,
  makan: RiRestaurant2Line,
  lembur: RiTimeLine,
};

/**
 * TAHAP 2 - Kalkulasi Pembayaran.
 *
 * Kepala: tombol Hitung (KalkulasiMassalForm, dioper sebagai `aksiHitung`) dan
 * strip peringatan angka basi. Lalu tiga tab (?tab=tukin|makan|lembur),
 * kotak cari (?q=), baris ringkasan tab aktif beserta kontrol "Tandai sudah
 * diperiksa", dan isi tab.
 *
 * PENCARIAN HANYA MENYARING BARIS. Jumlah di tab, total, kesiapan, dan syarat
 * kirim dihitung dari seluruh pegawai aktif oleh halaman - angka yang
 * menentukan boleh-tidaknya rekap dikirim tidak boleh berubah gara-gara orang
 * mengetik di kotak cari.
 */
export function TahapKalkulasi({
  tab,
  tampilRinci,
  kataKunci,
  labelLembur,
  jumlahTab,
  hrefTab,
  hrefRincian,
  hrefRingkas,
  paramForm,
  jumlahPegawaiAktif,
  totalTukinBersih,
  jumlahMakan,
  totalMakan,
  jumlahBasi,
  aksiHitung,
  kontrolVerifikasi,
  isi,
}: {
  tab: TabKalkulasi;
  tampilRinci: boolean;
  kataKunci: string;
  /** "Jam Lembur" selama nominal lembur ditahan, "Uang Lembur" sesudahnya. */
  labelLembur: string;
  jumlahTab: Record<TabKalkulasi, number>;
  hrefTab: Record<TabKalkulasi, string>;
  hrefRincian: string;
  hrefRingkas: string;
  /** Parameter yang dibawa form cari sebagai input tersembunyi (bulan, tahun, satker, tab, ...). */
  paramForm: Record<string, string>;
  jumlahPegawaiAktif: number;
  totalTukinBersih: number;
  jumlahMakan: number;
  totalMakan: number;
  jumlahBasi: number;
  aksiHitung: ReactNode;
  /** Kontrol verifikasi tab aktif; null bila tab itu menaruhnya di dalam tabelnya (lembur). */
  kontrolVerifikasi: ReactNode;
  isi: ReactNode;
}) {
  const label: Record<TabKalkulasi, string> = {
    tukin: "Tunjangan Kinerja (Tukin)",
    makan: "Uang Makan",
    lembur: labelLembur,
  };

  const selebar = (tab === "tukin" && !tampilRinci) || tab === "makan";

  return (
    <section id="tahap-2" className="card mt-4 scroll-mt-4 p-4 sm:p-5" aria-labelledby="judul-tahap-2">
      <div id="judul-tahap-2">
        <KepalaTahap nomor={2} judul="Kalkulasi Pembayaran" />
      </div>

      {/* Peringatan angka basi: angka yang SUDAH dihitung kini kedaluwarsa
          (presensi/predikat berubah sesudahnya). Kartunya cuma muncul kalau
          memang ada yang basi. */}
      {jumlahBasi > 0 && (
        <div className="mt-3 rounded-lg border-l-4 border-l-gold bg-gold-tint p-3 text-xs text-ink-2">
          <p className="text-sm font-semibold text-ink">
            {jumlahBasi} pegawai perlu dihitung ulang - angka Tukin-nya sudah basi.
          </p>
          <p className="mt-1 text-muted">Baris terdampak ditandai kuning. Tekan Hitung sekarang.</p>
        </div>
      )}

      {/* TOMBOL HITUNG - baris aksi di kepala tahap. */}
      {aksiHitung}

      {/* TAB + KOTAK CARI dalam satu baris; tab bergaris bawah. */}
      <div className="mt-4 flex flex-col-reverse gap-3 border-b border-line lg:flex-row lg:items-end lg:justify-between">
        <nav aria-label="Komponen kalkulasi" className="-mb-px">
          <ul className="flex flex-wrap gap-x-6">
            {TAB.map((t) => {
              const aktif = t === tab;
              const Ikon = IKON_TAB[t];
              return (
                <li key={t}>
                  <Link
                    href={hrefTab[t]}
                    aria-current={aktif ? "page" : undefined}
                    className={`inline-flex items-center gap-2 border-b-2 px-1 pb-3 pt-1 text-sm no-underline transition ${
                      aktif
                        ? "border-navy font-bold text-navy"
                        : "border-transparent font-medium text-muted hover:border-line hover:text-ink-2"
                    }`}
                  >
                    <Ikon aria-hidden className="size-4 shrink-0" />
                    {label[t]}
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${
                        aktif ? "bg-biru/15 text-navy" : "bg-surface-2 text-ink-2"
                      }`}
                    >
                      {jumlahTab[t]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* KOTAK CARI - ?q= di URL. Menembak sendiri (debounce); tanpa
            JavaScript, Enter tetap mengirim form ini. */}
        <form
          method="get"
          action="/kasubag/kalkulasi#tahap-2"
          className="relative w-full pb-3 lg:w-80"
          role="search"
        >
          {Object.entries(paramForm).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <PencarianDebounce
            defaultValue={kataKunci}
            placeholder="Cari nama atau NIP pegawai..."
            className="field-input w-full py-2 pr-9 text-sm"
          />
          <button
            type="submit"
            aria-label="Cari"
            className="absolute right-2 top-[calc(50%-0.375rem)] grid size-6 -translate-y-1/2 place-items-center text-muted hover:text-ink"
          >
            <RiSearchLine aria-hidden className="size-4" />
          </button>
        </form>
      </div>

      {/* BARIS RINGKASAN TAB AKTIF */}
      {tab === "tukin" && (
        <div id="rincian-tukin" className="mt-4 flex scroll-mt-4 flex-wrap items-center justify-between gap-3 py-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {/* Ikon bantuan DI SAMPING heading, bukan di dalamnya - lihat
                catatan flow content di BantuanRincianTukin.tsx. */}
            <h3 className="text-sm font-normal text-muted">
              Rincian Tukin ({jumlahPegawaiAktif} pegawai){tampilRinci && " - rincian lengkap"}
            </h3>
            <BantuanRincianTukin tampilRinci={tampilRinci} />
            <span className="text-sm text-muted">
              &bull; Total Bersih:{" "}
              <strong className="font-mono text-base font-bold text-ink">{formatRupiah(totalTukinBersih)}</strong>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {kontrolVerifikasi}
            <Link
              href={tampilRinci ? hrefRingkas : hrefRincian}
              className="inline-flex items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-bold text-white no-underline transition hover:bg-navy-deep"
            >
              {tampilRinci ? "Tampilkan ringkas" : "Lihat rincian lengkap"}
              {!tampilRinci && <RiArrowRightLine aria-hidden className="size-4" />}
            </Link>
          </div>
        </div>
      )}
      {tab === "makan" && (
        <div id="uang-makan" className="mt-4 flex scroll-mt-4 flex-wrap items-center justify-between gap-3 py-1">
          <h3 className="text-sm font-normal text-muted">
            Rincian Uang Makan ({jumlahMakan} pegawai) &bull; Total:{" "}
            <strong className="font-mono text-base font-bold text-ink">{formatRupiah(totalMakan)}</strong>
          </h3>
          {kontrolVerifikasi}
        </div>
      )}

      <div className={selebar ? "-mx-4 mt-3 sm:-mx-5 sm:-mb-5" : "mt-3"}>{isi}</div>
    </section>
  );
}
