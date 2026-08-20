import Link from "next/link";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canKelolaHariLibur, type AuthUser } from "../../../../auth/permissions";
import { AksesDitolak } from "../../../AksesDitolak";
import { NAMA_BULAN } from "../../../bulan";
import { SearchableSelect } from "../../../SearchableSelect";
import { periodePunyaRekapPresensi, resolvePeriode } from "../../../periodeDefault";
import {
  TambahHariLiburForm,
  HapusHariLiburForm,
  UbahHariLiburForm,
  TandaiCepatForm,
  ImporHariLiburForm,
} from "./HariLiburForms";

export const dynamic = "force-dynamic";

/**
 * KALENDER HARI LIBUR NASIONAL & CUTI BERSAMA.
 *
 * Sebelum halaman ini ada, "hari libur" cuma Sabtu & Minggu - tanggal merah
 * yang jatuh di hari kerja terbaca sebagai hari kerja biasa. Akibatnya lembur
 * di tanggal itu dibayar 1x (seharusnya 2x), hari itu ikut jadi batas atas
 * uang makan, dan potongan Pasal 13 tetap berlaku padahal tidak ada kewajiban
 * jam kerja yang bisa dilanggar.
 *
 * Seperti halaman kendala e-Presensi: DETEKSI di sini tidak mengubah apa pun.
 * Yang mengubah angka hanya baris kalender yang ditulis manusia.
 */

interface BarisHadir {
  tanggal: Date;
  hadir: bigint;
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

/**
 * Ambang kandidat: hari kerja yang jumlah hadirnya di bawah 20% median hari
 * kerja lain di bulan yang sama. Di tanggal merah hampir tidak ada yang absen
 * WFO sama sekali, jadi jaraknya sangat lebar - 1 Juni 2026 (Hari Lahir
 * Pancasila) berisi 0 WFO sementara hari kerja biasa ribuan.
 *
 * MEDIAN, bukan rata-rata: kalau satu bulan punya beberapa tanggal merah,
 * rata-ratanya ikut turun dan justru menyamarkan tanggal-tanggal itu.
 */
const AMBANG_PERSEN_MEDIAN = 20;

function median(angka: number[]): number {
  if (angka.length === 0) return 0;
  const urut = [...angka].sort((a, b) => a - b);
  const t = Math.floor(urut.length / 2);
  return urut.length % 2 === 0 ? (urut[t - 1]! + urut[t]!) / 2 : urut[t]!;
}

export default async function HariLiburPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const { bulan, tahun } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canKelolaHariLibur(authUser)) {
    return <AksesDitolak pesan="Hanya PPABP dan Admin yang bisa mengelola kalender hari libur nasional." />;
  }

  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaRekapPresensi()
  );
  const { awalIso, akhirIso } = batasPeriodeIso(periodeBulan, periodeTahun);

  // Agregasi di database - satu periode berisi ~117.000 baris presensi.
  const statHadir = await prisma.$queryRaw<BarisHadir[]>`
    SELECT tanggal, COUNT(*) FILTER (WHERE status_kehadiran IN ('WFO','WFH','HADIR')) AS hadir
    FROM presensi_harian
    WHERE tanggal >= ${awalIso}::timestamp AND tanggal < ${akhirIso}::timestamp
    GROUP BY tanggal
    ORDER BY tanggal
  `;

  const hariKerja = statHadir
    .map((s) => ({
      iso: s.tanggal.toISOString().slice(0, 10),
      dow: s.tanggal.getUTCDay(),
      hadir: Number(s.hadir),
    }))
    .filter((s) => s.dow >= 1 && s.dow <= 5);

  const med = median(hariKerja.map((h) => h.hadir));
  const batas = (med * AMBANG_PERSEN_MEDIAN) / 100;

  const kalender = await prisma.hariLiburNasional.findMany({
    orderBy: { tanggal: "desc" },
    include: { ditetapkanOleh: { select: { nama: true } } },
  });
  const sudahDitetapkan = new Set(kalender.map((k) => k.tanggal.toISOString().slice(0, 10)));

  // Kandidat = hari kerja yang nyaris kosong DAN belum ada di kalender.
  const kandidat = hariKerja.filter((h) => med > 0 && h.hadir < batas && !sudahDitetapkan.has(h.iso));

  const daftarPeriode = await periodePunyaRekapPresensi();

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <p className="text-xs text-muted">
        <Link href="/tukin/presensi" className="hover:underline">
          &larr; Presensi
        </Link>
      </p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight text-ink">Hari Libur Nasional &amp; Cuti Bersama</h1>
      <p className="mt-1 text-sm text-muted">
        Tanggal di kalender ini diperlakukan <strong>sama persis dengan Sabtu/Minggu</strong>: lembur dibayar tarif hari
        libur, hari itu tidak dihitung sebagai hari kerja (tidak dapat uang makan), dan potongan Pasal 13 tidak berlaku.
      </p>

      <div className="mt-3 rounded-xl border border-amber-300 bg-gold-tint p-3 text-xs text-ink-2 dark:border-amber-800">
        <strong>Menambah, mengubah, atau menghapus tanggal TIDAK langsung mengubah angka.</strong> Kalender ini
        dipakai saat rekap presensi dihitung, jadi setelah selesai kamu perlu <strong>tarik ulang presensi</strong>{" "}
        periode yang bersangkutan, lalu <strong>hitung ulang</strong> Tukin/uang makan/lembur.
        <br />
        <strong>Jangan tarik ulang tiap menambah satu tanggal.</strong> Kalender ini berubah paling banyak sekali
        setahun (SKB 3 Menteri): tetapkan seluruh tanggalnya dulu - pakai isian &quot;banyak tanggal sekaligus&quot; di
        bawah - baru tarik ulang, dan cuma untuk periode yang tanggalnya benar-benar berubah.
      </div>

      {/* Filter periode - GET biasa, tetap jalan tanpa JavaScript. */}
      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <label className="block">
          <span className="field-label">Periode yang diperiksa</span>
          <SearchableSelect
            name="bulan"
            options={NAMA_BULAN.map((n, i) => ({ value: String(i + 1), label: n }))}
            defaultValue={String(periodeBulan)}
          />
        </label>
        <label className="block">
          <span className="field-label">Tahun</span>
          <SearchableSelect
            name="tahun"
            options={[...new Set(daftarPeriode.map((p) => p.tahun))].map((t) => ({
              value: String(t),
              label: String(t),
            }))}
            defaultValue={String(periodeTahun)}
          />
        </label>
        <button type="submit" className="btn btn-ghost">
          Periksa periode ini
        </button>
      </form>

      {/* Kandidat hasil deteksi - SARAN, bukan keputusan. */}
      {kandidat.length > 0 && (
        <section className="card mt-4 border-l-4 border-l-red p-4">
          <p className="text-sm font-bold text-ink">
            {kandidat.length} hari kerja nyaris tidak ada yang hadir - kemungkinan tanggal merah
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Dibandingkan ke median hari kerja {NAMA_BULAN[periodeBulan - 1]} {periodeTahun} (
            {med.toLocaleString("id-ID")} orang hadir). Ini <strong>dugaan dari data</strong> - cocokkan dengan SKB 3
            Menteri sebelum menetapkannya.
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-2">
            {kandidat.map((k) => (
              <li key={k.iso} className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{k.iso}</span>
                <span>
                  ({NAMA_HARI[k.dow]}) - cuma <strong>{k.hadir.toLocaleString("id-ID")}</strong> orang hadir
                </span>
                <TandaiCepatForm tanggal={k.iso} />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Tombol di atas menetapkannya dengan keterangan &quot;Libur nasional&quot; - perbaiki namanya lewat tombol
            Ubah di tabel bawah. Tetapkan <strong>semua</strong> tanggalnya dulu, baru tarik ulang presensi sekali.
          </p>
        </section>
      )}

      {kandidat.length === 0 && med > 0 && (
        <p className="mt-4 text-sm text-muted">
          Tidak ada hari kerja {NAMA_BULAN[periodeBulan - 1]} {periodeTahun} yang kehadirannya janggal - kalau ada
          tanggal merah di bulan ini, tetap tetapkan manual di bawah.
        </p>
      )}

      {/* Jalur UTAMA - e-Presensi memang merawat kalendernya sendiri, jadi
          mengetik ulang setahun penuh dari SKB 3 Menteri tidak perlu. Form
          manual tetap di bawahnya buat tanggal yang tidak tercakup. */}
      <div className="mt-4">
        <ImporHariLiburForm tahun={periodeTahun} />
      </div>

      <div className="mt-4">
        <TambahHariLiburForm tanggalDisarankan={kandidat[0]?.iso} />
      </div>

      <section className="card mt-4 p-4">
        <p className="text-sm font-bold text-ink">Kalender yang sudah ditetapkan ({kalender.length})</p>
        {kalender.length === 0 && (
          <p className="mt-2 text-sm text-muted">
            Belum ada satupun. Selama kosong, sistem memperlakukan hari libur = Sabtu &amp; Minggu saja - persis
            perilaku sebelum kalender ini ada.
          </p>
        )}
        {kalender.length > 0 && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted">
                  <th className="py-1 pr-3 font-medium">Tanggal</th>
                  <th className="py-1 pr-3 font-medium">Hari</th>
                  <th className="py-1 pr-3 font-medium">Keterangan</th>
                  <th className="py-1 pr-3 font-medium">Ditetapkan</th>
                  <th className="py-1 font-medium">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {kalender.map((k) => {
                  const iso = k.tanggal.toISOString().slice(0, 10);
                  return (
                    <tr key={k.id} className="border-t border-line/60">
                      <td className="py-1.5 pr-3 font-mono text-ink">{iso}</td>
                      <td className="py-1.5 pr-3 text-ink-2">{NAMA_HARI[k.tanggal.getUTCDay()]}</td>
                      <td className="py-1.5 pr-3 text-ink-2">
                        {k.keterangan}
                        {k.cutiBersama && <span className="ml-1.5 chip chip-muted">cuti bersama</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-xs text-muted">{k.ditetapkanOleh.nama}</td>
                      <td className="py-1.5">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <UbahHariLiburForm
                            id={k.id}
                            tanggal={iso}
                            keterangan={k.keterangan}
                            cutiBersama={k.cutiBersama}
                          />
                          <HapusHariLiburForm id={k.id} tanggal={iso} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
