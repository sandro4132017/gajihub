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
          href={`/tukin/presensi${qs}`}
          labelAksi="Kelola presensi"
          keterangan="Upload rekap manual atau sinkronkan e-Presensi. Dasar potongan Pasal 13."
          jumlah={periodeAktif ? jumlahPresensi : null}
          dari={jumlahPegawai}
        />
        <KartuSumber
          judul="Capaian kinerja - bobot 70%"
          href={`/tukin/predikat-kinerja${qs}`}
          labelAksi="Kelola predikat kinerja"
          keterangan="Upload Rekap Penilaian e-Kinerja BKN. Dikonversi ke persen sesuai Kepsekjen 82/2025."
          jumlah={periodeAktif ? jumlahPredikat : null}
          dari={jumlahPegawai}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {bolehHitung ? (
          <Link href={`/kasubag/kalkulasi${qs}`} className="btn btn-primary">
            Hitung Tukin
          </Link>
        ) : (
          // Sengaja TIDAK menampilkan tombol yang pasti ditolak. Kalkulasi
          // massal wewenang KASUBAG_TU (+ADMIN) - PPABP boleh meng-upload
          // kedua komponennya tapi tidak menjalankan kalkulasinya. Lihat
          // canAjukanKalkulasiTukinMassalUnit di permissions.ts.
          <span className="text-xs text-muted">
            Kalkulasi dijalankan Kasubag TU unit masing-masing lewat menu <strong>Kalkulasi</strong>.
          </span>
        )}
        <span className="text-xs text-muted">
          Kalkulasi memakai data kedua komponen di atas. Pegawai yang salah satu datanya belum ada akan dilewati dengan
          alasan yang jelas.
        </span>
      </div>

      {!periodeAktif && (
        <p className="mt-3 text-xs text-muted">
          Pilih bulan &amp; tahun di filter atas buat melihat berapa pegawai yang datanya sudah lengkap.
        </p>
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
