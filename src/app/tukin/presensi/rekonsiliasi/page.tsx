import Link from "next/link";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canUploadRekapPresensi, type AuthUser } from "../../../../auth/permissions";
import { AksesDitolak } from "../../../AksesDitolak";
import { SumberAcuan } from "../../../SumberAcuan";
import { RekonsiliasiForm } from "./RekonsiliasiForm";

export const dynamic = "force-dynamic";

/**
 * REKONSILIASI dengan rekap absensi MANUAL petugas.
 *
 * Alat masa TRANSISI, dan itu penting dipahami sebelum menilai halaman ini:
 * hari ini yang menentukan pembayaran masih berkas Excel petugas, bukan
 * Gajihub. Mematikan berkas itu tanpa membuktikan dulu bahwa keduanya sepakat
 * berarti mengganti sumber angka pembayaran ribuan orang atas dasar keyakinan.
 * Halaman ini yang membuat pembuktian itu bisa dikerjakan per hari, bukan
 * ditebak dari totalnya.
 *
 * TIDAK ADA TULISAN KE DATABASE di seluruh alur ini - lihat catatan di
 * actions.ts. Perbaikan tetap lewat jalur yang sudah ada (tandai kendala +
 * koreksi jam, atau betulkan di e-Presensi lalu tarik ulang).
 */
export default async function RekonsiliasiPresensiPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };

  // Gate halaman pakai izin yang sama dengan upload rekap presensi. Cakupan
  // per pegawai dicek ULANG di action terhadap satuan kerja masing-masing -
  // satu berkas memuat seluruh unit, dan Kasubag TU tidak boleh ikut melihat
  // rincian unit lain cuma karena namanya ada di berkas yang dia unggah.
  const boleh = authUser && canUploadRekapPresensi(authUser, authUser.satuanKerja ?? "");
  if (!authUser || !boleh) {
    return (
      <AksesDitolak pesan="Hanya Kasubag TU (unitnya sendiri), PPABP, dan Admin yang bisa membandingkan rekap absensi." />
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link href="/tukin/presensi" className="text-sm font-semibold text-biru hover:underline">
        &larr; Kembali ke Presensi
      </Link>

      <h1 className="mt-3 flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-navy">
        Rekonsiliasi Rekap Absensi Petugas
        <SumberAcuan
          judul="Dasar & cakupan"
          acuan={[
            { aturan: "Pasal 13 Permenaker 15/2024", tentang: "tarif potongan kehadiran yang dipakai kedua sisi" },
            { aturan: "Pasal 9 Permenaker 15/2024", tentang: "jam kerja & toleransi 60 menit" },
            { aturan: "Pasal 10 ayat (2)", tentang: "presensi manual saat e-Presensi bermasalah" },
          ]}
          catatan="Kedua sisi dihitung mesin yang SAMA - kalau hasilnya beda, penyebabnya datanya, bukan rumusnya. Halaman ini tidak pernah mengubah data."
        />
      </h1>
      <p className="mt-1 text-sm text-muted">
        Menyandingkan berkas rekap manual petugas dengan data Gajihub, per hari
      </p>

      <div className="card mt-6 border-l-4 border-l-biru p-5">
        <p className="text-sm leading-relaxed text-ink">
          Selama masa peralihan, yang menentukan pembayaran masih rekap Excel petugas. Sebelum berkas itu
          dimatikan, keduanya harus terbukti sepakat - dan buktinya harus <strong>per hari</strong>, bukan dari
          totalnya saja: dua total yang kebetulan sama bisa menyembunyikan dua kesalahan yang saling menutup.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Yang diambil dari berkas hanya <strong>fakta mentah</strong> - tanggal, status, jam masuk, jam pulang.
          Kolom hitungan berkas (Terlambat, Menit Kerja, Persentase Potongan Harian) sengaja tidak dipakai:
          model potongannya berjenjang dan maksimal 2% per hari, sementara yang benar-benar dibayarkan
          per-menit 0,01% sesuai Pasal 13 ayat (3).
        </p>
      </div>

      <RekonsiliasiForm />
    </div>
  );
}
