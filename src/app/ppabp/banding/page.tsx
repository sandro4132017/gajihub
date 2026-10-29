import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canLihatTembusanBanding, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { FilterBar } from "../../../components/forms/FilterBar";
import { SumberAcuan } from "../../../components/shared/SumberAcuan";
import { BandingPpabpCard, type BandingPpabpItem } from "./BandingPpabpCard";
import {
  KeputusanPembayaranCard,
  type BandingRingkas,
  type PegawaiRingkas,
} from "./KeputusanPembayaranCard";
import {
  kelompokkanKeputusan,
  kunciKeputusan,
  labelKeputusan,
  saringStatusBanding,
  STATUS_MENUNGGU_KEPUTUSAN,
  type PembayaranInput,
} from "./keputusanPembayaran";
import { HALAMAN } from "../../../components/layout/layoutHalaman";

export const dynamic = "force-dynamic";

const BATAS_RIWAYAT = 50;

const PILIH_PEGAWAI = {
  id: true,
  nip: true,
  nama: true,
  unitKerja: true,
  satuanKerja: true,
  jabatan: true,
  golongan: true,
  kelasJabatan: true,
} as const;

export default async function TembusanBandingPpabpPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; status?: string; buka?: string }>;
}) {
  const { satker, status: statusMentah, buka } = await searchParams;
  const statusFilter = saringStatusBanding(statusMentah);
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

  // Filter satuan kerja jika ada. Banding punya relasi ke Pegawai;
  // ReconciliationStatus TIDAK (pegawaiId cuma string), jadi untuk recon
  // satker diterjemahkan dulu menjadi daftar id pegawai.
  const whereSatker = satker ? { pegawai: { satuanKerja: satker } } : {};
  let whereReconSatker = {};
  if (satker) {
    const idPegawaiSatker = await prisma.pegawai.findMany({
      where: { satuanKerja: satker },
      select: { id: true },
    });
    whereReconSatker = { pegawaiId: { in: idPegawaiSatker.map((p) => p.id) } };
  }

  // Status DIAJUKAN ikut diambil, diberi label "belum diverifikasi Kasubag TU".
  // Alasannya: status SANGGAH pada ReconciliationStatus dipasang saat banding
  // DIAJUKAN (saya/actions.ts), dan keputusan tahan/bayar paling dibutuhkan
  // SEBELUM ADK dibuat - sering sebelum Kasubag TU sempat memverifikasi.
  // Tanpa label itu, klaim pegawai yang belum diperiksa bisa terbaca sebagai
  // berkas yang sudah divalidasi.
  const [diajukan, perluDiperhatikan, riwayat, reconMenunggu, reconRiwayat] = await Promise.all([
    prisma.banding.findMany({
      where: { status: "DIAJUKAN", ...whereSatker },
      include: { pegawai: { select: PILIH_PEGAWAI }, buktiDukung: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.banding.findMany({
      where: { status: "MENUNGGU_APPROVAL_FINAL", ...whereSatker },
      include: { pegawai: { select: PILIH_PEGAWAI }, buktiDukung: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.banding.findMany({
      where: { status: { in: ["DISETUJUI", "DITOLAK"] }, ...whereSatker },
      include: { pegawai: { select: PILIH_PEGAWAI }, buktiDukung: true },
      orderBy: { updatedAt: "desc" },
      take: BATAS_RIWAYAT,
    }),
    prisma.reconciliationStatus.findMany({
      where: { status: { in: [...STATUS_MENUNGGU_KEPUTUSAN] }, ...whereReconSatker },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.reconciliationStatus.findMany({
      where: { status: "DIPUTUSKAN", ...whereReconSatker },
      orderBy: { updatedAt: "desc" },
      take: BATAS_RIWAYAT,
    }),
  ]);

  const semuaTembusan = [...perluDiperhatikan, ...diajukan, ...riwayat];
  const semuaRecon = [...reconMenunggu, ...reconRiwayat];

  // Banding untuk pasangan recon yang belum ikut terambil di atas (ringan).
  const idTerambil = new Set(semuaTembusan.map((b) => b.id));
  const pasanganRecon = semuaRecon.map((r) => ({
    pegawaiId: r.pegawaiId,
    periodeBulan: r.periodeBulan,
    periodeTahun: r.periodeTahun,
  }));

  const [bandingTambahan, pegawaiRecon, approvalLogs] = await Promise.all([
    pasanganRecon.length === 0
      ? []
      : prisma.banding.findMany({
          where: { OR: pasanganRecon, id: { notIn: [...idTerambil] } },
          select: {
            id: true,
            pegawaiId: true,
            periodeBulan: true,
            periodeTahun: true,
            status: true,
            referensiTipe: true,
            alasan: true,
          },
        }),
    semuaRecon.length === 0
      ? []
      : prisma.pegawai.findMany({
          where: { id: { in: [...new Set(semuaRecon.map((r) => r.pegawaiId))] } },
          select: { id: true, nip: true, nama: true, satuanKerja: true },
        }),
    semuaTembusan.length > 0
      ? prisma.approvalLog.findMany({
          where: {
            referensiTipe: "BANDING",
            referensiId: { in: semuaTembusan.map((b) => b.id) },
          },
          orderBy: { timestampAksi: "asc" },
        })
      : [],
  ]);

  const logsByBandingId = new Map<string, typeof approvalLogs>();
  for (const log of approvalLogs) {
    const arr = logsByBandingId.get(log.referensiId) ?? [];
    arr.push(log);
    logsByBandingId.set(log.referensiId, arr);
  }

  // Konteks pembayaran per (pegawai, periode): pasangan banding + pasangan recon
  const pasanganUnik = new Map<string, { pegawaiId: string; periodeBulan: number; periodeTahun: number }>();
  for (const p of [
    ...semuaTembusan.map((b) => ({ pegawaiId: b.pegawaiId, periodeBulan: b.periodeBulan, periodeTahun: b.periodeTahun })),
    ...pasanganRecon,
  ]) {
    pasanganUnik.set(kunciKeputusan(p.pegawaiId, p.periodeBulan, p.periodeTahun), p);
  }
  const pasangan = [...pasanganUnik.values()];

  const [tukinRows, umRows, lemburRows] = await Promise.all([
    pasangan.length === 0 ? [] : prisma.tukinCalculation.findMany({ where: { OR: pasangan } }),
    pasangan.length === 0 ? [] : prisma.uangMakan.findMany({ where: { OR: pasangan } }),
    pasangan.length === 0 ? [] : prisma.uangLembur.findMany({ where: { OR: pasangan } }),
  ]);

  const pembayaranFlat: PembayaranInput[] = [];
  const petaPembayaran = new Map<string, { jenis: string; status: string }[]>();
  const catat = (
    jenis: string,
    rows: { pegawaiId: string; periodeBulan: number; periodeTahun: number; status: string }[]
  ) => {
    for (const r of rows) {
      const k = kunciKeputusan(r.pegawaiId, r.periodeBulan, r.periodeTahun);
      const daftar = petaPembayaran.get(k) ?? [];
      daftar.push({ jenis, status: r.status });
      petaPembayaran.set(k, daftar);
      pembayaranFlat.push({
        pegawaiId: r.pegawaiId,
        periodeBulan: r.periodeBulan,
        periodeTahun: r.periodeTahun,
        jenis,
        status: r.status,
      });
    }
  };
  catat("Tukin", tukinRows);
  catat("Uang Makan", umRows);
  catat("Uang Lembur", lemburRows);

  const bandingUntukKelompok: BandingRingkas[] = [...semuaTembusan, ...bandingTambahan];
  const { perluDiputuskan, riwayat: riwayatKeputusan } = kelompokkanKeputusan<BandingRingkas, PembayaranInput>(
    semuaRecon,
    bandingUntukKelompok,
    pembayaranFlat
  );

  const pegawaiMap = new Map<string, PegawaiRingkas>(
    pegawaiRecon.map((p) => [p.id, { nama: p.nama, nip: p.nip, satuanKerja: p.satuanKerja }])
  );

  const countTotal = semuaTembusan.length;
  const countKasubag = diajukan.length;
  const countMenunggu = perluDiperhatikan.length;
  const countKeputusan = perluDiputuskan.length;
  const countSelesai = riwayat.length;
  const jumlahKeputusanSudahBergerak = perluDiputuskan.filter((k) => k.pembayaranSudahBergerak).length;

  // Daftar tembusan sesuai filter
  const kunciPerluKeputusan = new Set(
    perluDiputuskan.map((k) => kunciKeputusan(k.recon.pegawaiId, k.recon.periodeBulan, k.recon.periodeTahun))
  );
  let bandingListTersaring = semuaTembusan;
  if (statusFilter === "MENUNGGU_APPROVAL_FINAL") {
    bandingListTersaring = perluDiperhatikan;
  } else if (statusFilter === "SELESAI") {
    bandingListTersaring = riwayat;
  } else if (statusFilter === "PERLU_KEPUTUSAN") {
    bandingListTersaring = semuaTembusan.filter((b) =>
      kunciPerluKeputusan.has(kunciKeputusan(b.pegawaiId, b.periodeBulan, b.periodeTahun))
    );
  } else if (statusFilter !== "SEMUA") {
    bandingListTersaring = semuaTembusan.filter((b) => b.status === statusFilter);
  }

  const tampilKeputusan = statusFilter === "SEMUA" || statusFilter === "PERLU_KEPUTUSAN";
  const tampilRiwayatKeputusan = statusFilter === "SEMUA";

  const hrefHalaman = (ubah: { status?: string; buka?: string }) => {
    const q = new URLSearchParams();
    if (satker) q.set("satker", satker);
    if (ubah.status) q.set("status", ubah.status);
    if (ubah.buka) q.set("buka", ubah.buka);
    const qs = q.toString();
    return `/ppabp/banding${qs ? `?${qs}` : ""}`;
  };
  // "Lihat bukti": pertahankan query lain (satker, status), tambah ?buka=
  const hrefBuka = (bandingId: string) => {
    const q = new URLSearchParams();
    if (satker) q.set("satker", satker);
    if (statusMentah) q.set("status", statusMentah);
    q.set("buka", bandingId);
    return `/ppabp/banding?${q.toString()}#banding-${bandingId}`;
  };

  // Ringkasan keputusan yang ditaruh di kartu banding
  const keputusanUntuk = (b: { pegawaiId: string; periodeBulan: number; periodeTahun: number }) => {
    const k = kunciKeputusan(b.pegawaiId, b.periodeBulan, b.periodeTahun);
    if (kunciPerluKeputusan.has(k)) {
      return {
        teks: "Keputusan pembayaran menunggu",
        anchor: tampilKeputusan ? `keputusan-${k}` : null,
      };
    }
    const sudah = riwayatKeputusan.find(
      (r) => kunciKeputusan(r.recon.pegawaiId, r.recon.periodeBulan, r.recon.periodeTahun) === k
    );
    if (sudah) {
      return { teks: `Keputusan pembayaran: ${labelKeputusan(sudah.recon.keputusanAkhir).replace(/^Catat: /, "")}`, anchor: null };
    }
    return null;
  };

  const tileDasar = "rounded-xl border p-3 transition";

  return (
    <main className={HALAMAN}>
      {/* KEPALA HALAMAN (STANDARD GAJIHUB PAGE HEADER) */}
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Monitoring Banding
        <SumberAcuan
          judul="Dasar aturan & SOP Tembusan PPABP"
          acuan={[
            { aturan: "Tembusan Paralel PPABP", tentang: "Monitoring berkas banding sejak diajukan, termasuk yang belum diverifikasi Kasubag TU" },
            { aturan: "Status Pembayaran", tentang: "Deteksi dini pembayaran Tukin/Uang Makan/Lembur yang terdampak (APPROVED/DIKIRIM)" },
            { aturan: "Keputusan Pembayaran", tentang: "Tahan pembayaran atau susulkan koreksi perhitungan pada siklus berikutnya" },
          ]}
          catatan="PPABP memonitor tembusan untuk mengamankan ADK & pembayaran sebelum atau sesudah penetapan OSDMA."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        PPABP &middot; Pengawasan Tembusan Paralel & Perlindungan ADK Pembayaran
      </p>
      <p className="mt-2 text-sm text-biru">
        Pemantauan banding sejak diajukan pegawai &mdash; termasuk yang belum diverifikasi Kasubag TU &mdash; untuk mendeteksi dini dampak terhadap pembayaran Tukin, Uang Makan, dan Lembur.
      </p>

      {/* FILTER SATUAN KERJA LINTAS KEMENTERIAN */}
      {satuanKerjaList.length > 1 && (
        <div className="mt-4">
          <FilterBar satuanKerjaList={satuanKerjaList} satker={satker} ringkas />
        </div>
      )}

      {/* STAT TILES / FILTER CEPAT PPABP */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <a
          href={hrefHalaman({})}
          className={`col-span-2 sm:col-span-1 ${tileDasar} ${
            statusFilter === "SEMUA"
              ? "border-navy bg-white shadow-sm ring-2 ring-navy/10"
              : "border-line bg-surface-2 hover:border-biru hover:bg-white"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Total Tembusan</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-ink">{countTotal}</p>
        </a>

        <a
          href={hrefHalaman({ status: "DIAJUKAN" })}
          className={`${tileDasar} ${
            statusFilter === "DIAJUKAN"
              ? "border-biru bg-teal-tint/60 shadow-sm ring-2 ring-biru/20"
              : "border-line bg-surface-2 hover:border-biru hover:bg-teal-tint/30"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-biru">Menunggu Kasubag TU</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-biru">{countKasubag}</p>
        </a>

        <a
          href={hrefHalaman({ status: "MENUNGGU_APPROVAL_FINAL" })}
          className={`${tileDasar} ${
            statusFilter === "MENUNGGU_APPROVAL_FINAL"
              ? "border-gold bg-gold-tint/40 shadow-sm ring-2 ring-gold/20"
              : "border-line bg-surface-2 hover:border-gold hover:bg-gold-tint/20"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-gold-deep">Menunggu OSDMA</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-gold-deep">{countMenunggu}</p>
        </a>

        <a
          href={hrefHalaman({ status: "PERLU_KEPUTUSAN" })}
          className={`${tileDasar} ${
            statusFilter === "PERLU_KEPUTUSAN"
              ? "border-amber-500 bg-amber-100 shadow-sm ring-2 ring-amber-400/40"
              : "border-line bg-surface-2 hover:border-amber-400 hover:bg-amber-50"
          }`}
        >
          <div className="flex items-center justify-between gap-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-amber-900">Keputusan pembayaran menunggu</p>
            {jumlahKeputusanSudahBergerak > 0 && (
              <span className="chip chip-warn shrink-0 text-[10px] font-bold">Siap ADK</span>
            )}
          </div>
          <p className="mt-1 font-mono text-xl font-extrabold text-amber-900">{countKeputusan}</p>
        </a>

        <a
          href={hrefHalaman({ status: "SELESAI" })}
          className={`${tileDasar} ${
            statusFilter === "SELESAI"
              ? "border-green bg-green-tint shadow-sm ring-2 ring-green/20"
              : "border-line bg-surface-2 hover:border-green hover:bg-green-tint/50"
          }`}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Banding selesai</p>
          <p className="mt-1 font-mono text-xl font-extrabold text-green">{countSelesai}</p>
        </a>
      </div>

      {/* BANNER: pembayaran terkunci pada pasangan yang menunggu keputusan */}
      {jumlahKeputusanSudahBergerak > 0 && statusFilter === "SEMUA" && (
        <div className="mt-4 border-l-4 border-gold bg-gold-tint/50 py-3 pl-4 pr-3 text-xs leading-relaxed text-ink">
          <p className="font-bold text-ink">
            {jumlahKeputusanSudahBergerak} pasangan pegawai-periode menunggu keputusan, dan pembayarannya telah disetujui (<em>APPROVED</em>) atau sudah ikut ADK (<em>DIKIRIM</em>).
          </p>
          <p className="mt-0.5 text-muted">
            Jika OSDMA mengesahkan banding tersebut, penyesuaian perhitungan tidak bisa dilakukan diam-diam. Tentukan keputusan tahan pembayaran atau koreksi susulan di bagian{" "}
            <a href="#keputusan-menunggu" className="font-semibold text-biru hover:underline">
              keputusan pembayaran menunggu
            </a>{" "}
            di bawah.
          </p>
        </div>
      )}

      {/* (1) KEPUTUSAN PEMBAYARAN MENUNGGU - paling atas: inilah yang harus PPABP kerjakan */}
      {tampilKeputusan && (
        <section id="keputusan-menunggu" className="mt-6 scroll-mt-4">
          <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-muted">
            Keputusan pembayaran menunggu ({countKeputusan})
          </h2>
          {perluDiputuskan.length === 0 ? (
            <p className="mt-2 border-l-4 border-line pl-3 text-xs leading-relaxed text-muted">
              Tidak ada pasangan pegawai-periode yang menunggu keputusan pembayaran
              {satker ? ` di ${satker}` : ""}. Barisnya muncul di sini begitu pegawai mengajukan banding (status SANGGAH) atau rekonsiliasi menemukan selisih (SELISIH).
            </p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {perluDiputuskan.map((k) => (
                <KeputusanPembayaranCard
                  key={k.recon.id}
                  item={k}
                  pegawai={pegawaiMap.get(k.recon.pegawaiId)}
                  varian="menunggu"
                  hrefBuka={hrefBuka}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* (2) DAFTAR KARTU TEMBUSAN PPABP */}
      <div className="mt-8 space-y-4">
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
              {statusFilter === "SEMUA"
                ? `Belum ada banding yang diajukan pegawai${satker ? ` di ${satker}` : ""}, atau semuanya sudah lewat dari batas riwayat ${BATAS_RIWAYAT} berkas.`
                : "Tidak ada banding berstatus ini. Coba filter lain atau kembali ke Total Tembusan."}
            </p>
          </div>
        )}

        {bandingListTersaring.map((b) => (
          <BandingPpabpCard
            key={b.id}
            banding={b as unknown as BandingPpabpItem}
            logs={logsByBandingId.get(b.id) ?? []}
            pembayaran={petaPembayaran.get(kunciKeputusan(b.pegawaiId, b.periodeBulan, b.periodeTahun)) ?? []}
            defaultOpen={bandingListTersaring.length === 1 || buka === b.id}
            keputusan={keputusanUntuk(b)}
          />
        ))}
      </div>

      {/* (3) RIWAYAT KEPUTUSAN PEMBAYARAN - tertutup bawaan */}
      {tampilRiwayatKeputusan && (
        <details className="mt-8 border-t border-line pt-4">
          <summary className="cursor-pointer text-xs font-extrabold uppercase tracking-wider text-muted">
            Riwayat keputusan pembayaran ({riwayatKeputusan.length})
          </summary>
          {riwayatKeputusan.length === 0 ? (
            <p className="mt-3 text-xs text-muted">
              Belum ada keputusan pembayaran yang dicatat{satker ? ` untuk ${satker}` : ""}.
            </p>
          ) : (
            <div className="mt-3 divide-y divide-line">
              {riwayatKeputusan.map((k) => (
                <KeputusanPembayaranCard
                  key={k.recon.id}
                  item={k}
                  pegawai={pegawaiMap.get(k.recon.pegawaiId)}
                  varian="riwayat"
                  hrefBuka={hrefBuka}
                />
              ))}
            </div>
          )}
        </details>
      )}
    </main>
  );
}

