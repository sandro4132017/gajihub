import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canBukaHalamanPredikatKinerja, canUploadRekapPresensi, type AuthUser } from "../../../../auth/permissions";
import { AksesDitolak } from "../../../AksesDitolak";
import { NAMA_BULAN } from "../../../bulan";
import { SearchableSelect } from "../../../SearchableSelect";
import { periodePunyaPresensiHarian, resolvePeriode } from "../../../periodeDefault";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../../business-logic/tarifTukinPokok";
import { RincianPotonganKehadiran } from "../../../RincianPotonganKehadiran";
import { dikecualikanPotonganKehadiran } from "../../../../business-logic/pejabatPimpinanTinggi";
import { BadgePejabatEselon } from "../../../BadgePejabatEselon";
import { KoreksiJamForm } from "./KoreksiJamForm";

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
  searchParams: Promise<{ bulan?: string; tahun?: string; dari?: string; satker?: string }>;
}) {
  const { nip } = await params;
  const { bulan, tahun, dari, satker } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat data presensi pegawai." />;
  }

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip },
    select: { id: true, nip: true, nama: true, satuanKerja: true, jabatan: true, golongan: true, kelasJabatan: true },
  });
  if (!pegawai) {
    return <AksesDitolak pesan={`Pegawai dengan NIP ${nip} tidak ditemukan.`} />;
  }
  // Cakupan yang sama dengan hak upload: Kasubag TU cuma unitnya sendiri.
  if (!canUploadRekapPresensi(authUser, pegawai.satuanKerja)) {
    return <AksesDitolak pesan={`Pegawai ini di luar kewenangan kamu (${pegawai.satuanKerja}).`} />;
  }

  // Periode default diambil dari rincian harian PEGAWAI INI, bukan dari bulan
  // berjalan - halaman ini justru dibuka buat menelusuri "kenapa potongan saya
  // segini", dan mendarat di bulan kosong menjawab pertanyaan yang salah.
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaPresensiHarian(pegawai.id)
  );
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

  // Tanggal yang dinyatakan bermasalah (Pasal 10 ayat (2)) + koreksi jam yang
  // sudah dibuat petugas absensi. Keduanya ditampilkan DI SAMPING jam asli,
  // bukan menggantikannya - data mentah e-Presensi tetap kelihatan apa adanya.
  const [kendalaPeriode, koreksiPeriode] = await Promise.all([
    prisma.kendalaEpresensi.findMany({
      where: {
        tanggal: { gte: awal, lt: akhir },
        OR: [{ satuanKerja: null }, { satuanKerja: pegawai.satuanKerja ?? undefined }],
      },
      select: { tanggal: true, ditandaiPada: true },
    }),
    prisma.koreksiPresensiHarian.findMany({
      where: { pegawaiId: pegawai.id, tanggal: { gte: awal, lt: akhir } },
      include: { dikoreksiOleh: { select: { nama: true } } },
    }),
  ]);

  // Koreksi & penanda kendala baru berpengaruh SETELAH presensi ditarik ulang
  // (rekapnya dihitung saat sinkronisasi, bukan saat halaman dibuka). Tanpa
  // peringatan ini, orang mengoreksi jam lalu melihat angkanya tidak berubah
  // dan menyimpulkan koreksinya gagal - kejadian nyata waktu fitur ini baru
  // dipakai pertama kali.
  const disinkronPada = rekap?.diunggahPada ?? null;
  const perubahanBelumBerlaku = disinkronPada
    ? [
        ...koreksiPeriode.filter((k) => k.dikoreksiPada > disinkronPada).map((k) => k.tanggal),
        ...kendalaPeriode.filter((k) => k.ditandaiPada > disinkronPada).map((k) => k.tanggal),
      ]
    : [];
  const tanggalBelumBerlaku = [...new Set(perubahanBelumBerlaku.map((t) => t.toISOString().slice(0, 10)))].sort();
  const tanggalKendala = new Set(kendalaPeriode.map((k) => k.tanggal.toISOString().slice(0, 10)));
  const petaKoreksi = new Map(koreksiPeriode.map((k) => [k.tanggal.toISOString().slice(0, 10), k]));
  const bolehKoreksi = canUploadRekapPresensi(authUser, pegawai.satuanKerja ?? "");

  const totalTelat = harian.reduce((a, h) => a + h.menitTerlambat, 0);
  const totalPulangCepat = harian.reduce((a, h) => a + h.menitPulangCepat, 0);

  // Bahan tabel "kenapa potongan saya segini": bobot kehadiran penuh (30% x
  // tarif kelas jabatan) + komponen kehadiran yang benar-benar tersimpan, biar
  // selisihnya kelihatan kalau presensinya berubah setelah Tukin dihitung.
  const tarifKelas =
    pegawai.kelasJabatan === null ? null : (TUKIN_POKOK_PER_KELAS_JABATAN[pegawai.kelasJabatan] ?? null);
  // Pasal 5 ayat (2) huruf b - bobot kehadiran 30%.
  const bobotKehadiranPenuh = tarifKelas === null ? null : tarifKelas * 0.3;
  const tukinPeriode = await prisma.tukinCalculation.findUnique({
    where: { pegawaiId_periodeBulan_periodeTahun: { pegawaiId: pegawai.id, periodeBulan, periodeTahun } },
    select: { komponenKehadiran: true },
  });

  // Halaman ini dimasuki dari dua tempat: tabel Presensi dan tabel Kalkulasi
  // Unit. Asalnya dibawa lewat ?dari= supaya tombol kembali mengantar ke tempat
  // orangnya datang, bukan selalu ke Presensi.
  //
  // SENGAJA daftar tetap, bukan URL bebas dari query string: menerima path apa
  // pun dari luar berarti tautan ini bisa disetel mengarah ke mana saja.
  const asal =
    dari === "kalkulasi"
      ? {
          label: "Kembali ke Kalkulasi Unit",
          href:
            `/kasubag/kalkulasi?bulan=${periodeBulan}&tahun=${periodeTahun}` +
            (satker ? `&satker=${encodeURIComponent(satker)}` : ""),
        }
      : {
          label: "Kembali ke Presensi",
          href: `/tukin/presensi?bulan=${periodeBulan}&tahun=${periodeTahun}`,
        };

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link href={asal.href} className="text-sm font-semibold text-teal-deep underline">
        &larr; {asal.label}
      </Link>
      {/* Badge-nya DI LUAR <h1>: isinya <details> (flow content), sementara
          <h1> cuma boleh memuat phrasing content - kalau dipaksa masuk,
          browser memindahkannya keluar dan terjadi hydration mismatch. */}
      <div className="mt-2 flex flex-wrap items-baseline gap-1">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">{pegawai.nama}</h1>
        <BadgePejabatEselon kelasJabatan={pegawai.kelasJabatan} />
      </div>
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
          <SearchableSelect
            name="bulan"
            className="w-36"
            options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
            defaultValue={String(periodeBulan)}
          />
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

      {rekap && (
        <RincianPotonganKehadiran
          rekap={rekap}
          bobotKehadiranPenuh={bobotKehadiranPenuh}
          nilaiTersimpan={tukinPeriode?.komponenKehadiran ?? null}
          dikecualikan={dikecualikanPotonganKehadiran(pegawai.kelasJabatan)}
        />
      )}

      {tanggalBelumBerlaku.length > 0 && (
        <div className="card mt-4 border-red/40 bg-red-tint p-4">
          <p className="text-sm font-bold text-ink">Koreksi ini BELUM berpengaruh ke angka</p>
          <p className="mt-1 text-xs text-ink-2">
            Perubahan pada tanggal <strong>{tanggalBelumBerlaku.join(", ")}</strong> dibuat{" "}
            <strong>setelah</strong> presensi periode ini terakhir ditarik (
            {disinkronPada?.toLocaleString("id-ID")}). Rekap yang dipakai menghitung Tukin masih yang lama, jadi
            potongannya belum berubah.
          </p>
          <p className="mt-1.5 text-xs text-ink-2">
            Supaya berlaku:{" "}
            <Link href={`/tukin/presensi?bulan=${periodeBulan}&tahun=${periodeTahun}`} className="link font-semibold">
              tarik ulang presensi periode ini
            </Link>{" "}
            lewat panel Sinkronisasi, lalu hitung ulang Tukin-nya di Kalkulasi Unit.
          </p>
        </div>
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
              {bolehKoreksi && <th className="px-3 py-2.5">Koreksi</th>}
            </tr>
          </thead>
          <tbody>
            {harian.length === 0 && (
              <tr>
                <td colSpan={bolehKoreksi ? 8 : 7} className="px-3 py-6 text-center text-muted">
                  Tidak ada rincian harian untuk periode ini. Rincian harian hanya tersimpan kalau presensinya diupload
                  lewat <strong>PDF e-Presensi</strong> - rekap yang diisi lewat template Excel cuma menyimpan angka
                  bulanan.
                </td>
              </tr>
            )}
            {harian.map((h) => {
              const hariKe = h.tanggal.getUTCDay();
              const akhirPekan = hariKe === 0 || hariKe === 6;
              const iso = h.tanggal.toISOString().slice(0, 10);
              const kendala = tanggalKendala.has(iso);
              const koreksi = petaKoreksi.get(iso);
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
                  {bolehKoreksi && (
                    <td className="px-3 py-2 align-top">
                      {kendala ? (
                        <KoreksiJamForm
                          nip={pegawai.nip}
                          tanggalIso={iso}
                          jamMasukAsli={jamTeks(h.jamMasuk)}
                          jamKeluarAsli={jamTeks(h.jamKeluar)}
                          koreksi={
                            koreksi
                              ? {
                                  id: koreksi.id,
                                  jamMasuk: koreksi.jamMasuk ? jamTeks(koreksi.jamMasuk) : null,
                                  jamKeluar: koreksi.jamKeluar ? jamTeks(koreksi.jamKeluar) : null,
                                  alasan: koreksi.alasan,
                                  olehNama: koreksi.dikoreksiOleh.nama,
                                }
                              : null
                          }
                        />
                      ) : (
                        // Tanpa penanda kendala, jam tidak boleh diubah sama
                        // sekali - invariant "tidak ada edit presensi bebas"
                        // tetap berlaku, dan alasannya dikatakan apa adanya.
                        <span className="text-xs text-muted">
                          {akhirPekan ? "-" : "tanggal belum ditandai kendala"}
                        </span>
                      )}
                    </td>
                  )}
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
