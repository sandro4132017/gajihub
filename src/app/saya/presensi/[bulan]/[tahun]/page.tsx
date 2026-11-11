import { TautanBuktiKoreksi } from "../../../../../components/shared/TautanBuktiKoreksi";
import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import { getSessionAccount } from "../../../../../auth/getSessionAccount";
import { canViewDataSendiri } from "../../../../../auth/permissions";
import { AksesDitolak } from "../../../../../components/feedback/AksesDitolak";
import { NAMA_BULAN } from "../../../../../lib/format/bulan";
import {
  KELAS_CHIP_NADA,
  jamTeks,
  labelStatus,
  lemburTeks,
  namaHari,
  penandaHariPresensi,
  tanggalTeks,
} from "../../../../../lib/format/presensiTampilan";
import { NavigasiBulan } from "../../../NavigasiBulan";
import { periodeDariParam } from "../../../periodeSaya";
import { periodeSekarang } from "../../../../periodeDefault";
import { HALAMAN } from "../../../../../components/layout/layoutHalaman";

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
  const periodeSah = periodeDariParam(bulanParam, tahunParam);

  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  if (!canViewDataSendiri(authUser, authUser.nip)) {
    return <AksesDitolak pesan="Kamu tidak berwenang melihat halaman ini." />;
  }
  if (!periodeSah) {
    return (
      <AksesDitolak
        pesan="Alamat periode tidak sah."
        hrefAlternatif="/saya?tab=kehadiran"
        labelAlternatif="Kembali ke Data Saya"
      />
    );
  }
  const periodeBulan = periodeSah.bulan;
  const periodeTahun = periodeSah.tahun;

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
    return <AksesDitolak pesan={`Data kepegawaian untuk NIP ${authUser.nip} belum tercatat di Gajihub. Hubungi Admin Gajihub.`} />;
  }

  const namaBulan = NAMA_BULAN[periodeBulan - 1] ?? String(periodeBulan);
  const rekap = pegawai.rekapPresensi[0];
  // Tanggal yang jamnya pernah dikoreksi manual oleh verifikator. Ditandai,
  // BUKAN disembunyikan: pegawai berhak tahu barisnya tidak lagi apa adanya
  // dari e-Presensi.
  // Jam hasil koreksi ikut ditampilkan bersama jam e-Presensi - itu yang dipakai
  // menghitung potongan. Menit terlambat dst. tetap angka mentah e-Presensi.
  const koreksiPerTanggal = new Map(pegawai.koreksiPresensi.map((k) => [k.tanggal.toISOString().slice(0, 10), k]));
  const tanggalDikoreksi = new Set(koreksiPerTanggal.keys());

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <NavigasiBulan periode={periodeSah} sekarang={periodeSekarang()} dasar="/saya/presensi" />
        {rekap && (
          <>
            <Link
              href={`/saya/slip-gaji/${periodeBulan}/${periodeTahun}`}
              className="btn btn-secondary btn-sm min-h-11"
            >
              Lihat slip
            </Link>
            <Link href="/saya?tab=banding" className="btn btn-ghost btn-sm min-h-11">
              Ajukan banding
            </Link>
          </>
        )}
      </div>

      {pegawai.presensi.length === 0 && (
        <div className="card mt-6 p-5">
          <p className="text-sm text-muted">
            Belum ada rincian presensi harian untuk periode ini.
            {rekap
              ? " Untuk periode ini hanya tersedia rekap bulanan, tanpa rincian per tanggal."
              : " Presensi periode ini belum diproses unit kamu."}
          </p>
        </div>
      )}

      {pegawai.presensi.length > 0 && (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Hari tercatat</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{pegawai.presensi.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total terlambat</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{totalTerlambat} mnt</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total kekurangan jam kerja</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{totalPulangCepat} mnt</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total tinggalkan kantor</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{totalMeninggalkan} mnt</p>
            </div>
            <div className="col-span-2 rounded-xl border border-line bg-surface p-3 sm:col-span-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Total lembur</p>
              <p className="mt-1 font-mono text-lg font-extrabold text-ink">{lemburTeks(totalLembur)}</p>
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

          <ul className="mt-5 space-y-2 sm:hidden">
            {pegawai.presensi.map((p) => {
              const kunci = p.tanggal.toISOString().slice(0, 10);
              const dikoreksi = tanggalDikoreksi.has(kunci);
              const koreksi = koreksiPerTanggal.get(kunci);
              const akhirPekan = p.tanggal.getUTCDay() === 0 || p.tanggal.getUTCDay() === 6;
              const penanda = penandaHariPresensi(p, dikoreksi);
              return (
                <li
                  key={p.id}
                  className={`rounded-xl border border-line p-3 ${akhirPekan ? "bg-surface-2/60" : "bg-surface"}`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p>
                      <span className="text-sm font-semibold text-ink">{tanggalTeks(p.tanggal)}</span>
                      <span className="ml-1.5 text-xs text-muted">{namaHari(p.tanggal)}</span>
                    </p>
                    <span className="text-xs text-ink-2">{labelStatus(p.statusKehadiran)}</span>
                  </div>
                  <p className="mt-1 font-mono text-sm text-ink-2">
                    {jamTeks(p.jamMasuk)} - {jamTeks(p.jamKeluar)}
                  </p>
                  {koreksi && (koreksi.jamMasuk || koreksi.jamKeluar) && (
                    <p className="mt-0.5 font-mono text-xs text-gold-deep">
                      {koreksi.jamMasuk && <>masuk dikoreksi &rarr; {jamTeks(koreksi.jamMasuk)} </>}
                      {koreksi.jamKeluar && <>pulang dikoreksi &rarr; {jamTeks(koreksi.jamKeluar)}</>}
                    </p>
                  )}
                  {koreksi && <TautanBuktiKoreksi koreksi={koreksi} className="link mr-3 mt-0.5 inline-block text-xs" />}
                  {penanda.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {penanda.map((x) => (
                        <span key={x.teks} className={KELAS_CHIP_NADA[x.nada]}>
                          {x.teks}
                        </span>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="card mt-5 hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-[11px] uppercase tracking-wide text-muted">
                  <th className="col-nama px-3 py-2.5">Tanggal</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Masuk</th>
                  <th className="px-3 py-2.5">Pulang</th>
                  <th className="px-3 py-2.5">Terlambat</th>
                  <th className="px-3 py-2.5">Kekurangan jam kerja</th>
                  <th className="px-3 py-2.5">Tinggalkan kantor</th>
                  <th className="px-3 py-2.5">Lembur</th>
                </tr>
              </thead>
              <tbody>
                {pegawai.presensi.map((p) => {
                  const kunci = p.tanggal.toISOString().slice(0, 10);
                  const dikoreksi = tanggalDikoreksi.has(kunci);
                  const koreksi = koreksiPerTanggal.get(kunci);
                  const akhirPekan = p.tanggal.getUTCDay() === 0 || p.tanggal.getUTCDay() === 6;
                  return (
                    <tr key={p.id} className={`border-b border-line-2 ${akhirPekan ? "bg-surface-2/60" : ""}`}>
                      <td className="col-nama px-3 py-2">
                        <span className="font-semibold text-ink">{tanggalTeks(p.tanggal)}</span>
                        <span className="ml-1.5 text-xs text-muted">{namaHari(p.tanggal)}</span>
                        {dikoreksi && (
                          <span className="chip chip-warn ml-1.5">Dikoreksi</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-ink-2">
                        {labelStatus(p.statusKehadiran)}
                        {p.tidakIkutUpacara && (
                          <span className="chip chip-danger ml-1.5">tanpa upacara</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-2">
                        {jamTeks(p.jamMasuk)}
                        {koreksi?.jamMasuk && (
                          <span className="block text-xs text-gold-deep">dikoreksi &rarr; {jamTeks(koreksi.jamMasuk)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-ink-2">
                        {jamTeks(p.jamKeluar)}
                        {koreksi?.jamKeluar && (
                          <span className="block text-xs text-gold-deep">dikoreksi &rarr; {jamTeks(koreksi.jamKeluar)}</span>
                        )}
                        {koreksi && <TautanBuktiKoreksi koreksi={koreksi} className="link block font-sans text-xs" />}
                      </td>
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
                        {lemburTeks(p.jamLembur)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-muted">
            Jam dan menit di sini adalah data e-Presensi apa adanya. Tanggal bertanda &quot;dikoreksi&quot; jamnya
            dikoreksi Kasubag TU unit berdasarkan bukti kehadiran; jam hasil koreksi itu yang dipakai
            menghitung potongan, data asli e-Presensi tidak diubah. Kalau ada yang tidak sesuai, ajukan lewat tab
            Banding.
          </p>
        </>
      )}
    </main>
  );
}
