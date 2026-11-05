"use client";

import { BadgeKoneksi } from "@/components/shared/BadgeKoneksi";
import type { SebabGangguan } from "@/lib/koneksi/statusKoneksi";

// Indikator koneksi database SIAP (endpoint /api/admin/koneksi/siap).
// Logika tampilan dan perilakunya ada di src/components/shared/BadgeKoneksi.tsx.

export const ALASAN_OFFLINE_SIAP: Record<SebabGangguan, string> = {
  KONFIGURASI: "login ke SIAP ditolak atau pengaturan sambungan belum benar - periksa SIAP_* di .env",
  BATAS_WAKTU: "SIAP tidak menjawab dalam 8 detik",
  TIDAK_TERJANGKAU: "SIAP tidak dapat dijangkau (server mati, jaringan terputus, atau UDP 1434 tertutup)",
  SIBUK: "SIAP sedang sibuk, coba beberapa saat lagi",
  GALAT_SERVER: "SIAP menjawab dengan galat",
};

export function StatusKoneksiSiap() {
  return (
    <BadgeKoneksi
      namaLayanan="SIAP"
      endpoint="/api/admin/koneksi/siap"
      alasanOffline={ALASAN_OFFLINE_SIAP}
    />
  );
}
