import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canLihatTembusanBanding, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { FilterBar } from "../../FilterBar";
import { SumberAcuan } from "../../SumberAcuan";
import { BandingPpabpCard, type BandingPpabpItem } from "./BandingPpabpCard";
import { HALAMAN } from "../../layoutHalaman";

export const dynamic = "force-dynamic";

const STATUS_SUDAH_BERGERAK = new Set(["APPROVED", "DIKIRIM"]);
const BATAS_RIWAYAT = 50;

export default async function TembusanBandingPpabpPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; status?: string }>;
}) {
  const { satker, status: statusFilter } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canLihatTembusanBanding(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat tembusan banding." />;
  }

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  // Filter satuan kerja jika ada
  const whereSatker = satker ? { pegawai: { satuanKerja: satker } } : {};

  // Status DIAJUKAN sengaja tidak diambil karena belum diverifikasi Kasubag TU.
  // Yang diambil adalah MENUNGGU_APPROVAL_FINAL (perlu perhatian), DISETUJUI, dan DITOLAK.
  const [perluDiperhatikan, riwayat] = await Promise.all([
    prisma.banding.findMany({
      where: {
        status: "MENUNGGU_APPROVAL_FINAL",
        ...whereSatker,
      },
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
      orderBy: { updatedAt: "desc" },
    }),
    prisma.banding.findMany({
      where: {
        status: { in: ["DISETUJUI", "DITOLAK"] },
        ...whereSatker,
      },
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
      orderBy: { updatedAt: "desc" },
      take: BATAS_RIWAYAT,
    }),
  ]);

  const semuaTembusan = [...perluDiperhatikan, ...riwayat];

  // Ambil data approval log untuk timeline pelacakan
  const bandingIds = semuaTembusan.map((b) => b.id);
  const approvalLogs =
    bandingIds.length > 0
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

  // Konteks pembayaran per (pegawai, periode) yang dipersoalkan
  const pasangan = semuaTembusan.map((b) => ({
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
  const catat = (
    jenis: string,
    rows: { pegawaiId: string; periodeBulan: number; periodeTahun: number; status: string }[]
  ) => {
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

  // Hitung jumlah item dengan status pembayaran sudah bergerak (APPROVED / DIKIRIM)
  const jumlahSudahBergerak = perluDiperhatikan.filter((b) =>
    (petaPembayaran.get(kunci(b.pegawaiId, b.periodeBulan, b.periodeTahun)) ?? []).some((p) =>
      STATUS_SUDAH_BERGERAK.has(p.status)
    )
  ).length;

  const countTotal = semuaTembusan.length;
  const countMenunggu = perluDiperhatikan.length;
  const countSelesai = riwayat.length;

  // Filter list berdasarkan statusFilter jika dipilih
  let bandingListTersaring = semuaTembusan;
  if (statusFilter === "MENUNGGU_APPROVAL_FINAL") {
    bandingListTersaring = perluDiperhatikan;
  } else if (statusFilter === "SELESAI") {
    bandingListTersaring = riwayat;
  } else if (statusFilter === "PERLU_REKONSILIASI") {
    bandingListTersaring = perluDiperhatikan.filter((b) =>
      (petaPembayaran.get(kunci(b.pegawaiId, b.periodeBulan, b.periodeTahun)) ?? []).some((p) =>
        STATUS_SUDAH_BERGERAK.has(p.status)
      )
    );
  } else if (statusFilter) {
    bandingListTersaring = semuaTembusan.filter((b) => b.status === statusFilter);
  }

  return (
    <main className={HALAMAN}>
      {/* KEPALA HALAMAN (STANDARD GAJIHUB PAGE HEADER) */}
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Monitoring Banding
        <SumberAcuan
          judul="Dasar aturan & SOP Tembusan PPABP"
          acuan={[
            { aturan: "Tembusan Paralel PPABP", tentang: "Monitoring berkas banding yang telah lolos verifikasi Kasubag TU" },
            { aturan: "Status Pembayaran", tentang: "Deteksi dini pembayaran Tukin/Uang Makan/Lembur yang terdampak (APPROVED/DIKIRIM)" },
            { aturan: "Keputusan Rekonsiliasi", tentang: "Tahan pembayaran atau susulkan koreksi perhitungan pada siklus berikutnya" },
          ]}
          catatan="PPABP memonitor tembusan untuk mengamankan ADK & pembayaran sebelum atau sesudah penetapan OSDMA."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        PPABP &middot; Pengawasan Tembusan Paralel & Perlindungan ADK Pembayaran
      </p>
      <p className="mt-2 text-sm text-biru">
        Pemantauan status banding yang telah diverifikasi Kasubag TU untuk mendeteksi dini dampak terhadap pembayaran Tukin, Uang Makan, dan Lembur.
      </p>

      {/* FILTER SATUAN KERJA LINTAS KEMENTERIAN */}
      {satuanKerjaList.length > 1 && (
        <div className="mt-4">
          <FilterBar
            satuanKerjaList={satuanKerjaList}
            satker={satker}
            ringkas
          />
        </div>
      )}

      {/* STAT TILES / FILTER CEPAT PPABP */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <a
          href={`/ppabp/banding${satker ? `?satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            !statusFilter
              ? "border-navy bg-white shadow-sm ring-2 ring-navy/10"
              : "border-line bg-surface-2 hover:border-biru hover:bg-white"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Total Tembusan</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">{countTotal}</p>
        </a>

        <a
          href={`/ppabp/banding?status=MENUNGGU_APPROVAL_FINAL${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "MENUNGGU_APPROVAL_FINAL"
              ? "border-gold bg-gold-tint/40 shadow-sm ring-2 ring-gold/20"
              : "border-line bg-surface-2 hover:border-gold hover:bg-gold-tint/20"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-gold-deep">Menunggu OSDMA</p>
            {countMenunggu > 0 && (
              <span className="size-2 animate-ping rounded-full bg-gold" />
            )}
          </div>
          <p className="mt-1 font-mono text-xl font-extrabold text-gold-deep">{countMenunggu}</p>
        </a>

        <a
          href={`/ppabp/banding?status=PERLU_REKONSILIASI${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "PERLU_REKONSILIASI"
              ? "border-amber-500 bg-amber-100 shadow-sm ring-2 ring-amber-400/40"
              : "border-line bg-surface-2 hover:border-amber-400 hover:bg-amber-50"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Perlu Rekonsiliasi</p>
            {jumlahSudahBergerak > 0 && (
              <span className="chip chip-warn text-[10px] font-bold">⚠️ Siap ADK</span>
            )}
          </div>
          <p className="mt-1 font-mono text-xl font-extrabold text-amber-900">{jumlahSudahBergerak}</p>
        </a>

        <a
          href={`/ppabp/banding?status=SELESAI${satker ? `&satker=${encodeURIComponent(satker)}` : ""}`}
          className={`rounded-xl border p-3 transition ${
            statusFilter === "SELESAI"
              ? "border-green bg-green-tint shadow-sm ring-2 ring-green/20"
              : "border-line bg-surface-2 hover:border-green hover:bg-green-tint/50"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Selesai Diputuskan</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-green">{countSelesai}</p>
        </a>
      </div>

      {/* BANNER PERINGATAN REKONSILIASI PEMBAYARAN JIKA ADA DATA TERKUNCI */}
      {jumlahSudahBergerak > 0 && !statusFilter && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-gold bg-gold-tint/50 p-4 text-xs leading-relaxed text-ink">
          <span className="text-base">⚠️</span>
          <div>
            <p className="font-bold text-ink">
              {jumlahSudahBergerak} berkas banding menyangkut periode yang pembayarannya telah disetujui (<em>APPROVED</em>) atau sudah ikut ADK (<em>DIKIRIM</em>).
            </p>
            <p className="mt-0.5 text-muted">
              Jika OSDMA mengesahkan banding tersebut, penyesuaian perhitungan tidak bisa dilakukan secara diam-diam. Silakan tentukan keputusan tahan pembayaran atau koreksi susulan melalui menu Rekonsiliasi.
            </p>
          </div>
        </div>
      )}

      {/* DAFTAR KARTU TEMBUSAN PPABP (ACCORDION LANDSCAPE TRACKER) */}
      <div className="mt-6 space-y-4">
        {bandingListTersaring.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-muted">
              Daftar Tembusan Banding ({bandingListTersaring.length})
            </h2>
            <span className="text-xs text-muted">
              Klik baris kartu untuk membuka rincian alur, status pembayaran, dan bukti pendukung
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
            <h3 className="mt-3 text-sm font-bold text-ink">Tidak ada tembusan banding pada filter ini</h3>
            <p className="mt-1 text-xs text-muted">
              Semua tembusan yang masuk telah selesai atau belum ada berkas baru yang diteruskan oleh Kasubag TU.
            </p>
          </div>
        )}

        {bandingListTersaring.map((b) => (
          <BandingPpabpCard
            key={b.id}
            banding={b as unknown as BandingPpabpItem}
            logs={logsByBandingId.get(b.id) ?? []}
            pembayaran={petaPembayaran.get(kunci(b.pegawaiId, b.periodeBulan, b.periodeTahun)) ?? []}
            defaultOpen={bandingListTersaring.length === 1}
          />
        ))}
      </div>
    </main>
  );
}
