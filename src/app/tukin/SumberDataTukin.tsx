import Link from "next/link";
import { NAMA_BULAN } from "../bulan";

/**
 * Panel "sumber data kalkulasi" di Dashboard Tukin - menyatukan dua komponen
 * pembentuk Tukin yang sebelumnya tersebar di menu berbeda:
 *   30% kehadiran -> /tukin/presensi (upload manual / sinkronisasi e-Presensi)
 *   70% kinerja   -> /tukin/predikat-kinerja (upload rekap e-Kinerja BKN)
 *
 * Angka "X dari Y pegawai" sengaja ditampilkan supaya ketahuan lebih awal
 * kalau ada pegawai yang datanya belum masuk - kalkulasi akan melewati
 * mereka, dan tanpa panel ini penyebabnya baru ketahuan setelah kalkulasi.
 */
export function SumberDataTukin({
  periodeAktif,
  jumlahPegawai,
  jumlahPresensi,
  jumlahPredikat,
  bolehHitung,
  satkerEfektif,
}: {
  periodeAktif: { periodeBulan: number; periodeTahun: number } | null;
  jumlahPegawai: number;
  jumlahPresensi: number;
  jumlahPredikat: number;
  bolehHitung: boolean;
  satkerEfektif?: string;
}) {
  const qs = periodeAktif
    ? `?bulan=${periodeAktif.periodeBulan}&tahun=${periodeAktif.periodeTahun}`
    : "";

  // `dari=tukin` menandai bahwa halaman tujuan dibuka DARI SINI, bukan dari
  // sidebar. Halaman Presensi & Predikat Kinerja memakai penanda itu untuk
  // memutuskan perlu-tidaknya tombol "Kembali": orang yang memilih menunya
  // sendiri di sidebar tidak sedang di tengah alur apa pun, dan tombol kembali
  // di situ menunjuk ke halaman yang belum tentu pernah dia buka.
  //
  // Ditaruh di URL, bukan disimpulkan dari `Referer`: header itu bisa hilang
  // (kebijakan privasi browser, buka di tab baru) dan tidak ikut waktu
  // tautannya dibagikan atau di-bookmark.
  const qsDari = qs ? `${qs}&dari=tukin` : "?dari=tukin";

  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-ink">Sumber data kalkulasi</h2>
        {periodeAktif && (
          <span className="text-xs text-muted">
            Periode {NAMA_BULAN[periodeAktif.periodeBulan - 1] ?? periodeAktif.periodeBulan}{" "}
            {periodeAktif.periodeTahun}
            {satkerEfektif && ` - ${satkerEfektif}`}
          </span>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <KartuSumber
          judul="Kehadiran - bobot 30%"
          href={`/tukin/presensi${qsDari}`}
          labelAksi="Kelola presensi"
          keterangan="Upload rekap manual atau sinkronkan e-Presensi. Dasar potongan Pasal 13."
          jumlah={periodeAktif ? jumlahPresensi : null}
          dari={jumlahPegawai}
        />
        <KartuSumber
          judul="Capaian kinerja - bobot 70%"
          href={`/tukin/predikat-kinerja${qsDari}`}
          labelAksi="Kelola predikat kinerja"
          keterangan="Upload Rekap Penilaian e-Kinerja BKN. Dikonversi ke persen sesuai Kepsekjen 82/2025."
          jumlah={periodeAktif ? jumlahPredikat : null}
          dari={jumlahPegawai}
        />
      </div>

      {/* Tombolnya saja, tanpa keterangan (permintaan user 2026-09-06).
          Yang berwenang menjalankan kalkulasi cuma KASUBAG_TU (unitnya
          sendiri) dan ADMIN - PPABP dicabut 2026-09-06, lihat
          canAjukanKalkulasiTukinMassalUnit. Untuk yang tidak berwenang
          TIDAK ada teks pengganti: tombol yang absen sudah menjawabnya, dan
          menjelaskan siapa yang berwenang di layar orang yang memang bukan
          pelakunya cuma menambah bacaan. */}
      {bolehHitung && (
        <div className="mt-3">
          <Link href={`/kasubag/kalkulasi${qs}`} className="btn btn-primary">
            Hitung Tukin
          </Link>
        </div>
      )}
    </div>
  );
}

function KartuSumber({
  judul,
  href,
  labelAksi,
  keterangan,
  jumlah,
  dari,
}: {
  judul: string;
  href: string;
  labelAksi: string;
  keterangan: string;
  jumlah: number | null;
  dari: number;
}) {
  const lengkap = jumlah !== null && dari > 0 && jumlah >= dari;
  const kosong = jumlah === 0;

  return (
    <div className="rounded-lg border border-line bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink">{judul}</p>
        {jumlah !== null && (
          <span className={`chip ${lengkap ? "chip-ok" : kosong ? "chip-danger" : "chip-wait"}`}>
            {jumlah} / {dari}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{keterangan}</p>
      <Link href={href} className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
        {labelAksi} &rarr;
      </Link>
    </div>
  );
}
