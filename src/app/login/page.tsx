import Link from "next/link";
import { GajihubLogo } from "../GajihubLogo";
import { LoginForm } from "./LoginForm";
import { ssoAktif } from "../../auth/sso";
import { PesanSso } from "./PesanSso";
import { SlideFitur } from "./SlideFitur";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sso?: string; pesan?: string }>;
}) {
  const { sso, pesan } = await searchParams;
  const adaSso = ssoAktif();

  return (
    <div className="grid h-dvh overflow-hidden lg:grid-cols-2">
      {/* PANEL KIRI - slide fitur, murni CSS tanpa JavaScript.
          Disembunyikan di bawah lg (lihat SlideFitur.tsx). */}
      <SlideFitur />

      <main className="min-h-0 overflow-y-auto px-6 sm:px-10">
        <div className="flex min-h-full items-center justify-center py-8">
        <div className="w-full max-w-sm">
          <div className="flex justify-center">
            <GajihubLogo rupa="login" />
          </div>

          <h1 className="mt-6 text-center text-[clamp(1.75rem,3.6vh,2.25rem)] font-extrabold tracking-tight text-navy">Login Gajihub.</h1>

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
            <div className="mt-7">
              {/* Tautan biasa, bukan tombol berscript: alurnya memang
                  perpindahan halaman, jadi tetap jalan tanpa JavaScript. */}
              <Link
                href="/login/sso"
                className="btn btn-primary w-full rounded-xl py-3.5 text-base"
              >
                Masuk dengan Akun SIAP ID
              </Link>
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span className="text-xs font-semibold text-muted">atau NIP</span>
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}

          <div className={adaSso ? "mt-5" : "mt-7"}>
            <LoginForm />
          </div>

          {/* Baris inilah yang menjawab keraguan soal alamat tadi, dan
              harganya cuma satu baris. */}
          <p className="mt-8 text-center text-xs text-muted">Kementerian Ketenagakerjaan Republik Indonesia</p>
        </div>
        </div>
      </main>
    </div>
  );
}
