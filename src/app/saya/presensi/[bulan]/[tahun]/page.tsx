import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import { getSessionAccount } from "../../../../../auth/getSessionAccount";
import { canViewDataSendiri } from "../../../../../auth/permissions";
import { AksesDitolak } from "../../../../AksesDitolak";
import { NAMA_BULAN } from "../../../../bulan";
import { jamTeks, labelStatus, namaHari, tanggalTeks } from "../../../../presensiTampilan";
import { HALAMAN } from "../../../../layoutHalaman";

export const dynamic = "force-dynamic";

/**
 * Presensi harian MILIK SENDIRI untuk satu periode - versi baca-saja dari
 * /tukin/presensi/[nip].
 *
 * HALAMAN TERPISAH, BUKAN membuka halaman verifikator untuk pegawai. Halaman
 * itu memuat form koreksi jam, perbandingan dengan potongan e-Presensi, dan
 * tombol yang mengubah data - semuanya kewenangan Kasubag TU/PPABP. Melonggarkan
 * guard-nya supaya pegawai bisa masuk berarti melonggarkan seluruh isinya
 * sekaligus. Yang di sini murni menampilkan.
 *
 * Kolom & istilahnya diambil dari modul yang sama (presensiTampilan.ts) supaya
 * pegawai dan verifikator membaca kata yang sama untuk baris yang sama.
 */
export default async function PresensiSayaPage({
  params,
}: {
  params: Promise<{ bulan: string; tahun: string }>;
}) {
  const { bulan: bulanParam, tahun: tahunParam } = await params;
  const periodeBulan = Number(bulanParam);
  const periodeTahun = Number(tahunParam);

  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (
    !authUser ||
    !canViewDataSendiri(authUser, authUser.nip) ||
    !Number.isInteger(periodeBulan) ||
    periodeBulan < 1 ||
    periodeBulan > 12 ||
    !Number.isInteger(periodeTahun)
  ) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }

  // Batas periode dihitung dalam UTC - sama dengan cara barisnya ditulis
  // (lihat simpanRekapPresensi.ts). Memakai `new Date(tahun, bulan)` lokal
  // akan menggeser batasnya beberapa jam dan menarik tanggal 1 bulan
  // berikutnya, atau justru membuang tanggal 1 bulan ini.
  const awal = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhir = new Date(Date.UTC(periodeTahun, periodeBulan, 1));

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    include: {
      presensi: { where: { tanggal: { gte: awal, lt: akhir } }, orderBy: { tanggal: "asc" } },
      rekapPresensi: { where: { periodeBulan, periodeTahun } },
      koreksiPresensi: { where: { tanggal: { gte: awal, lt: akhir } } },
    },
  });

  if (!pegawai) {
    return <AksesDitolak pesan={`Data pegawai untuk NIP ${authUser.nip} tidak ditemukan di sistem.`} />;
  }

  const namaBulan = NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan);
  const rekap = pegawai.rekapPresensi[0];
  // Tanggal yang jamnya pernah dikoreksi manual oleh verifikator. Ditandai,
  // BUKAN disembunyikan: pegawai berhak tahu barisnya tidak lagi apa adanya
  // dari e-Presensi.
  const tanggalDikoreksi = new Set(pegawai.koreksiPresensi.map((k) => k.tanggal.toISOString().slice(0, 10)));

  const totalTerlambat = pegawai.presensi.reduce((a, p) => a + p.menitTerlambat, 0);
  const totalPulangCepat = pegawai.presensi.reduce((a, p) => a + p.menitPulangCepat, 0);
  const totalMeninggalkan = pegawai.presensi.reduce((a, p) => a + p.menitMeninggalkanKantor, 0);
  const totalLembur = pegawai.presensi.reduce((a, p) => a + p.jamLembur, 0);

  // Sebaran status - dihitung dari baris yang SUDAH ditarik di atas, nol query
  // tambahan. Ini yang menjawab "berapa hari saya sakit/izin/cuti" tanpa harus
  // menghitung sendiri baris demi baris, dan ikut memunculkan status apa pun
  // yang dikirim e-Presensi tanpa perlu ada yang menambahkannya di sini.
  const sebaran = new Map<string, number>();
  for (const p of pegawai.presensi) {
    sebaran.set(p.statusKehadiran, (sebaran.get(p.statusKehadiran) ?? 0) + 1);
  }
  const sebaranTerurut = [...sebaran.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <main className={HALAMAN}>
      <Link href="/saya?tab=kehadiran" className="text-xs font-semibold text-teal-deep underline">
        &larr; Kembali ke Data Saya
      </Link>

      <h1 className="mt-3 text-xl font-extrabold tracking-tight text-ink">
        Presensi Harian - {namaBulan} {periodeTahun}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {pegawai.nama} <span className="mx-1 text-line">&bull;</span>
        <span className="font-mono">{pegawai.nip}</span>
      </p>

      {pegawai.presensi.length === 0 && (
        <div className="card mt-6 p-5">
          <p className="text-sm text-muted">
            Belum ada rincian presensi harian untuk periode ini.
            {rekap
              ? " Rekap periodenya sudah ada, tapi diisi lewat template Excel - jalur itu memang tidak menyimpan rincian per tanggal."
              : " Unit kamu belum menarik presensi periode ini dari e-Presensi."}
          </p>
        </div>
      )}

      {pegawai.presensi.length > 0 && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Hari tercatat</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{pegawai.presensi.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total terlambat</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{totalTerlambat} mnt</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total pulang cepat</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{totalPulangCepat} mnt</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total lembur</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{totalLembur.toFixed(1)} jam</p>
            </div>
          </div>

          <div className="card mt-5 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Sebaran status hari</p>
            <ul className="mt-2.5 flex flex-wrap gap-2">
              {sebaranTerurut.map(([status, jumlah]) => (
                <li
                  key={status}
                  className="inline-flex items-baseline gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs"
                >
                  <span className="text-ink-2">{labelStatus(status)}</span>
                  <span className="font-mono font-bold text-ink">{jumlah}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                  <th className="col-nama px-3 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Masuk</th>
                  <th className="px-3 py-2.5">Pulang</th>
                  <th className="px-3 py-2.5">Terlambat</th>
                  <th className="px-3 py-2.5">Pulang cepat</th>
                  <th className="px-3 py-2.5">Tinggalkan kantor</th>
                  <th className="px-3 py-2.5">Lembur</th>
                </tr>
              </thead>
              <tbody>
                {pegawai.presensi.map((p) => {
                  const dikoreksi = tanggalDikoreksi.has(p.tanggal.toISOString().slice(0, 10));
                  const akhirPekan = p.tanggal.getUTCDay() === 0 || p.tanggal.getUTCDay() === 6;
                  return (
                    <tr key={p.id} className={`border-b border-line-2 ${akhirPekan ? "bg-surface-2/60" : ""}`}>
                      <td className="col-nama px-3 py-2">
                        <span className="font-semibold text-ink">{tanggalTeks(p.tanggal)}</span>
                        <span className="ml-1.5 text-xs text-muted">{namaHari(p.tanggal)}</span>
                        {dikoreksi && (
                          <span className="ml-1.5 rounded bg-gold-tint px-1.5 py-0.5 text-[10px] font-bold text-gold-deep">
                            dikoreksi
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-2">
                        {labelStatus(p.statusKehadiran)}
                        {p.tidakIkutUpacara && (
                          <span className="ml-1.5 rounded bg-red-tint px-1.5 py-0.5 text-[10px] font-bold text-red">
                            tanpa upacara
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-2">{jamTeks(p.jamMasuk)}</td>
                      <td className="px-3 py-2 font-mono text-ink-2">{jamTeks(p.jamKeluar)}</td>
                      {/* Menit nol ditulis "-" bukan "0": kolom penuh angka nol
                          membuat mata harus memindai tiap baris untuk menemukan
                          yang bukan nol, padahal justru itu yang dicari. */}
                      <td className={`px-3 py-2 font-mono ${p.menitTerlambat > 0 ? "font-bold text-red" : "text-muted"}`}>
                        {p.menitTerlambat > 0 ? `${p.menitTerlambat} mnt` : "-"}
                      </td>
                      <td className={`px-3 py-2 font-mono ${p.menitPulangCepat > 0 ? "font-bold text-red" : "text-muted"}`}>
                        {p.menitPulangCepat > 0 ? `${p.menitPulangCepat} mnt` : "-"}
                      </td>
                      <td
                        className={`px-3 py-2 font-mono ${p.menitMeninggalkanKantor > 0 ? "font-bold text-red" : "text-muted"}`}
                      >
                        {p.menitMeninggalkanKantor > 0 ? `${p.menitMeninggalkanKantor} mnt` : "-"}
                      </td>
                      <td className={`px-3 py-2 font-mono ${p.jamLembur > 0 ? "text-ink" : "text-muted"}`}>
                        {p.jamLembur > 0 ? `${p.jamLembur.toFixed(1)} jam` : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted">
            Rincian ini ditarik dari e-Presensi apa adanya - Gajihub tidak pernah mengubah data presensi. Kalau ada
            baris yang tidak sesuai, ajukan lewat tab Banding di Data Saya, jangan hubungi e-Presensi langsung.
          </p>
        </>
      )}
    </main>
  );
}
