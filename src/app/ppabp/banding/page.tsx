import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canLihatTembusanBanding, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { labelReferensiBanding } from "../../../business-logic/bandingData";
import { HALAMAN } from "../../layoutHalaman";
import { NAMA_BULAN } from "../../bulan";

export const dynamic = "force-dynamic";

/**
 * Status kalkulasi yang berarti "uangnya sudah bergerak" - dan itu yang
 * membedakan tembusan ini dari sekadar daftar.
 *
 * DIKIRIM = sudah ikut ADK yang disetor ke Web Gaji. APPROVED = sudah lolos
 * approval berjenjang dan siap diekspor. Banding yang mendarat pada periode
 * berstatus salah satu dari keduanya TIDAK BISA lagi diperbaiki dengan
 * menghitung ulang diam-diam; perlu keputusan sadar PPABP - tahan pembayaran,
 * atau koreksi di siklus berikutnya (lihat `ReconciliationStatus.keputusanAkhir`).
 */
const STATUS_SUDAH_BERGERAK = new Set(["APPROVED", "DIKIRIM"]);

const WARNA_STATUS_BANDING = {
  MENUNGGU_APPROVAL_FINAL: "amber",
  DISETUJUI: "hijau",
  DITOLAK: "merah",
} as const;

const LABEL_STATUS_BANDING = {
  MENUNGGU_APPROVAL_FINAL: "Menunggu keputusan OSDMA",
  DISETUJUI: "Disetujui OSDMA",
  DITOLAK: "Ditolak",
} as const;

/** Jumlah riwayat yang ikut ditampilkan - riwayat penuh bukan tujuan halaman ini. */
const BATAS_RIWAYAT = 30;

function periodeTeks(bulan: number, tahun: number) {
  return `${NAMA_BULAN[bulan - 1] ?? bulan} ${tahun}`;
}

/**
 * TEMBUSAN Banding untuk PPABP - banding yang sudah lolos verifikasi Kasubag TU.
 *
 * KENAPA READ-ONLY, dan kenapa itu bukan kekurangan. Keputusan user
 * 2026-09-29: sesudah Kasubag TU approve, banding diteruskan ke OSDMA untuk
 * diputuskan DAN ditembuskan ke PPABP secara paralel. PPABP TIDAK ikut
 * memutuskan - yang memperbaiki data tetap OSDMA sebagai data steward, karena
 * presensi, predikat kinerja, dan kelas jabatan semuanya di luar jangkauan
 * PPABP. Memberi mereka tombol setuju/tolak di sini cuma menambah satu pintu
 * yang bisa MENAHAN koreksi tanpa menambah pemeriksaan yang berarti.
 *
 * Yang dibutuhkan PPABP adalah TAHU, dan tahu SEDINI MUNGKIN - karena
 * pembayaran periode yang dipersoalkan bisa jadi sudah APPROVED atau bahkan
 * sudah ikut ADK. Itu sebabnya kolom "Status pembayaran" ada di halaman ini:
 * tanpa itu, tembusan ini cuma daftar yang harus dicek satu-satu di halaman
 * lain, dan yang tidak pernah dicek sama dengan tidak dikirim.
 *
 * TIDAK ADA TULISAN KE DATABASE di seluruh berkas ini - nol create/update/
 * delete, tidak ada Server Action, tidak ada migrasi. Tindak lanjutnya lewat
 * jalur yang SUDAH ada: /ppabp/rekonsiliasi buat keputusan tahan-atau-koreksi,
 * dan halaman kalkulasi unit buat hitung ulang.
 */
export default async function TembusanBandingPpabpPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canLihatTembusanBanding(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat tembusan banding." />;
  }

  // Status DIAJUKAN sengaja TIDAK diambil: itu banding yang masih di tangan
  // Kasubag TU, belum lolos jenjang 1. Menembuskannya sekarang berarti PPABP
  // menanggapi persoalan yang bisa jadi ditolak unitnya sendiri beberapa jam
  // kemudian - dan tembusan yang sebagian besar isinya batal akan berhenti
  // dibaca.
  // DUA query terpisah, bukan satu query lalu disaring di memori.
  //
  // Yang menunggu keputusan OSDMA diambil SEMUA - itu isi pekerjaannya, dan
  // memotongnya berarti ada banding yang tidak pernah terlihat siapa pun.
  // Riwayatnya justru DIBATASI: setelah beberapa tahun ia tumbuh tanpa batas
  // sementara gunanya cuma konteks. Kalau keduanya diambil dalam satu query
  // lalu dipotong di memori, yang terpotong tidak bisa ditentukan - bisa jadi
  // malah yang menunggu keputusan.
  const [perluDiperhatikan, riwayat, totalRiwayat] = await Promise.all([
    prisma.banding.findMany({
      where: { status: "MENUNGGU_APPROVAL_FINAL" },
      include: { pegawai: true, buktiDukung: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.banding.findMany({
      where: { status: { in: ["DISETUJUI", "DITOLAK"] } },
      include: { pegawai: true, buktiDukung: true },
      orderBy: { updatedAt: "desc" },
      take: BATAS_RIWAYAT,
    }),
    prisma.banding.count({ where: { status: { in: ["DISETUJUI", "DITOLAK"] } } }),
  ]);
  const ditampilkan = [...perluDiperhatikan, ...riwayat];

  // Konteks pembayaran per (pegawai, periode) yang dipersoalkan.
  //
  // Diambil dalam TIGA query kumpulan, bukan satu query per baris banding:
  // daftar ini bisa berisi puluhan baris dan pola satu-query-per-baris itu
  // yang membuat halaman terasa lambat tanpa sebab yang kelihatan.
  //
  // Banding DATA_PEGAWAI tidak terikat periode (periodeBulan/Tahun-nya ikut
  // periode pengajuan), jadi konteks pembayarannya memang bisa kosong - itu
  // dinyatakan di layar, bukan dibiarkan terbaca sebagai "belum dibayar".
  const pasangan = ditampilkan.map((b) => ({
    pegawaiId: b.pegawaiId,
    periodeBulan: b.periodeBulan,
    periodeTahun: b.periodeTahun,
  }));
  const kunci = (pegawaiId: string, bulan: number, tahun: number) => `${pegawaiId}|${bulan}|${tahun}`;

  const [tukinRows, umRows, lemburRows] = await Promise.all([
    pasangan.length === 0 ? [] : prisma.tukinCalculation.findMany({ where: { OR: pasangan } }),
    pasangan.length === 0 ? [] : prisma.uangMakan.findMany({ where: { OR: pasangan } }),
    pasangan.length === 0 ? [] : prisma.uangLembur.findMany({ where: { OR: pasangan } }),
  ]);

  const petaPembayaran = new Map<string, { jenis: string; status: string }[]>();
  const catat = (jenis: string, rows: { pegawaiId: string; periodeBulan: number; periodeTahun: number; status: string }[]) => {
    for (const r of rows) {
      const k = kunci(r.pegawaiId, r.periodeBulan, r.periodeTahun);
      const daftar = petaPembayaran.get(k) ?? [];
      daftar.push({ jenis, status: r.status });
      petaPembayaran.set(k, daftar);
    }
  };
  catat("Tukin", tukinRows);
  catat("Uang Makan", umRows);
  catat("Uang Lembur", lemburRows);

  const jumlahSudahBergerak = perluDiperhatikan.filter((b) =>
    (petaPembayaran.get(kunci(b.pegawaiId, b.periodeBulan, b.periodeTahun)) ?? []).some((p) =>
      STATUS_SUDAH_BERGERAK.has(p.status)
    )
  ).length;

  function KartuBanding({ b }: { b: (typeof ditampilkan)[number] }) {
    const pembayaran = petaPembayaran.get(kunci(b.pegawaiId, b.periodeBulan, b.periodeTahun)) ?? [];
    const sudahBergerak = pembayaran.filter((p) => STATUS_SUDAH_BERGERAK.has(p.status));

    return (
      <div className="card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink">{b.pegawai.nama}</p>
            <p className="text-sm text-muted">
              NIP <span className="font-mono">{b.pegawai.nip}</span>
              <span className="mx-1.5 text-line">&bull;</span>
              {b.pegawai.satuanKerja}
              <span className="mx-1.5 text-line">&bull;</span>
              {periodeTeks(b.periodeBulan, b.periodeTahun)}
            </p>
          </div>
          <StatusBadge
            label={LABEL_STATUS_BANDING[b.status as keyof typeof LABEL_STATUS_BANDING] ?? b.status}
            warna={WARNA_STATUS_BANDING[b.status as keyof typeof WARNA_STATUS_BANDING] ?? "abu"}
          />
        </div>

        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold text-muted">Yang dipersoalkan</dt>
            <dd className="text-ink-2">
              {labelReferensiBanding(b.referensiTipe)}
              {b.bagianData && <span className="text-muted"> &mdash; {b.bagianData}</span>}
            </dd>
          </div>
          {b.usulanPerbaikan && (
            <div>
              <dt className="text-xs font-semibold text-muted">Usulan pegawai</dt>
              {/* USULAN, bukan koreksi - tidak pernah ditulis otomatis ke data
                  mana pun (lihat komentar di model Banding). */}
              <dd className="text-ink-2">{b.usulanPerbaikan}</dd>
            </div>
          )}
          <div className="sm:col-span-2">
            <dt className="text-xs font-semibold text-muted">Alasan</dt>
            <dd className="leading-relaxed text-ink-2">{b.alasan}</dd>
          </div>
        </dl>

        {/* ----------------------------------------------------------------
            KONTEKS PEMBAYARAN - alasan halaman ini ada.
            ---------------------------------------------------------------- */}
        <div
          className={`mt-3 p-3 ${
            sudahBergerak.length > 0 ? "border-l-2 border-l-gold bg-surface-2" : "rounded-xl bg-surface-2"
          }`}
        >
          <p className="text-xs font-bold text-ink">Status pembayaran periode itu</p>
          {pembayaran.length === 0 ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Belum ada baris kalkulasi untuk pegawai ini di {periodeTeks(b.periodeBulan, b.periodeTahun)}. Kalau
              bandingnya soal data pegawai, itu wajar - data pegawai tidak terikat periode.
            </p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {pembayaran.map((p) => (
                <li key={p.jenis} className="text-xs">
                  <span className="rounded-md bg-surface px-2 py-1 text-ink-2">
                    {p.jenis}{" "}
                    <strong className={STATUS_SUDAH_BERGERAK.has(p.status) ? "text-ink" : "text-muted"}>
                      {p.status}
                    </strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {sudahBergerak.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-ink-2">
              Sudah melewati approval{sudahBergerak.some((p) => p.status === "DIKIRIM") ? " dan sudah ikut ADK" : ""}.
              Kalau OSDMA menyetujui bandingnya, koreksinya tidak bisa lagi masuk lewat hitung ulang biasa -
              perlu keputusan tahan pembayaran atau koreksi di siklus berikutnya lewat{" "}
              <Link href="/ppabp/rekonsiliasi" className="font-semibold text-teal-deep underline">
                Rekonsiliasi
              </Link>
              .
            </p>
          )}
        </div>

        {b.buktiDukung.length > 0 && (
          <p className="mt-2 text-xs text-muted">
            {b.buktiDukung.length} bukti dukung dilampirkan pegawai.
          </p>
        )}
      </div>
    );
  }

  return (
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Tembusan Banding</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Banding yang sudah lolos verifikasi Kasubag TU dan sedang menunggu keputusan OSDMA. Halaman ini{" "}
        <strong className="font-semibold text-ink-2">tembusan</strong> - keputusannya di OSDMA, yang perlu PPABP
        tahu adalah pembayaran periode mana yang mungkin terpengaruh.
      </p>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-muted">
        Perlu diperhatikan ({perluDiperhatikan.length})
      </h2>
      {jumlahSudahBergerak > 0 && (
        <p className="mt-2 border-l-2 border-l-gold bg-surface-2 p-3 text-xs leading-relaxed text-ink-2">
          <strong className="font-bold text-ink">
            {jumlahSudahBergerak} dari {perluDiperhatikan.length} menyangkut periode yang pembayarannya sudah
            disetujui atau sudah dikirim.
          </strong>{" "}
          Itu yang perlu diputuskan lebih dulu - bukan bandingnya, tapi apakah pembayarannya ditahan atau
          dikoreksi di siklus berikutnya.
        </p>
      )}
      <div className="mt-2 space-y-4">
        {perluDiperhatikan.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Tidak ada banding yang sedang menunggu keputusan OSDMA.
          </p>
        )}
        {perluDiperhatikan.map((b) => (
          <KartuBanding key={b.id} b={b} />
        ))}
      </div>

      <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">
        Sudah diputuskan OSDMA ({riwayat.length}
        {totalRiwayat > riwayat.length ? ` dari ${totalRiwayat}` : ""})
      </h2>
      <div className="mt-2 space-y-4">
        {riwayat.length === 0 && (
          <p className="card p-6 text-sm text-muted">Belum ada banding yang diputuskan OSDMA.</p>
        )}
        {riwayat.map((b) => (
          <KartuBanding key={b.id} b={b} />
        ))}
      </div>
    </main>
  );
}
