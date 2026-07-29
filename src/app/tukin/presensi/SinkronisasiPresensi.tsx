/**
 * Panel sinkronisasi e-Presensi.
 *
 * Tombolnya SENGAJA nonaktif dan TIDAK dipasangi action apa pun: adapter
 * e-Presensi memang belum tersambung (belum ada akses API resmi - lihat
 * "Yang BELUM ada / open items" di CLAUDE.md). Membuat tombol yang kelihatan
 * aktif lalu gagal waktu diklik justru lebih membingungkan daripada tombol
 * yang jujur bilang belum tersedia.
 *
 * Begitu RealPresensiAdapter ada, yang berubah cuma komponen ini: ganti
 * `TERSAMBUNG` jadi true dan pasang Server Action yang memanggil adapter.
 * Struktur data tujuannya (PresensiHarian) sudah siap.
 */

const TERSAMBUNG = false;

export function SinkronisasiPresensi() {
  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">Sinkronisasi e-Presensi</h2>
          <p className="mt-1 text-sm text-muted">
            Menarik data kehadiran langsung dari e-Presensi, tanpa upload manual.
          </p>
        </div>
        <span className={`chip ${TERSAMBUNG ? "chip-ok" : "chip-draft"}`}>
          {TERSAMBUNG ? "Tersambung" : "Belum tersambung"}
        </span>
      </div>

      <button type="button" disabled className="btn btn-ghost mt-3 opacity-60" aria-disabled="true">
        Tarik data presensi
      </button>

      <p className="mt-2 text-xs text-muted">
        Belum aktif karena akses API e-Presensi belum tersedia. Selama itu, pakai upload manual di bawah - Pasal 23
        Permenaker 15/2024 memang mengakui penghitungan manual selama sistem informasinya belum berjalan. Begitu
        koneksinya ada, tombol ini yang dipakai dan upload manual jadi jalur cadangan.
      </p>
    </div>
  );
}
