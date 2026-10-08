import { prisma } from "../../../lib/prisma";
import { canViewRekapUnitKerja } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { FilterBar } from "../../FilterBar";
import { SumberAcuan } from "../../SumberAcuan";
import { BandingKasubagCard, type BandingKasubagItem } from "./BandingKasubagCard";
import { HALAMAN } from "../../layoutHalaman";

export const dynamic = "force-dynamic";

export default async function VerifikasiBandingUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; status?: string }>;
}) {
  const { satker, status: statusFilter } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja));

  if (!satkerEfektif) {
    return (
      <main className={HALAMAN}>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Verifikasi Banding</h1>
        <p className="mt-2 text-sm text-biru">Pilih satuan kerja terlebih dahulu.</p>
        <div className="mt-4">
          <FilterBar satuanKerjaList={satuanKerjaList} satker={satker} />
        </div>
      </main>
    );
  }

  if (!canViewRekapUnitKerja(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat banding unit ini." />;
  }

  const bandingListRaw = await prisma.banding.findMany({
    where: { pegawai: { satuanKerja: satkerEfektif } },
    include: {
      pegawai: {
        select: {
          id: true,
          nip: true,
          nama: true,
          unitKerja: true,
          satuanKerja: true,
          jabatan: true,
          golongan: true,
          kelasJabatan: true,
        },
      },
      buktiDukung: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const bandingIds = bandingListRaw.map((b) => b.id);
  const approvalLogs = bandingIds.length > 0
    ? await prisma.approvalLog.findMany({
        where: {
          referensiTipe: "BANDING",
          referensiId: { in: bandingIds },
        },
        orderBy: { timestampAksi: "asc" },
      })
    : [];

  const logsByBandingId = new Map<string, typeof approvalLogs>();
  for (const log of approvalLogs) {
    const arr = logsByBandingId.get(log.referensiId) ?? [];
    arr.push(log);
    logsByBandingId.set(log.referensiId, arr);
  }

  // Summary counts
  const countTotal = bandingListRaw.length;
  const countMenunggu = bandingListRaw.filter((b) => b.status === "DIAJUKAN").length;
  const countDiteruskan = bandingListRaw.filter((b) => b.status === "MENUNGGU_APPROVAL_FINAL").length;
  const countDisetujui = bandingListRaw.filter((b) => b.status === "DISETUJUI").length;
  const countDitolak = bandingListRaw.filter((b) => b.status === "DITOLAK").length;

  const bandingListTersaring = statusFilter
    ? bandingListRaw.filter((b) => b.status === statusFilter)
    : bandingListRaw;

  return (
    <main className={HALAMAN}>
      {/* KEPALA HALAMAN */}
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Verifikasi Banding
        <SumberAcuan
          judul="Dasar aturan & SOP"
          acuan={[
            { aturan: "Jenjang 1 (Unit Kerja)", tentang: "Kasubag TU memeriksa dan memvalidasi keabsahan berkas banding pegawai" },
            { aturan: "Jenjang 2 (Biro OSDMA)", tentang: "Biro OSDMA memberikan persetujuan final untuk pemutakhiran data kementerian" },
            { aturan: "Tembusan PPABP", tentang: "Data banding yang berjalan ditembuskan ke PPABP Rokeu untuk pengawasan payroll" },
            { aturan: "Prinsip Integrasi", tentang: "Data dimutakhirkan pada sistem sumber (SIAP / e-Presensi / e-Kinerja) lalu disinkronkan ke Gajihub" },
          ]}
          catatan="Persetujuan Kasubag TU meneruskan banding ke Biro OSDMA. Penolakan menyelesaikan banding di tingkat unit kerja."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        {satkerEfektif} &middot; Jenjang 1 (Verifikasi Kasubag TU)
      </p>
      <p className="mt-2 text-sm text-biru">
        Pemeriksaan dan penelaahan berkas banding data kepegawaian, presensi, kinerja, dan kalkulasi pendapatan pegawai.
      </p>

      {/* FILTER SATUAN KERJA JIKA MEMILIKI AKSES MULTI-SATKER */}
      {satuanKerjaList.length > 1 && (
        <div className="mt-4">
          <FilterBar
            satuanKerjaList={satuanKerjaList}
            satker={satkerEfektif}
            ringkas
          />
        </div>
      )}

      {/* STAT TILES / FILTER CEPAT */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <a
          href={`/kasubag/banding${satker ? `?satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            !statusFilter
              ? "border-navy bg-white shadow-sm ring-2 ring-navy/10"
              : "border-line bg-surface-2 hover:border-biru hover:bg-white"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Total Banding</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">{countTotal}</p>
        </a>

        <a
          href={`/kasubag/banding?status=DIAJUKAN${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "DIAJUKAN"
              ? "border-gold bg-gold-tint/40 shadow-sm ring-2 ring-gold/20"
              : "border-line bg-surface-2 hover:border-gold hover:bg-gold-tint/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gold-deep">Menunggu Anda</p>
            {countMenunggu > 0 && (
              <span className="size-2 animate-ping rounded-full bg-gold" />
            )}
          </div>
          <p className="mt-1 font-mono text-xl font-extrabold text-gold-deep">{countMenunggu}</p>
        </a>

        <a
          href={`/kasubag/banding?status=MENUNGGU_APPROVAL_FINAL${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "MENUNGGU_APPROVAL_FINAL"
              ? "border-biru bg-teal-tint shadow-sm ring-2 ring-biru/20"
              : "border-line bg-surface-2 hover:border-biru hover:bg-teal-tint/50"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Diteruskan OSDMA</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-navy">{countDiteruskan}</p>
        </a>

        <a
          href={`/kasubag/banding?status=DISETUJUI${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "DISETUJUI"
              ? "border-green bg-green-tint shadow-sm ring-2 ring-green/20"
              : "border-line bg-surface-2 hover:border-green hover:bg-green-tint/50"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Selesai Disetujui</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-green">{countDisetujui}</p>
        </a>

        <a
          href={`/kasubag/banding?status=DITOLAK${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "DITOLAK"
              ? "border-red bg-red-tint shadow-sm ring-2 ring-red/20"
              : "border-line bg-surface-2 hover:border-red hover:bg-red-tint/50"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Ditolak</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-red">{countDitolak}</p>
        </a>
      </div>

      {/* DAFTAR KARTU VERIFIKASI BANDING (LANDSCAPE TRACKER CARD) */}
      <div className="mt-6 space-y-4">
        {bandingListTersaring.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
              Daftar Banding Pegawai ({bandingListTersaring.length})
            </h2>
            <span className="text-xs text-muted">
              Klik baris kartu untuk membuka rincian alur, bukti pendukung, dan meneruskan/menolak verifikasi
            </span>
          </div>
        )}

        {bandingListTersaring.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line bg-surface-2 p-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-line-2 text-muted">
              <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="mt-3 text-sm font-bold text-ink">Tidak ada banding pada filter ini</h3>
            <p className="mt-1 text-xs text-muted">
              Semua berkas banding unit {satkerEfektif} telah diproses atau belum ada pengajuan baru.
            </p>
          </div>
        )}

        {bandingListTersaring.map((b) => (
          <BandingKasubagCard
            key={b.id}
            banding={b as unknown as BandingKasubagItem}
            logs={logsByBandingId.get(b.id) ?? []}
            defaultOpen={bandingListTersaring.length === 1}
          />
        ))}
      </div>
    </main>
  );
}
