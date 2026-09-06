/**
 * Hasil percobaan login SSO, dibaca dari query string yang diisi
 * `/login/sso/callback`.
 *
 * Pesannya SENGAJA menyebut sebab yang bisa ditindaklanjuti, bukan "login
 * gagal" saja. Waktu memasang SSO, penyebabnya hampir selalu salah satu dari
 * beberapa hal yang sangat spesifik (redirect_uri tidak sama persis, NIP
 * belum punya akun, balasan Naco tidak memuat NIP) - dan pesan generik
 * membuat ketiganya terlihat sama, padahal tindak lanjutnya berbeda jauh.
 */
const JUDUL: Record<string, string> = {
  "belum-dikonfigurasi": "SSO belum dikonfigurasi",
  ditolak: "Naco menolak permintaan masuk",
  gagal: "Login lewat Akun Kemnaker gagal",
  "bukan-pegawai": "Akun ini bukan akun pegawai Kemnaker",
  "tidak-terdaftar": "NIP belum terdaftar di Gajihub",
  nonaktif: "Akun dinonaktifkan",
};

const LANGKAH: Record<string, string> = {
  // Sebab teknisnya: NACO_CLIENT_ID / NACO_CLIENT_SECRET / NACO_REDIRECT_URI
  // belum terisi di .env server. Nama variabelnya TIDAK ditulis ke layar -
  // halaman login terbuka untuk siapa saja, dan yang membacanya tidak bisa
  // menindaklanjutinya sendiri.
  "belum-dikonfigurasi":
    "Masuk lewat Akun Kemnaker belum diaktifkan di server ini. Sementara ini pakai NIP dan kata sandi di bawah, lalu laporkan ke Admin Gajihub.",
  ditolak: "Coba lagi, atau hubungi pengelola Akun Kemnaker kalau terus ditolak.",
  // Sebab paling sering waktu memasang SSO: redirect_uri yang didaftarkan ke
  // Naco tidak sama persis dengan yang dipakai server ini. Itu urusan Admin,
  // jadi yang ditulis ke layar cuma langkah yang bisa diambil pembacanya.
  gagal: "Coba lagi, atau masuk memakai NIP di bawah. Kalau terus gagal, laporkan ke Admin Gajihub.",
  // Akun Kemnaker (SIAP ID) terbuka untuk masyarakat umum, dan akun publik
  // memang tidak memuat NIP. Jadi pesannya bicara soal itu - bukan soal scope
  // atau konfigurasi, yang tidak berarti apa-apa bagi orang yang membacanya.
  "bukan-pegawai":
    "Gajihub hanya untuk pegawai Kementerian Ketenagakerjaan. Kalau kamu pegawai Kemnaker dan tetap melihat pesan ini, masuk memakai NIP di bawah lalu laporkan ke Admin Gajihub.",
  "tidak-terdaftar": "Minta Admin membuatkan akun lewat menu Kelola Assignment Role.",
  nonaktif: "Hubungi Admin untuk mengaktifkan kembali.",
};

export function PesanSso({ kode, pesan }: { kode?: string; pesan?: string }) {
  if (!kode) return null;

  const judul = JUDUL[kode] ?? "Login lewat Akun Kemnaker gagal";
  const langkah = LANGKAH[kode];

  return (
    <div
      role="alert"
      className="mt-6 rounded-xl border border-red/30 bg-red-tint px-4 py-3 text-left"
    >
      <p className="text-sm font-bold text-red">{judul}</p>
      {langkah && <p className="mt-1 text-xs leading-relaxed text-ink-2">{langkah}</p>}
      {/* Pesan mentah dari Naco/server ditampilkan apa adanya - waktu
          memasang SSO, justru kalimat inilah yang menyebutkan sebab
          teknisnya, dan menyembunyikannya berarti menebak-nebak. */}
      {pesan && (
        <p className="mt-2 break-words font-mono text-[11px] leading-relaxed text-muted">{pesan}</p>
      )}
    </div>
  );
}
