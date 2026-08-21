import Link from "next/link";
import { GajihubLogo } from "../GajihubLogo";
import { LoginForm } from "./LoginForm";
import { ssoAktif } from "../../auth/sso";
import { PesanSso } from "./PesanSso";

/**
 * HALAMAN LOGIN - dua panel setinggi layar penuh.
 *
 * Satu-satunya halaman yang bisa dibuka tanpa sesi (lihat src/middleware.ts),
 * jadi ini juga wajah pertama sistem ini bagi orang yang belum pernah
 * membukanya. Itu yang menentukan isi teksnya: yang paling berguna di ruang
 * paling menonjol bukan sapaan, tapi jawaban atas "ini sistem apa, punya
 * siapa" - alamatnya sekarang masih domain pribadi (gajihub.rokeubmn.id),
 * belum subdomain resmi Kemnaker, jadi orang yang menerima tautannya punya
 * alasan wajar untuk ragu.
 *
 * LOGO KEMNAKER SENGAJA TIDAK DIPAKAI di sini, alasan yang sama persis dengan
 * keputusan di slip gaji: sistem ini belum resmi milik kementerian, dan
 * memasang lambangnya di halaman depan adalah klaim yang belum dipunyai.
 * Yang berdiri di tengah mark Gajihub sendiri - warnanya memang sudah diambil
 * dari logo Kemnaker (#13416B).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso?: string; pesan?: string }>;
}) {
  const { sso, pesan } = await searchParams;
  const adaSso = ssoAktif();

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/*
        PANEL KIRI - navy polos.

        Disembunyikan di bawah lg: di layar sempit panel ini cuma mendorong
        formulir ke bawah lipatan, dan tidak ada satupun informasi di dalamnya
        yang hilang karena memang belum ada isinya.

        TODO: rencananya jadi slideshow/animasi. Kalau nanti diisi, ingat dua
        hal - (1) apa pun yang ditaruh di sini TIDAK BOLEH jadi satu-satunya
        tempat sebuah keterangan muncul, karena di HP panel ini tidak dirender
        sama sekali; (2) kalau animasinya butuh JavaScript, formulir di kanan
        harus tetap bisa dipakai tanpa itu.
      */}
      <div className="hidden bg-navy lg:block" />

      {/* PANEL KANAN - identitas + formulir */}
      <main className="flex items-center justify-center px-6 py-14 sm:px-10">
        <div className="w-full max-w-sm">
          <div className="flex justify-center">
            <GajihubLogo rupa="login" />
          </div>

          <h1 className="mt-7 text-center text-4xl font-extrabold tracking-tight text-navy">Login Gajihub</h1>

          {/* Deskripsi menyebut yang BENAR-BENAR dihitung sistem ini. Gaji
              pokok & tunjangan keluarga datang dari Web Gaji lewat upload, dan
              pembayarannya di SAKTI - jadi kata "gaji" atau "pembayaran" di
              sini akan overclaim, dan itu akan ditagih di forum yang salah. */}
          <p className="mt-2.5 text-center text-sm font-semibold leading-relaxed text-biru">
            Perhitungan Tunjangan Kinerja, Uang Makan, dan Uang Lembur - dari Presensi sampai ADK
          </p>

          {/* Hasil percobaan SSO (kalau ada) muncul di ATAS pilihan masuk -
              kalau ditaruh di bawah, pesannya tidak terlihat waktu orang
              langsung mencoba lagi. */}
          <PesanSso kode={sso} pesan={pesan} />

          {adaSso && (
            <div className="mt-9">
              {/* Tautan biasa, bukan tombol berscript: alurnya memang
                  perpindahan halaman, jadi tetap jalan tanpa JavaScript. */}
              <Link
                href="/login/sso"
                className="btn btn-primary w-full rounded-xl py-3.5 text-base"
              >
                Masuk dengan Akun Kemnaker
              </Link>
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs font-semibold text-muted">atau NIP</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          {/*
            Login NIP SENGAJA DIPERTAHANKAN berdampingan dengan SSO.

            Dua sebab, keduanya sementara: (1) belum tentu seluruh 5.077
            pegawai punya Akun Kemnaker yang aktif, dan mematikan jalur lama
            sebelum itu dipastikan akan mengunci orang di luar sistemnya
            sendiri; (2) selama masa uji, jalur ini yang dipakai membandingkan
            kalau SSO bermasalah.

            TODO(confirm): begitu SSO terbukti mencakup semua pengguna, jalur
            NIP WAJIB DIMATIKAN - selama masih ada, seluruh alasan mengganti
            password = NIP belum benar-benar tercapai (lihat catatan panjang
            di src/auth/session.ts).
          */}
          <div className={adaSso ? "mt-6" : "mt-9"}>
            <LoginForm />
          </div>

          {/* Baris inilah yang menjawab keraguan soal alamat tadi, dan
              harganya cuma satu baris. */}
          <p className="mt-10 text-center text-xs text-muted">Kementerian Ketenagakerjaan Republik Indonesia</p>
        </div>
      </main>
    </div>
  );
}
