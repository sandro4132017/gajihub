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

          {/* Hasil percobaan SSO (kalau ada) muncul di ATAS pilihan masuk */}
          <PesanSso kode={sso} pesan={pesan} />

          {/* JALUR UTAMA: SSO NACO (AKUN SIAP ID) */}
          <div className="mt-7">
            <a
              href="/login/sso"
              className="btn btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-base shadow-sm transition hover:shadow-md"
            >
              <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Masuk dengan Akun SIAP ID
            </a>
            <p className="mt-3 text-center text-xs text-muted leading-relaxed">
              Autentikasi terenkripsi melalui Single Sign-On (SSO) resmi Kementerian Ketenagakerjaan.
            </p>
          </div>

          {/* KHUSUS PENGUJIAN / QA: Form Login Dev (Hanya aktif jika DEV_AUTH_USER terisi di .env) */}
          {Boolean(process.env.DEV_AUTH_USER || process.env.ALLOW_NIP_LOGIN === "true") && (
            <div className="mt-8 border-t border-line pt-6">
              <div className="mb-4 rounded-lg bg-teal-tint/60 p-2.5 text-center text-[11px] font-semibold text-navy">
                Akses Pengujian (Akun Dev / QA)
              </div>
              <LoginForm />
            </div>
          )}

          <p className="mt-8 text-center text-xs text-muted">Kementerian Ketenagakerjaan Republik Indonesia</p>
        </div>
        </div>
      </main>
    </div>
  );
}
