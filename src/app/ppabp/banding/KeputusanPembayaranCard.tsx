import { labelReferensiBanding } from "../../../business-logic/bandingData";
import { KeputusanPembayaranForm } from "./KeputusanPembayaranForm";
import {
  kunciKeputusan,
  labelKeputusan,
  STATUS_PEMBAYARAN_SUDAH_BERGERAK,
  type BandingInput,
  type ItemKeputusan,
  type PembayaranInput,
} from "./keputusanPembayaran";

// Satu kartu = satu pasangan (pegawai, periode). Keputusan pembayaran tampil
// SEKALI per pasangan, walau bandingnya lebih dari satu.
//
// Hierarki (gajihub-laws-of-ux bagian 4): kartu ini sendiri TANPA kotak -
// dipisahkan garis oleh pembungkus di page.tsx. Satu-satunya blok berkotak
// adalah form keputusan. Peringatan = strip beraksen kiri; status
// pembayaran = teks + ikon.

export interface BandingRingkas extends BandingInput {
  referensiTipe: string;
  alasan: string;
}

export interface PegawaiRingkas {
  nama: string;
  nip: string;
  satuanKerja: string;
}

export function labelStatusBanding(status: string): string {
  switch (status) {
    case "DIAJUKAN":
      return "Belum diverifikasi Kasubag TU";
    case "MENUNGGU_APPROVAL_FINAL":
      return "Menunggu OSDMA";
    case "DISETUJUI":
      return "Disetujui OSDMA";
    case "DITOLAK":
      return "Ditolak";
    default:
      return status;
  }
}

function IkonPembayaran({ bergerak }: { bergerak: boolean }) {
  return bergerak ? (
    <svg aria-hidden className="size-3.5 shrink-0 text-gold-deep" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ) : (
    <svg aria-hidden className="size-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function KeputusanPembayaranCard({
  item,
  pegawai,
  varian,
  hrefBuka,
}: {
  item: ItemKeputusan<BandingRingkas, PembayaranInput>;
  pegawai: PegawaiRingkas | undefined;
  varian: "menunggu" | "riwayat";
  /** Tautan ke kartu banding (query lain dipertahankan). */
  hrefBuka: (bandingId: string) => string;
}) {
  const { recon } = item;
  const kunci = kunciKeputusan(recon.pegawaiId, recon.periodeBulan, recon.periodeTahun);

  return (
    <section id={`keputusan-${kunci}`} className="scroll-mt-4 py-4 first:pt-0 last:pb-0">
      {/* Identitas & periode */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-base font-extrabold text-ink">{pegawai?.nama ?? "Pegawai tidak ditemukan"}</h3>
          {pegawai && (
            <p className="text-xs text-muted">
              NIP <span className="font-mono">{pegawai.nip}</span> &middot; {pegawai.satuanKerja}
            </p>
          )}
        </div>
        <p className="text-sm font-semibold text-ink-2">
          Periode <span className="font-mono">{recon.periodeBulan}/{recon.periodeTahun}</span>
        </p>
      </div>

      {/* Status pembayaran: teks + ikon, tanpa kotak */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="font-bold uppercase tracking-wide text-muted">Status pembayaran</span>
        {item.pembayaran.length === 0 ? (
          <span className="text-muted">Belum ada baris kalkulasi pada periode ini.</span>
        ) : (
          item.pembayaran.map((p) => {
            const bergerak = STATUS_PEMBAYARAN_SUDAH_BERGERAK.has(p.status);
            return (
              <span key={p.jenis} className="inline-flex items-center gap-1 text-ink-2">
                <IkonPembayaran bergerak={bergerak} />
                {p.jenis}: <span className={bergerak ? "font-bold text-gold-deep" : "font-semibold"}>{p.status}</span>
              </span>
            );
          })
        )}
      </div>

      {/* Peringatan: strip beraksen kiri */}
      {item.dibukaUlang && (
        <p className="mt-3 border-l-4 border-gold bg-gold-tint/40 py-2 pl-3 pr-2 text-xs font-semibold text-ink">
          Keputusan sebelumnya: {labelKeputusan(recon.keputusanAkhir)} &mdash; dibuka lagi oleh banding baru.
        </p>
      )}
      {item.pembayaranSudahBergerak && (
        <p className="mt-3 border-l-4 border-gold bg-gold-tint/40 py-2 pl-3 pr-2 text-xs font-semibold text-ink">
          Pembayaran periode ini sudah disetujui (APPROVED) atau ikut ADK (DIKIRIM) &mdash; penyesuaian tidak bisa dilakukan diam-diam.
        </p>
      )}

      {/* Banding terkait */}
      <div className="mt-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Banding terkait</p>
        {item.bandingTerkait.length === 0 ? (
          <p className="mt-1 text-xs text-muted">Banding terkait tidak ditemukan &mdash; keputusan tetap bisa dicatat.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {item.bandingTerkait.map((b) => (
              <li key={b.id} className="flex items-baseline gap-2 text-xs">
                <span className="shrink-0 font-semibold text-ink">{labelReferensiBanding(b.referensiTipe)}</span>
                <span
                  className={`shrink-0 font-semibold ${b.status === "DIAJUKAN" ? "text-gold-deep" : "text-ink-2"}`}
                >
                  {labelStatusBanding(b.status)}
                </span>
                <span className="min-w-0 flex-1 truncate text-muted" title={b.alasan}>
                  {b.alasan}
                </span>
                <a href={hrefBuka(b.id)} className="shrink-0 font-semibold text-biru hover:underline">
                  Lihat bukti
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Action: satu-satunya blok berkotak */}
      {varian === "menunggu" ? (
        <div className="mt-4 rounded-xl border border-line bg-white p-3">
          <p className="mb-2 text-xs font-bold text-ink">Keputusan pembayaran</p>
          <KeputusanPembayaranForm reconId={recon.id} />
        </div>
      ) : (
        <p className="mt-3 text-xs font-semibold text-green">
          Keputusan tercatat: {labelKeputusan(recon.keputusanAkhir)}
        </p>
      )}
    </section>
  );
}
