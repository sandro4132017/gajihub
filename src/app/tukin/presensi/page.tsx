import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canBukaHalamanPredikatKinerja, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";
import { UploadPresensiForm } from "./UploadPresensiForm";
import { UploadPresensiPdfForm } from "./UploadPresensiPdfForm";
import { SinkronisasiPresensi } from "./SinkronisasiPresensi";

export const dynamic = "force-dynamic";

/**
 * PRESENSI - sumber komponen 30% Tukin (Permenaker 15/2024 Pasal 5 & 13).
 * Dua jalur: sinkronisasi e-Presensi (belum tersambung) dan upload manual
 * (dipakai sekarang, sah menurut Pasal 23 selama sistem informasi belum
 * berjalan).
 */

const MAKS_BARIS_TAMPIL = 200;

export default async function PresensiTukinPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; q?: string }>;
}) {
  const { bulan, tahun, q } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola data presensi." />;
  }

  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  const sekarang = new Date();
  const periodeBulan = bulan ? Number(bulan) : sekarang.getMonth() + 1;
  const periodeTahun = tahun ? Number(tahun) : sekarang.getFullYear();

  const filterPegawai: Prisma.PegawaiWhereInput = {};
  if (satkerWajib) filterPegawai.satuanKerja = satkerWajib;
  if (q?.trim()) {
    filterPegawai.OR = [{ nama: { contains: q.trim(), mode: "insensitive" } }, { nip: { contains: q.trim() } }];
  }

  const where: Prisma.RekapPresensiPeriodeWhereInput = {
    periodeBulan,
    periodeTahun,
    ...(Object.keys(filterPegawai).length > 0 ? { pegawai: filterPegawai } : {}),
  };

  const [jumlahBaris, rekapList] = await Promise.all([
    prisma.rekapPresensiPeriode.count({ where }),
    prisma.rekapPresensiPeriode.findMany({
      where,
      take: MAKS_BARIS_TAMPIL,
      orderBy: { pegawai: { nama: "asc" } },
      include: { pegawai: { select: { nip: true, nama: true, satuanKerja: true } } },
    }),
  ]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link href="/tukin" className="text-sm font-semibold text-teal-deep underline">
        &larr; Kembali ke Dashboard Tukin
      </Link>
      <h1 className="mt-2 text-xl font-extrabold tracking-tight text-ink">Presensi (komponen 30% Tukin)</h1>
      <p className="mt-1 text-sm text-muted">
        Dasar potongan kehadiran Pasal 13 Permenaker 15/2024.
        {satkerWajib && (
          <>
            {" "}
            Kamu hanya melihat pegawai di <strong>{satkerWajib}</strong>.
          </>
        )}
      </p>

      <UploadPresensiPdfForm />

      <SinkronisasiPresensi defaultBulan={periodeBulan} defaultTahun={periodeTahun} />

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold text-teal-deep">
          Cara lama: isi template Excel sendiri (masih bisa dipakai untuk koreksi)
        </summary>
        <UploadPresensiForm defaultBulan={periodeBulan} defaultTahun={periodeTahun} />

        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">Aturan pengisian kolom lembur</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-muted">
            <li>
              <strong>Hari WFH/WFA tidak dihitung lembur</strong> - walau jam absen keluarnya melewati jam kerja. Jam
              lembur yang diisi harus sudah mengecualikan hari-hari itu.
            </li>
            <li>
              <strong>Jam lembur hari libur / tanggal merah diisi di kolom terpisah</strong> - tarifnya dibayar 2x
              tarif per jam biasa.
            </li>
            <li>
              <strong>Hari makan lembur</strong> = jumlah hari yang lemburnya mencapai 2 jam{" "}
              <em>berturut-turut</em> (SBM 2026 hal. 51, penjelasan item 23.2), paling banyak 1 kali per hari. Lembur 1
              jam pagi + 1 jam sore TIDAK memenuhi syarat walau totalnya 2 jam.
            </li>
          </ul>
        </div>
      </details>

      <form method="get" className="card mt-6 flex flex-wrap items-end gap-3 p-4">
        <div className="w-full text-xs text-muted">
          Filter ini hanya memilih periode yang <strong>ditampilkan</strong> di tabel bawah - tidak menarik data
          dari e-Presensi. Untuk menarik, pakai panel Sinkronisasi di atas.
        </div>
        <div>
          <label className="field-label">Bulan</label>
          <input type="number" name="bulan" min="1" max="12" defaultValue={periodeBulan} className="field-input w-24 py-1.5" />
        </div>
        <div>
          <label className="field-label">Tahun</label>
          <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-28 py-1.5" />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="field-label">Cari nama atau NIP</label>
          <input type="text" name="q" defaultValue={q ?? ""} className="field-input" placeholder="Cari pegawai..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Terapkan
        </button>
      </form>

      <p className="mt-3 text-sm text-muted">
        Rekap presensi periode{" "}
        <strong className="text-ink">
          {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} {periodeTahun}
        </strong>
        : {jumlahBaris} pegawai.
      </p>

      <div className="card mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-3 py-2.5">Pegawai</th>
              <th className="px-3 py-2.5">Alpha</th>
              <th className="px-3 py-2.5">Tdk presensi</th>
              <th className="px-3 py-2.5">Telat</th>
              <th className="px-3 py-2.5">Plg cepat</th>
              <th className="px-3 py-2.5">Tinggal kantor</th>
              <th className="px-3 py-2.5">Bolos upacara</th>
              <th className="px-3 py-2.5">Hadir/Kerja</th>
              <th className="px-3 py-2.5">WFO + WFH/WFA</th>
              <th className="px-3 py-2.5">Diklat / Dinas luar</th>
              <th className="px-3 py-2.5">Lembur</th>
            </tr>
          </thead>
          <tbody>
            {rekapList.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-6 text-center text-muted">
                  Belum ada rekap presensi untuk periode ini. Upload dulu di atas - tanpa presensi, kalkulasi Tukin
                  akan melewati pegawai yang bersangkutan.
                </td>
              </tr>
            )}
            {rekapList.map((r) => (
              <tr key={r.id} className="border-b border-line-2">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/tukin/presensi/${r.pegawai.nip}?bulan=${periodeBulan}&tahun=${periodeTahun}`}
                    className="font-semibold text-teal-deep underline"
                  >
                    {r.pegawai.nama}
                  </Link>
                  <span className="block font-mono text-xs text-muted">{r.pegawai.nip}</span>
                  <span className="block text-xs text-muted">{r.sourceSystem}</span>
                </td>
                <td className="px-3 py-2.5 font-mono text-ink-2">{r.jumlahHariAlpha} hari</td>
                <td className="px-3 py-2.5 font-mono text-ink-2">{r.jumlahTidakPresensi}x</td>
                <td className="px-3 py-2.5 font-mono text-ink-2">{r.totalMenitTerlambat} mnt</td>
                <td className="px-3 py-2.5 font-mono text-ink-2">{r.totalMenitPulangCepat} mnt</td>
                <td className="px-3 py-2.5 font-mono text-ink-2">{r.totalMenitMeninggalkanKantor} mnt</td>
                <td className="px-3 py-2.5 font-mono text-ink-2">{r.jumlahTidakIkutUpacara}x</td>
                <td className="px-3 py-2.5 font-mono text-ink-2">
                  {r.jumlahHariHadir}/{r.jumlahHariKerja}
                </td>
                {/* Yang berhak uang makan (SBM item 22.1) - bisa lebih kecil
                    dari hari hadir kalau ada diklat/dinas luar. */}
                <td className="px-3 py-2.5 font-mono font-semibold text-ink">
                  {r.jumlahHariWfo + r.jumlahHariWfhWfa} hari
                </td>
                <td className="px-3 py-2.5 font-mono text-muted">
                  {r.jumlahHariDiklat} / {r.jumlahHariDinasLuar}
                </td>
                <td className="px-3 py-2.5 font-mono text-ink-2">
                  {r.totalJamLembur} jam
                  {r.totalJamLemburHariLibur > 0 && (
                    <span className="block text-xs font-semibold text-gold-deep">
                      + {r.totalJamLemburHariLibur} jam hari libur (2x)
                    </span>
                  )}
                  {r.jumlahHariMakanLembur + r.jumlahHariMakanLemburHariLibur > 0 && (
                    <span className="block text-xs text-muted">
                      {r.jumlahHariMakanLembur + r.jumlahHariMakanLemburHariLibur} hari makan lembur
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {jumlahBaris > rekapList.length && (
        <p className="mt-2 text-xs text-muted">
          Menampilkan {rekapList.length} dari {jumlahBaris} baris - persempit dengan pencarian nama/NIP.
        </p>
      )}
    </main>
  );
}
