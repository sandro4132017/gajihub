import { JENIS_BANDING, isReferensiData } from "../business-logic/bandingData";

/**
 * Isi satu banding: alasannya, dan - untuk banding atas data - bagian mana
 * yang dipersoalkan beserta usulan pegawainya.
 *
 * SATU komponen dipakai bertiga (pegawai, Kasubag TU, OSDMA). Sebelum ini tiap
 * halaman mencetak `{b.alasan}` sendiri-sendiri; menambahkan usulan perbaikan
 * di dua tempat dan lupa di tempat ketiga berarti ada verifikator yang
 * memutuskan tanpa melihat apa yang sebenarnya diminta.
 *
 * Usulan pegawai diberi kotak tersendiri dan TIDAK pernah tampil seperti nilai
 * yang sudah berlaku. Ini angka yang diusulkan oleh orang yang diuntungkan
 * olehnya - yang memverifikasi harus selalu bisa membedakannya dari data.
 */
export function RincianBanding({
  referensiTipe,
  alasan,
  bagianData,
  usulanPerbaikan,
}: {
  referensiTipe: string;
  alasan: string;
  bagianData: string | null;
  usulanPerbaikan: string | null;
}) {
  const sumber = isReferensiData(referensiTipe) ? JENIS_BANDING[referensiTipe].sistemSumber : null;

  return (
    <div className="mt-2 space-y-2">
      {bagianData && (
        <p className="text-sm">
          <span className="font-semibold text-ink">{bagianData}</span>
          {sumber && <span className="text-xs text-muted"> &middot; diperbaiki di {sumber}</span>}
        </p>
      )}
      <p className="text-sm text-ink-2">{alasan}</p>
      {usulanPerbaikan && (
        <div className="rounded-lg border border-line bg-surface-2 px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Usulan pegawai</p>
          <p className="mt-0.5 text-sm text-ink-2">{usulanPerbaikan}</p>
        </div>
      )}
    </div>
  );
}
