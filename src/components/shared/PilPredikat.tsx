import { LABEL_PREDIKAT } from "../../app/tukin/predikat-kinerja/predikat";

/**
 * Pil berwarna untuk predikat kinerja, dipakai SEMUA tabel Tukin (Kalkulasi
 * Unit, Dashboard Tukin PPABP, rincian lengkap) supaya warnanya seragam.
 *
 * Warna mengikuti dampaknya ke tukin: Sangat Baik hijau, Baik biru (keduanya
 * 100%), Perlu Perbaikan kuning (85%), Kurang & Sangat Kurang merah (60%).
 * Teksnya tetap tertulis - warna hanya pendamping.
 *
 * Menerima KODE ("SANGAT_BAIK") maupun LABEL ("Sangat Baik"): kode tidak
 * pernah tampil mentah di layar.
 */
const WARNA: Record<string, string> = {
  SANGAT_BAIK: "border-green/30 bg-green-tint text-green",
  BAIK: "border-biru/25 bg-biru/10 text-biru-deep",
  PERLU_PERBAIKAN: "border-gold/40 bg-gold-tint text-gold-deep",
  KURANG: "border-red/25 bg-red-tint text-red",
  SANGAT_KURANG: "border-red/25 bg-red-tint text-red",
};

/** Kode predikat dari kode ATAU label; null bila tidak dikenali. */
export function kodePredikat(nilai: string): string | null {
  if (nilai in LABEL_PREDIKAT) return nilai;
  const ketemu = Object.entries(LABEL_PREDIKAT).find(([, label]) => label === nilai);
  return ketemu ? ketemu[0] : null;
}

/** Label tampilan; kode tak dikenal ditulis dengan garis bawah diganti spasi. */
export function labelPredikat(nilai: string): string {
  const kode = kodePredikat(nilai);
  return kode ? LABEL_PREDIKAT[kode] : nilai.replace(/_/g, " ");
}

export function PilPredikat({ nilai }: { nilai: string }) {
  const kode = kodePredikat(nilai);
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 font-sans text-xs font-medium ${
        (kode && WARNA[kode]) ?? "border-line bg-surface-2 text-ink-2"
      }`}
    >
      {labelPredikat(nilai)}
    </span>
  );
}
