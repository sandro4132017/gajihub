/**
 * Alasan pengunjung tiba di /login karena sesinya berakhir, dibaca dari
 * `?sesi=` (diisi middleware, layout, dan /api/auth/keluar). Nadanya info
 * netral - bukan galat: sesi berakhir adalah keadaan biasa, bukan kesalahan
 * pengguna. Kode yang tidak dikenal tidak menampilkan apa pun, supaya tautan
 * rekaan tidak bisa memasang kalimat sembarang di halaman login.
 */
export const PESAN_SESI: Record<string, string> = {
  menganggur: "Sesi berakhir karena tidak ada aktivitas selama 30 menit. Silakan masuk lagi.",
  kedaluwarsa: "Sesi sudah 8 jam. Silakan masuk lagi.",
  dicabut: "Kamu sudah keluar, atau sesi diputus Admin. Silakan masuk lagi.",
  nonaktif: "Akun ini dinonaktifkan. Hubungi Admin.",
  "format-lama": "Aplikasi diperbarui, silakan masuk lagi.",
};

export function PesanSesi({ kode }: { kode?: string }) {
  if (!kode || !Object.prototype.hasOwnProperty.call(PESAN_SESI, kode)) return null;
  return (
    <p
      role="status"
      className="mt-6 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left text-sm font-semibold leading-relaxed text-ink-2"
    >
      {PESAN_SESI[kode]}
    </p>
  );
}
