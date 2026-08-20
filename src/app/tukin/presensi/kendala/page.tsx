import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canKelolaKendalaEpresensi, type AuthUser } from "../../../../auth/permissions";
import { AksesDitolak } from "../../../AksesDitolak";
import { NAMA_BULAN } from "../../../bulan";
import { SearchableSelect } from "../../../SearchableSelect";
import { periodePunyaRekapPresensi, resolvePeriode } from "../../../periodeDefault";
import {
  deteksiTanggalJanggal,
  AMBANG_MINIMUM_PERSEN,
  AMBANG_KELIPATAN_MEDIAN,
  type StatistikTanggal,
} from "../../../../business-logic/kendalaEpresensi";
import { TandaiKendalaForm, CabutKendalaForm } from "./KendalaForms";

export const dynamic = "force-dynamic";

/**
 * KENDALA E-PRESENSI - Pasal 10 ayat (2) Permenaker 15/2024.
 *
 * Halaman ini menjawab satu pertanyaan yang sebelumnya cuma bisa dijawab
 * secara kebetulan: "apakah ada hari yang absennya gagal massal, bukan
 * kelalaian orang per orang?"
 *
 * Deteksi di sini TIDAK mengubah apa pun. Yang mengubah angka cuma penanda
 * yang ditulis manusia di bawahnya.
 */

interface BarisStat {
  tanggal: Date;
  hari_kerja: bigint;
  kejadian: bigint;
}

/**
 * Batas periode untuk $queryRaw, sebagai TEKS "YYYY-MM-DD".
 *
 * JANGAN mengoper objek `Date` sebagai parameter $queryRaw ke kolom
 * `timestamp`: driver pg menyerialkannya memakai zona waktu LOKAL proses, jadi
 * di Asia/Jakarta (+7) batasnya bergeser 7 jam - tanggal 1 terbuang dan
 * tanggal 1 bulan berikutnya ikut masuk. Terukur waktu ketemu: 4.596 baris
 * presensi hilang diam-diam dari agregasi Juni 2026, dan 1 Juni (Hari Lahir
 * Pancasila) tidak pernah muncul sebagai kandidat.
 *
 * API bertipe Prisma (`where: { tanggal: { gte, lt } }`) TIDAK kena - itu
 * menangani zona waktunya sendiri. Ini khusus jalur SQL mentah.
 */
function batasPeriodeIso(bulan: number, tahun: number): { awalIso: string; akhirIso: string } {
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    awalIso: `${tahun}-${p(bulan)}-01`,
    akhirIso: bulan === 12 ? `${tahun + 1}-01-01` : `${tahun}-${p(bulan + 1)}-01`,
  };
}

const NAMA_HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export default async function KendalaEpresensiPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const { bulan, tahun } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaKendalaEpresensi(authUser)) {
    return <AksesDitolak pesan="Hanya PPABP dan Admin yang bisa menandai tanggal kendala e-Presensi." />;
  }

  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaRekapPresensi()
  );
  const awal = new Date(Date.UTC(periodeTahun, periodeBulan - 1, 1));
  const akhir = new Date(Date.UTC(periodeTahun, periodeBulan, 1));
  const { awalIso, akhirIso } = batasPeriodeIso(periodeBulan, periodeTahun);

  // Agregasi dilakukan di database. Satu periode berisi ~117.000 baris
  // presensi se-kementerian - menariknya ke memori cuma untuk dihitung per
  // tanggal jelas pemborosan, dan halaman ini dibuka justru saat orang
  // sedang menelusuri masalah.
  //
  // Penanda "presensi gagal": jam keluar 23:59 (isian otomatis e-Presensi
  // saat absen pulang tidak pernah masuk), ATAU salah satu jamnya kosong.
  const stat = await prisma.$queryRaw<BarisStat[]>`
    SELECT
      tanggal,
      COUNT(*) FILTER (
        WHERE status_kehadiran IN ('WFO','WFH','WFA','HADIR','TERLAMBAT')
      ) AS hari_kerja,
      COUNT(*) FILTER (
        WHERE status_kehadiran IN ('WFO','WFH','WFA','HADIR','TERLAMBAT')
          AND (jam_masuk IS NULL OR jam_keluar IS NULL OR to_char(jam_keluar, 'HH24:MI') = '23:59')
      ) AS kejadian
    FROM presensi_harian
    WHERE tanggal >= ${awalIso}::timestamp AND tanggal < ${akhirIso}::timestamp
    GROUP BY tanggal
    ORDER BY tanggal ASC
  `;

  // Tanggal tanpa satu pun baris berstatus kerja (Sabtu/Minggu, libur
  // nasional) dibuang dari tabel - barisnya cuma "0 dari 0 = 0,0%" dan tidak
  // menjawab apa pun. Deteksi juga sudah mengabaikannya lewat MINIMUM_SAMPEL.
  const statistik: StatistikTanggal[] = stat
    .map((s) => ({
      tanggalIso: s.tanggal.toISOString().slice(0, 10),
      hariKerja: Number(s.hari_kerja),
      kejadian: Number(s.kejadian),
    }))
    .filter((s) => s.hariKerja > 0);
  const janggal = deteksiTanggalJanggal(statistik);
  const petaJanggal = new Map(janggal.map((j) => [j.tanggalIso, j]));

  const penanda = await prisma.kendalaEpresensi.findMany({
    where: { tanggal: { gte: awal, lt: akhir } },
    orderBy: [{ tanggal: "asc" }, { satuanKerja: "asc" }],
    include: { ditandaiOleh: { select: { nama: true, nip: true } } },
  });
  const petaPenanda = new Map<string, typeof penanda>();
  for (const p of penanda) {
    const iso = p.tanggal.toISOString().slice(0, 10);
    if (!petaPenanda.has(iso)) petaPenanda.set(iso, []);
    petaPenanda.get(iso)!.push(p);
  }

  const daftarSatker = (
    await prisma.pegawai.findMany({
      where: { statusPegawai: "AKTIF" },
      select: { satuanKerja: true },
      distinct: ["satuanKerja"],
      orderBy: { satuanKerja: "asc" },
    })
  )
    .map((p) => p.satuanKerja)
    .filter((s): s is string => Boolean(s));

  const belumDitandai = janggal.filter((j) => !petaPenanda.has(j.tanggalIso));
  const th = "px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted";
  const td = "px-3 py-2.5 text-sm text-ink-2";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Kendala e-Presensi</h1>
        <p className="mt-1 text-sm text-muted">
          Pasal 10 ayat (2) Permenaker 15/2024 - kalau presensi elektronik bermasalah, presensi dilakukan manual
          dengan sepengetahuan pimpinan Unit Kerja. Tanggal yang ditandai di sini <strong>tidak</strong> dikenai
          potongan &quot;tidak melakukan presensi&quot;.{" "}
          <Link href="/tukin/presensi" className="link">
            Kembali ke Presensi
          </Link>
        </p>
      </div>

      <form method="get" className="card flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[10rem] flex-1">
          <span className="field-label">Bulan</span>
          <SearchableSelect
            name="bulan"
            options={NAMA_BULAN.map((n, i) => ({ value: String(i + 1), label: n }))}
            defaultValue={String(periodeBulan)}
          />
        </label>
        <label className="w-28">
          <span className="field-label">Tahun</span>
          <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-full" />
        </label>
        <button type="submit" className="btn btn-secondary">
          Terapkan
        </button>
      </form>

      {/* --- Hasil deteksi ---------------------------------------------------- */}
      {belumDitandai.length > 0 && (
        <div className="card border-red/40 bg-red-tint p-4">
          <p className="text-sm font-bold text-ink">
            {belumDitandai.length} tanggal janggal dan belum ditandai
          </p>
          <p className="mt-0.5 text-xs text-ink-2">
            Angka &quot;absen tidak tercatat&quot; di tanggal ini jauh di atas kebiasaan bulan yang sama. Itu pola
            kegagalan sistem, bukan kelalaian orang per orang - <strong>periksa dulu</strong> ke pengelola e-Presensi
            sebelum menandainya.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-ink-2">
            {belumDitandai.map((j) => (
              <li key={j.tanggalIso}>
                <strong>{j.tanggalIso}</strong> ({NAMA_HARI[new Date(j.tanggalIso + "T00:00:00Z").getUTCDay()]}) -{" "}
                {j.kejadian.toLocaleString("id-ID")} dari {j.hariKerja.toLocaleString("id-ID")} hari kerja ={" "}
                <strong>{j.persen.toFixed(1)}%</strong>, sekitar {j.kelipatan === Infinity ? "-" : j.kelipatan.toFixed(1)}x
                hari biasa ({j.medianPersen.toFixed(1)}%)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* --- Tabel per tanggal ------------------------------------------------ */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-bold text-ink">
            Absen tidak tercatat per tanggal - {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Ditandai janggal kalau melebihi {AMBANG_MINIMUM_PERSEN}% <em>dan</em> lebih dari{" "}
            {AMBANG_KELIPATAN_MEDIAN}x median bulan itu. Hari Jumat memang cenderung lebih tinggi dari hari lain -
            itu perilaku manusia, bukan kerusakan, dan tidak ikut tertandai.
          </p>
        </div>
        {statistik.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Belum ada data presensi harian untuk periode ini. Tarik dulu presensinya di{" "}
            <Link href="/tukin/presensi" className="link">
              halaman Presensi
            </Link>
            .
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-2">
                <tr>
                  <th className={th}>Tanggal</th>
                  <th className={th}>Hari</th>
                  <th className={th}>Hari kerja</th>
                  <th className={th}>Absen tidak tercatat</th>
                  <th className={th}>%</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {statistik.map((s) => {
                  const j = petaJanggal.get(s.tanggalIso);
                  const ditandai = petaPenanda.get(s.tanggalIso);
                  const persen = s.hariKerja > 0 ? (s.kejadian / s.hariKerja) * 100 : 0;
                  return (
                    <tr key={s.tanggalIso} className={j && !ditandai ? "bg-red-tint" : undefined}>
                      <td className={`${td} font-mono`}>{s.tanggalIso}</td>
                      <td className={td}>{NAMA_HARI[new Date(s.tanggalIso + "T00:00:00Z").getUTCDay()]}</td>
                      <td className={`${td} font-mono`}>{s.hariKerja.toLocaleString("id-ID")}</td>
                      <td className={`${td} font-mono`}>{s.kejadian.toLocaleString("id-ID")}</td>
                      <td className={`${td} font-mono ${j ? "font-bold text-red" : ""}`}>{persen.toFixed(1)}%</td>
                      <td className={td}>
                        {ditandai ? (
                          <span className="chip chip-green">Ditandai kendala</span>
                        ) : j ? (
                          <span className="chip chip-red">Janggal - perlu dicek</span>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* --- Penanda yang sudah ada ------------------------------------------- */}
      <div className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3">
          <p className="text-sm font-bold text-ink">Tanggal yang sudah ditandai</p>
        </div>
        {penanda.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Belum ada tanggal yang ditandai untuk periode ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-2">
                <tr>
                  <th className={th}>Tanggal</th>
                  <th className={th}>Cakupan</th>
                  <th className={th}>Alasan</th>
                  <th className={th}>Ditandai oleh</th>
                  <th className={th}></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {penanda.map((p) => {
                  const iso = p.tanggal.toISOString().slice(0, 10);
                  return (
                    <tr key={p.id}>
                      <td className={`${td} font-mono`}>{iso}</td>
                      <td className={td}>
                        {p.satuanKerja ?? <span className="chip chip-amber">Seluruh kementerian</span>}
                      </td>
                      <td className={td}>{p.alasan}</td>
                      <td className={td}>
                        {p.ditandaiOleh.nama}
                        <span className="block text-xs text-muted">
                          {p.ditandaiPada.toLocaleDateString("id-ID")}
                        </span>
                      </td>
                      <td className={td}>
                        <CabutKendalaForm id={p.id} tanggal={iso} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line bg-gold-tint px-4 py-3">
          <p className="text-xs text-ink-2">
            <strong>Menandai tanggal tidak langsung mengubah angka.</strong> Pengecualiannya dipakai saat rekap
            presensi dihitung, jadi setelah menandai (atau mencabut) tanggal,{" "}
            <Link href="/tukin/presensi" className="link">
              tarik ulang presensi periode itu
            </Link>{" "}
            supaya berlaku - lalu hitung ulang Tukin-nya.
          </p>
        </div>
      </div>

      <TandaiKendalaForm daftarSatker={daftarSatker} tanggalDisarankan={belumDitandai[0]?.tanggalIso} />
    </div>
  );
}
