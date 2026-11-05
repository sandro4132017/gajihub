"use client";

import type { RefObject } from "react";
import {
  BadgeKoneksi,
  IsiPanelKoneksi,
  TampilanBadgeKoneksi,
  formatJamPeriksa,
  labelBadgeKoneksi,
  tafsirkanRespons,
  type JawabanKoneksi,
} from "@/components/shared/BadgeKoneksi";
import type { KeadaanKoneksiBsre, SebabGangguanBsre } from "@/lib/tte/koneksiBsre";

// Pembungkus tipis BadgeKoneksi untuk layanan BSrE (endpoint /api/tte/koneksi).
// Logika tampilan dan perilakunya ada di src/components/shared/BadgeKoneksi.tsx.

export { formatJamPeriksa, tafsirkanRespons };
export type { JawabanKoneksi };

export const ALASAN_OFFLINE: Record<SebabGangguanBsre, string> = {
  GALAT_SERVER: "server BSrE mengalami gangguan (tidak merespons dengan benar)",
  BATAS_WAKTU: "BSrE tidak menjawab dalam 4 detik",
  TIDAK_TERJANGKAU: "layanan BSrE tidak dapat dijangkau (mati atau jaringan terputus)",
  KONFIGURASI: "akses ke layanan BSrE ditolak - laporkan ke Admin Gajihub",
  SIBUK: "BSrE sedang sibuk, coba beberapa saat lagi",
};

const PERINGATAN_MODAL =
  "Penandatanganan kemungkinan besar gagal; Anda tetap bisa mencoba atau tunggu beberapa menit.";

/** Teks badge persis seperti keputusan user (bahasa Inggris apa adanya). */
export function labelBadgeBsre(memeriksa: boolean, jawaban: JawabanKoneksi | null): string {
  return labelBadgeKoneksi("BSrE", memeriksa, jawaban);
}

interface IsiPanelProps {
  memeriksa: boolean;
  jawaban: JawabanKoneksi | null;
  onPeriksaUlang: () => void;
}

/** Isi popover rincian: jam periksa, alasan bila offline, "Periksa ulang". */
export function IsiPanelStatusBsre(props: IsiPanelProps) {
  return <IsiPanelKoneksi {...props} alasanOffline={ALASAN_OFFLINE} />;
}

interface TampilanProps extends IsiPanelProps {
  terbuka: boolean;
  idPanel: string;
  onToggle: () => void;
  /** Peringatan satu baris di bawah badge, hanya tampil saat Offline. */
  denganPeringatan?: boolean;
  tombolRef?: RefObject<HTMLButtonElement | null>;
  panelRef?: RefObject<HTMLDivElement | null>;
}

/** Bagian tampilan (tanpa fetch), supaya bisa dirender di test. */
export function TampilanStatusBsre({ denganPeringatan = false, ...rest }: TampilanProps) {
  return (
    <TampilanBadgeKoneksi
      {...rest}
      namaLayanan="BSrE"
      alasanOffline={ALASAN_OFFLINE}
      peringatanOffline={denganPeringatan ? PERINGATAN_MODAL : undefined}
    />
  );
}

interface Props {
  /** Lewati cache server (tetap dibatasi umur minimum 15 dtk di server). */
  paksaSaatMuat?: boolean;
  /** Tambah peringatan satu baris saat Offline (dipakai di modal tanda tangan). */
  denganPeringatan?: boolean;
  onBerubah?: (keadaan: KeadaanKoneksiBsre) => void;
}

export function StatusKoneksiBsre({ paksaSaatMuat = false, denganPeringatan = false, onBerubah }: Props) {
  return (
    <BadgeKoneksi
      namaLayanan="BSrE"
      endpoint="/api/tte/koneksi"
      alasanOffline={ALASAN_OFFLINE}
      peringatanOffline={denganPeringatan ? PERINGATAN_MODAL : undefined}
      paksaSaatMuat={paksaSaatMuat}
      onBerubah={onBerubah}
    />
  );
}
