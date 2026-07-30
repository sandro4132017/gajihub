import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canBukaHalamanPredikatKinerja, canUploadRekapPresensi, type AuthUser } from "../../../../auth/permissions";
import { AksesDitolak } from "../../../AksesDitolak";
import { NAMA_BULAN } from "../../../bulan";

export const dynamic = "force-dynamic";

/**
 * Rincian presensi HARIAN satu pegawai untuk satu periode.
 *
 * Gunanya menjawab "kenapa potongan saya segini" per tanggal - angka bulanan
 * di halaman sebelumnya tidak bisa ditelusuri sendiri. Baris di sini ditulis
 * oleh upload PDF e-Presensi (lihat actionsPdf.ts); periode yang rekapnya
 * diisi lewat template Excel tidak punya rincian harian sama sekali, dan itu
 * dikatakan apa adanya di halaman ini.
 */

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Label yang dimengerti orang untuk nilai status_kehadiran yang tersimpan. */
const LABEL_STATUS: Record<string, string> = {
  WFO: "WFO",
  HADIR: "Hadir (WFO)",
  TERLAMBAT: "Hadir (terlambat)",
  WFH: "WFH / WFA",
  WFA: "WFH / WFA",
  DINAS_LUAR: "Dinas Keluar",
  DIKLAT: "Diklat",
  LEMBUR: "Lembur",
  UPACARA: "Upacara Bendera",
  CUTI: "Cuti",
  IZIN: "Izin",
  SAKIT: "Sakit",
  TUGAS_BELAJAR: "Tugas Belajar",
  ALPHA: "Tidak hadir (alpha)",
  TIDAK_PRESENSI: "Tidak presensi",
  TIDAK_DIKENALI: "Status tidak dikenali",
};

/** Status yang berhak uang makan (SBM 2026 item 22.1). */
const BERHAK_UANG_MAKAN = ["WFO", "HADIR", "TERLAMBAT", "WFH", "WFA"];

function jamTeks(waktu: Date | null): string {
  if (!waktu) return "-";
  const jam = String(waktu.getUTCHours()).padStart(2, "0");
  const menit = String(waktu.getUTCMinutes()).padStart(2, "0");
  return `${jam}:${menit}`;
}

export default async function RincianPresensiPegawaiPage({
  params,
  searchParams,
}: {
  params: Promise<{ nip: string }>;
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const { nip } = await params;
  const { bulan, tahun } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat data presensi pegawai." />;
  }

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip },
    select: { id: true, nip: true, nama: true, satuanKerja: true, jabatan: true, golongan: true },
  });
  if (!pegawai) {
    return <AksesDitolak pesan={`Pegawai dengan NIP ${nip} tidak ditemukan.`} />;
  }
  // Cakupan yang sama dengan hak upload: Kasubag TU cuma unitnya sendiri.
  if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja)) {
    return <AksesDitolak pesan={`Pegawai ini di luar kewenangan kamu (${pegawai.satuanKerja}).`} />;
  }

  const sekarang = new Date();
  const periodeBulan = bulan ? Number(bulan) : sekarang.getMonth() + 1;
  const periodeTahun = tahun ? Number(tahun) : sekarang.getFullYear();
  const awal = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhir = new Date(Date.UTC(periodeTahun, periodeBulan, 1));

  const [rekap, harian] = await Promise.all([
    prisma.rekapPresensiPeriode.findUnique({
      where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
    }),
    prisma.presensiHarian.findMany({
      where: { pegawaiId: pegawai.id, tanggal: { gte: awal, lt: akhir } },
      orderBy: { tanggal: "asc" },
    }),
  ]);

  const totalTelat = harian.reduce((a, h) => a + h.menitTerlambat, 0);
  const totalPulangCepat = harian.reduce((a, h) => a + h.menitPulangCepat, 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href={`/tukin/presensi?bulan=${periodeBulan}&tahun=${periodeTahun}`}
        className="text-sm font-semibold text-teal-deep underline"
      >
        &larr; Kembali ke Presensi
      </Link>
      <h1 className="mt-2 text-xl font-extrabold tracking-tight text-ink">{pegawai.nama}</h1>
      <p className="mt-1 text-sm text-muted">
        <span className="font-mono">{pegawai.nip}</span> - {pegawai.jabatan} - {pegawai.satuanKerja} - Golongan{" "}
        {pegawai.golongan}
      </p>
      <p className="mt-1 text-sm text-ink-2">
        Rincian presensi{" "}
        <strong>
          {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} {periodeTahun}
        </strong>
      </p>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label">Bulan</label>
          <input type="number" name="bulan" min="1" max="12" defaultValue={periodeBulan} className="field-input w-24 py-1.5" />
        </div>
        <div>
          <label className="field-label">Tahun</label>
          <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-28 py-1.5" />
        </div>
        <button type="submit" className="btn btn-primary">
          Terapkan
        </button>
      </form>

      {rekap ? (
        <div className="card mt-4 p-4">
          <p className="text-sm font-bold text-ink">Rekap bulanan yang dipakai kalkulasi</p>
          <p className="mt-0.5 text-xs text-muted">
            Sumber: {rekap.sourceSystem}
            {rekap.sourceFileName ? ` - ${rekap.sourceFileName}` : ""}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted">Hari kerja</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.jumlahHariKerja}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Berhak uang makan</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.jumlahHariWfo + rekap.jumlahHariWfhWfa} hari</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Alpha</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.jumlahHariAlpha} hari</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Tidak presensi</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.jumlahTidakPresensi}x</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Total terlambat</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.totalMenitTerlambat} menit</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Total pulang cepat</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.totalMenitPulangCepat} menit</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Lembur hari kerja</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.totalJamLembur} jam</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Lembur hari libur (2x)</dt>
              <dd className="font-mono font-semibold text-ink">{rekap.totalJamLemburHariLibur} jam</dd>
            </div>
          </dl>
          {harian.length > 0 && (totalTelat !== rekap.totalMenitTerlambat || totalPulangCepat !== rekap.totalMenitPulangCepat) && (
            <p className="mt-2 rounded-lg bg-gold-tint px-3 py-2 text-xs text-ink-2">
              Jumlah menit di rincian harian ({totalTelat} telat / {totalPulangCepat} pulang cepat) berbeda dengan rekap
              bulanannya. Biasanya karena rekap bulanan pernah ditimpa manual lewat template Excel setelah PDF diupload.
            </p>
          )}
        </div>
      ) : (
        <p className="card mt-4 p-4 text-sm text-muted">
          Belum ada rekap presensi bulanan untuk periode ini.
        </p>
      )}

      <div className="card mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">Tanggal</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Masuk</th>
              <th className="px-3 py-2.5">Pulang</th>
              <th className="px-3 py-2.5">Telat</th>
              <th className="px-3 py-2.5">Pulang cepat</th>
              <th className="px-3 py-2.5">Uang makan</th>
            </tr>
          </thead>
          <tbody>
            {harian.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  Tidak ada rincian harian untuk periode ini. Rincian harian hanya tersimpan kalau presensinya diupload
                  lewat <strong>PDF e-Presensi</strong> - rekap yang diisi lewat template Excel cuma menyimpan angka
                  bulanan.
                </td>
              </tr>
            )}
            {harian.map((h) => {
              const hariKe = h.tanggal.getUTCDay();
              const akhirPekan = hariKe === 0 || hariKe === 6;
              return (
                <tr key={h.id} className={`border-b border-line-2 ${akhirPekan ? "bg-surface-2" : ""}`}>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-semibold text-ink">
                      {String(h.tanggal.getUTCDate()).padStart(2, "0")}/
                      {String(h.tanggal.getUTCMonth() + 1).padStart(2, "0")}
                    </span>
                    <span className="ml-1.5 text-xs text-muted">{NAMA_HARI[hariKe]}</span>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{LABEL_STATUS[h.statusKehadiran] ?? h.statusKehadiran}</td>
                  <td className="px-3 py-2 font-mono text-ink-2">{jamTeks(h.jamMasuk)}</td>
                  <td className="px-3 py-2 font-mono text-ink-2">{jamTeks(h.jamKeluar)}</td>
                  <td className="px-3 py-2 font-mono">
                    {h.menitTerlambat > 0 ? <span className="text-red">{h.menitTerlambat} mnt</span> : <span className="text-muted">-</span>}
                  </td>
                  <td className="px-3 py-2 font-mono">
                    {h.menitPulangCepat > 0 ? <span className="text-red">{h.menitPulangCepat} mnt</span> : <span className="text-muted">-</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {akhirPekan ? (
                      <span className="text-muted">akhir pekan</span>
                    ) : BERHAK_UANG_MAKAN.includes(h.statusKehadiran) ? (
                      <span className="font-semibold text-green">berhak</span>
                    ) : (
                      <span className="text-muted">tidak</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        Potongan dihitung ulang oleh Gajihub sesuai Pasal 13 Permenaker 15/2024 - kolom &quot;Potongan&quot; di PDF
        e-Presensi tidak dipakai. Jam kerja acuan: masuk 07:30, pulang 16:00 (Senin-Kamis) / 16:30 (Jumat).
      </p>
    </main>
  );
}
