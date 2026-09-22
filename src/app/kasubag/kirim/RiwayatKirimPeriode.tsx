import Link from "next/link";
import { cacahPeriode } from "../../../business-logic/pengirimanUnit";
import type { KeadaanPeriode, PeriodeUnit } from "../../../business-logic/pengirimanUnit";
import { NAMA_BULAN } from "../../bulan";

/**
 * Riwayat pengiriman rekap SATU unit di SELURUH periode yang datanya ada.
 *
 * SISI SEBERANG DARI PapanProgres. Papan itu menjawab pertanyaan PPABP -
 * "unit mana yang belum kirim bulan ini"; panel ini menjawab pertanyaan
 * Kasubag TU - "periode mana yang sudah saya kirim, mana yang belum".
 *
 * Sebelum ada panel ini, satu-satunya cara menjawabnya mengganti filter
 * periode satu per satu lalu mengingat hasilnya. Periode yang tidak dibuka
 * tidak pernah terlihat - dan periode lama yang terlewat justru yang paling
 * mungkin terlupakan, karena tidak ada yang menagihnya dari layar mana pun.
 */

const LABEL: Record<KeadaanPeriode, string> = {
  TERKIRIM: "Terkirim",
  DIKEMBALIKAN: "Dikembalikan",
  BELUM_KIRIM: "Belum kirim",
  BELUM_DIHITUNG: "Belum dihitung",
};

const WARNA: Record<KeadaanPeriode, string> = {
  TERKIRIM: "chip-ok",
  DIKEMBALIKAN: "chip-wait",
  BELUM_KIRIM: "chip-draft",
  BELUM_DIHITUNG: "chip-draft",
};

/**
 * Apa yang harus dikerjakan, per keadaan - bukan sekadar mengulang labelnya.
 *
 * "Belum kirim" dan "Belum dihitung" dua-duanya abu-abu dan dua-duanya
 * berarti belum selesai, tapi yang satu tinggal menekan tombol dan yang satu
 * lagi harus menjalankan kalkulasi lebih dulu. Kalau bedanya cuma di chip,
 * orang harus membuka periodenya untuk tahu mana yang mana.
 */
const TINDAKAN: Record<KeadaanPeriode, string | null> = {
  TERKIRIM: null,
  DIKEMBALIKAN: "Perbaiki lalu kirim ulang",
  BELUM_KIRIM: "Tinggal ditekan Kirim",
  BELUM_DIHITUNG: "Jalankan kalkulasi dulu",
};

function tanggalTeks(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

export function RiwayatKirimPeriode({
  riwayat,
  satuanKerja,
}: {
  riwayat: readonly PeriodeUnit[];
  satuanKerja: string;
}) {
  const cacah = cacahPeriode(riwayat);
  const belum = cacah.BELUM_KIRIM + cacah.BELUM_DIHITUNG + cacah.DIKEMBALIKAN;

  return (
    <section className="card mt-6 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-sm font-bold text-ink">Riwayat pengiriman per periode</h2>
          <p className="mt-0.5 text-xs text-muted">{satuanKerja}</p>
        </div>
        {/* Kalimatnya memakai CACAH, bukan persen: yang menagih pekerjaan
            bekerja dengan jumlah periode. "3 dari 8" langsung bisa dipakai di
            kalimat berikutnya; "38%" harus dihitung balik dulu. */}
        <span className="text-xs font-semibold text-muted">
          {cacah.TERKIRIM} dari {riwayat.length} periode sudah dikirim
          {belum > 0 && <span className="ml-1 font-bold text-gold-deep">· {belum} belum beres</span>}
        </span>
      </div>

      {riwayat.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted sm:px-6">
          Belum ada periode yang datanya masuk untuk unit ini.
        </p>
      ) : (
        <TabelRiwayat riwayat={riwayat} satuanKerja={satuanKerja} />
      )}
    </section>
  );
}

function TabelRiwayat({
  riwayat,
  satuanKerja,
}: {
  riwayat: readonly PeriodeUnit[];
  satuanKerja: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
            <th className="px-3 py-2.5">Periode</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Kalkulasi</th>
            <th className="px-3 py-2.5">Dikirim</th>
            <th className="px-3 py-2.5">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          {riwayat.map((p) => {
            const q = `?bulan=${p.periodeBulan}&tahun=${p.periodeTahun}&satker=${encodeURIComponent(satuanKerja)}`;
            return (
              <tr key={`${p.periodeBulan}-${p.periodeTahun}`} className="border-b border-line-2">
                <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-ink">
                  {/* Tertaut ke halaman kalkulasi periode itu - panel ini
                      menyebut apa yang kurang, dan tautannya membawa
                      langsung ke tempat mengerjakannya. */}
                  <Link href={`/kasubag/kalkulasi${q}`} className="text-teal-deep underline">
                    {NAMA_BULAN[p.periodeBulan - 1] ?? p.periodeBulan} {p.periodeTahun}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`chip ${WARNA[p.keadaan]}`}>{LABEL[p.keadaan]}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-ink-2">
                  {p.jumlahKalkulasi > 0 ? p.jumlahKalkulasi : "-"}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-muted">
                  {p.dikirimPada ? (
                    <>
                      {tanggalTeks(p.dikirimPada)}
                      {p.dikirimOleh && <span className="block text-[11px]">oleh {p.dikirimOleh}</span>}
                    </>
                  ) : (
                    "-"
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs">
                  {TINDAKAN[p.keadaan] ? (
                    <span className="text-ink-2">{TINDAKAN[p.keadaan]}</span>
                  ) : (
                    <span className="text-muted">-</span>
                  )}
                  {/* Alasan pengembalian ditampilkan DI BARISNYA, bukan
                      disembunyikan di balik tautan: unit tidak punya cara
                      lain mengetahui apa yang diminta PPABP, dan alasan
                      yang harus dicari dulu sama saja dengan tidak ada. */}
                  {p.alasanKembali && (
                    <span className="mt-1 block max-w-xs whitespace-normal rounded-lg bg-gold-tint px-2 py-1 text-[11px] font-medium text-gold-deep">
                      {p.alasanKembali}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
