"use client";

import { BadgeKoneksi } from "@/components/shared/BadgeKoneksi";
import type { SebabGangguan } from "@/lib/koneksi/statusKoneksi";

// Indikator koneksi database e-Presensi (endpoint /api/tukin/presensi/koneksi).
// Logika tampilan dan perilakunya ada di src/components/shared/BadgeKoneksi.tsx.

export const ALASAN_OFFLINE_EPRESENSI: Record<SebabGangguan, string> = {
  KONFIGURASI: "sambungan ke e-Presensi belum diatur atau ditolak - laporkan ke Admin Gajihub",
  BATAS_WAKTU: "e-Presensi tidak menjawab dalam 4 detik",
  TIDAK_TERJANGKAU: "database e-Presensi tidak dapat dijangkau (mati atau jaringan terputus)",
  SIBUK: "database e-Presensi sedang penuh, coba beberapa saat lagi",
  GALAT_SERVER: "database e-Presensi mengalami gangguan",
};

export function StatusKoneksiEpresensi() {
  return (
    <BadgeKoneksi
      namaLayanan="e-Presensi"
      endpoint="/api/tukin/presensi/koneksi"
      alasanOffline={ALASAN_OFFLINE_EPRESENSI}
    />
  );
}
