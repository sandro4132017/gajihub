// Pengelompokan keputusan pembayaran PPABP untuk halaman Monitoring Banding.
// PURE - nol I/O. Data masuk lewat parameter.
//
// Dua sumber digabung per pasangan (pegawai, bulan, tahun):
//   - ReconciliationStatus : status & keputusan PEMBAYARAN (ditulis
//     ajukanBandingAction -> SANGGAH, dan putuskanPembayaranAction -> DIPUTUSKAN)
//   - Banding              : berkas banding atas pasangan yang sama
// PPABP tidak memutuskan banding (itu OSDMA); yang ia putuskan adalah apakah
// PEMBAYARAN pasangan itu ditahan atau dikoreksi di siklus berikutnya.

/** Bentuk minimal baris ReconciliationStatus - bukan tipe Prisma. */
export interface ReconInput {
  id: string;
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  status: string; // DRAFT, COCOK, SELISIH, SANGGAH, DIPUTUSKAN
  keputusanAkhir: string | null;
}

/** Bentuk minimal baris Banding. */
export interface BandingInput {
  id: string;
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  status: string; // DIAJUKAN, MENUNGGU_APPROVAL_FINAL, DISETUJUI, DITOLAK
}

/** Bentuk minimal status pembayaran (Tukin / Uang Makan / Uang Lembur). */
export interface PembayaranInput {
  pegawaiId: string;
  periodeBulan: number;
  periodeTahun: number;
  jenis: string;
  status: string;
}

export interface ItemKeputusan<B extends BandingInput = BandingInput, P extends PembayaranInput = PembayaranInput> {
  recon: ReconInput;
  /** Semua banding pasangan ini, termasuk yang masih DIAJUKAN (belum diverifikasi). */
  bandingTerkait: B[];
  pembayaran: P[];
  /** Pernah diputuskan, lalu ada banding baru sehingga kembali menunggu. */
  dibukaUlang: boolean;
  /** Ada pembayaran APPROVED / DIKIRIM - perubahan tidak bisa diam-diam. */
  pembayaranSudahBergerak: boolean;
}

export interface HasilKelompok<B extends BandingInput = BandingInput, P extends PembayaranInput = PembayaranInput> {
  perluDiputuskan: ItemKeputusan<B, P>[];
  riwayat: ItemKeputusan<B, P>[];
}

export const STATUS_PEMBAYARAN_SUDAH_BERGERAK = new Set(["APPROVED", "DIKIRIM"]);
export const STATUS_MENUNGGU_KEPUTUSAN = ["SANGGAH", "SELISIH"] as const;

export function kunciKeputusan(pegawaiId: string, bulan: number, tahun: number): string {
  return `${pegawaiId}|${bulan}|${tahun}`;
}

/**
 * TODO(confirm): kebijakan hold vs koreksi siklus berikutnya dan durasi window
 * verifikasi belum diputuskan (lihat .claude/skills/gajihub-orientasi/SKILL.md
 * item 7). Keduanya baru MENCATAT keputusan PPABP.
 */
export const KEPUTUSAN_PEMBAYARAN = [
  { nilai: "HOLD_PEMBAYARAN", label: "Catat: tahan pembayaran" },
  { nilai: "KOREKSI_SIKLUS_BERIKUTNYA", label: "Catat: koreksi siklus berikutnya" },
] as const;

export type NilaiKeputusanPembayaran = (typeof KEPUTUSAN_PEMBAYARAN)[number]["nilai"];

export function adalahKeputusanValid(nilai: string): nilai is NilaiKeputusanPembayaran {
  return KEPUTUSAN_PEMBAYARAN.some((k) => k.nilai === nilai);
}

export function labelKeputusan(nilai: string | null | undefined): string {
  return KEPUTUSAN_PEMBAYARAN.find((k) => k.nilai === nilai)?.label ?? "Belum ada keputusan";
}

export const CATATAN_ADK_BELUM_MENAHAN =
  "Export ADK belum otomatis menahan baris ini - keputusan hanya tercatat; tahan atau koreksi dilakukan manual.";

/**
 * Menggabungkan recon + banding + status pembayaran.
 * "Perlu diputuskan" = SANGGAH | SELISIH; "riwayat" = DIPUTUSKAN.
 * DRAFT / COCOK diabaikan. Recon tanpa banding tetap masuk (tidak hilang diam-diam).
 */
export function kelompokkanKeputusan<B extends BandingInput, P extends PembayaranInput>(
  recon: ReconInput[],
  banding: B[],
  pembayaran: P[]
): HasilKelompok<B, P> {
  const petaBanding = new Map<string, B[]>();
  for (const b of banding) {
    const k = kunciKeputusan(b.pegawaiId, b.periodeBulan, b.periodeTahun);
    const arr = petaBanding.get(k) ?? [];
    arr.push(b);
    petaBanding.set(k, arr);
  }
  const petaBayar = new Map<string, P[]>();
  for (const p of pembayaran) {
    const k = kunciKeputusan(p.pegawaiId, p.periodeBulan, p.periodeTahun);
    const arr = petaBayar.get(k) ?? [];
    arr.push(p);
    petaBayar.set(k, arr);
  }

  const perluDiputuskan: ItemKeputusan<B, P>[] = [];
  const riwayat: ItemKeputusan<B, P>[] = [];

  for (const r of recon) {
    const menunggu = r.status === "SANGGAH" || r.status === "SELISIH";
    if (!menunggu && r.status !== "DIPUTUSKAN") continue;

    const k = kunciKeputusan(r.pegawaiId, r.periodeBulan, r.periodeTahun);
    const bayar = petaBayar.get(k) ?? [];
    const item: ItemKeputusan<B, P> = {
      recon: r,
      bandingTerkait: petaBanding.get(k) ?? [],
      pembayaran: bayar,
      dibukaUlang: menunggu && !!r.keputusanAkhir,
      pembayaranSudahBergerak: bayar.some((p) => STATUS_PEMBAYARAN_SUDAH_BERGERAK.has(p.status)),
    };
    (menunggu ? perluDiputuskan : riwayat).push(item);
  }

  return { perluDiputuskan, riwayat };
}

export type FilterBanding = "SEMUA" | "MENUNGGU_APPROVAL_FINAL" | "PERLU_KEPUTUSAN" | "SELESAI" | string;

/**
 * Normalisasi nilai `?status=`. Nilai lama PERLU_REKONSILIASI (tile halaman
 * Monitoring Banding sebelum digabung) dipetakan ke PERLU_KEPUTUSAN supaya
 * tautan lama tetap jalan. Kosong -> "SEMUA". Nilai lain (mis. status banding
 * DIAJUKAN) diteruskan apa adanya.
 */
export function saringStatusBanding(filter: string | null | undefined): FilterBanding {
  if (!filter) return "SEMUA";
  if (filter === "PERLU_REKONSILIASI") return "PERLU_KEPUTUSAN";
  return filter;
}
