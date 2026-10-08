import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canReviewPerubahanDataMaster, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";
import { HALAMAN } from "../layoutHalaman";
import { labelReferensiBanding } from "../../business-logic/bandingData";
import { NAMA_BULAN } from "../bulan";
import { IoMdCheckboxOutline } from "react-icons/io";
import { RiScalesLine, RiFileWarningLine, RiShieldCheckLine } from "react-icons/ri";
import { GrDocument, GrDocumentUser } from "react-icons/gr";
import { FiArrowRight, FiCheckCircle, FiClock, FiAlertCircle } from "react-icons/fi";

export const dynamic = "force-dynamic";

const formatTanggal = (tanggal: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(tanggal);

export default async function OsdmaDashboardPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };

  // Guard: Memastikan hanya akun dengan wewenang OSDMA/Admin yang dapat mengakses
  if (!authUser || !canReviewPerubahanDataMaster(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus Biro OSDMA." />;
  }

  // Tarik metrik status antrean dan riwayat
  const [
    bandingMenunggu,
    bandingSelesai,
    skKgbMenunggu,
    skKgbSelesai,
    skHukdisMenunggu,
    skHukdisSelesai,
    antreanBanding,
    antreanSkKgb,
    antreanHukdis,
    riwayatBandingTerbaru,
  ] = await Promise.all([
    prisma.banding.count({ where: { status: "MENUNGGU_APPROVAL_FINAL" } }),
    prisma.banding.count({ where: { status: { in: ["DISETUJUI", "DITOLAK"] } } }),
    prisma.skKgb.count({ where: { status: "DIAJUKAN" } }),
    prisma.skKgb.count({ where: { status: { in: ["DISETUJUI", "DITOLAK"] } } }),
    prisma.skHukumanDisiplin.count({ where: { status: "DIAJUKAN" } }),
    prisma.skHukumanDisiplin.count({ where: { status: { in: ["DISETUJUI", "DITOLAK"] } } }),
    prisma.banding.findMany({
      where: { status: "MENUNGGU_APPROVAL_FINAL" },
      include: { pegawai: true, buktiDukung: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.skKgb.findMany({
      where: { status: "DIAJUKAN" },
      include: { pegawai: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.skHukumanDisiplin.findMany({
      where: { status: "DIAJUKAN" },
      include: { pegawai: true },
      orderBy: { createdAt: "desc" },
      take: 4,
    }),
    prisma.banding.findMany({
      where: { status: { in: ["DISETUJUI", "DITOLAK"] } },
      include: { pegawai: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  const totalAntrean = bandingMenunggu + skKgbMenunggu + skHukdisMenunggu;
  const totalSelesai = bandingSelesai + skKgbSelesai + skHukdisSelesai;

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. HEADER UTAMA BIRO OSDMA
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Dashboard OSDMA
              </h1>
              <span className="chip chip-navy font-semibold text-xs">
                Biro OSDMA
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Pusat kendali persetujuan akhir data master kepegawaian, pengesahan usulan SK, dan penetapan banding kementerian.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/osdma/update-sk"
              className="btn btn-primary inline-flex items-center gap-2"
            >
              <GrDocumentUser className="size-4" />
              <span>Update SK Pegawai</span>
            </Link>
            <Link
              href="/osdma/banding"
              className="btn btn-ghost inline-flex items-center gap-2"
            >
              <IoMdCheckboxOutline className="size-4 text-biru" />
              <span>Persetujuan Banding</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. BANNER KEWENANGAN BIRO OSDMA
          ==================================================================== */}
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-surface to-surface-2/80 p-4 sm:p-5 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
        <div className="flex items-start gap-3.5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-tint text-biru shadow-xs ring-1 ring-biru/20">
            <RiShieldCheckLine className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-extrabold uppercase tracking-wide text-ink">
              Kewenangan Biro OSDMA
            </h2>
            <p className="mt-0.5 text-xs sm:text-sm text-ink-2 leading-relaxed">
              Persetujuan akhir Anda mengesahkan pemutakhiran data pada sistem sumber. PPABP Rokeu dapat memantau proses banding secara otomatis untuk penyesuaian hak belanja pegawai.
            </p>
          </div>
          {totalAntrean > 0 ? (
            <span className="chip chip-amber font-bold text-xs shrink-0 self-center">
              {totalAntrean} Antrean Aktif
            </span>
          ) : (
            <span className="chip chip-ok font-bold text-xs shrink-0 self-center">
              Semua Tertangani
            </span>
          )}
        </div>
      </section>

      {/* ====================================================================
          3. STATISTIK UTAMA (KPI CARDS)
          ==================================================================== */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KARTU 1: Banding Menunggu Final */}
        <Link
          href="/osdma/banding"
          className="group rounded-2xl border border-line bg-surface p-5 shadow-xs transition hover:border-biru/40 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Banding Menunggu
            </span>
            <span
              className={`flex size-9 items-center justify-center rounded-xl ${
                bandingMenunggu > 0
                  ? "bg-amber-50 text-amber-600 ring-1 ring-amber-200"
                  : "bg-surface-2 text-muted"
              }`}
            >
              <IoMdCheckboxOutline className="size-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-black text-ink">
              {bandingMenunggu}
            </span>
            {bandingMenunggu > 0 ? (
              <span className="chip chip-amber text-[10px] font-bold">
                Perlu Telaah
              </span>
            ) : (
              <span className="chip chip-ok text-[10px] font-semibold">
                Selesai
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-muted flex items-center justify-between">
            <span>Persetujuan akhir jenjang 2</span>
            <FiArrowRight className="size-3.5 transition group-hover:translate-x-1 text-biru" />
          </p>
        </Link>

        {/* KARTU 2: SK KGB Menunggu */}
        <Link
          href="/osdma/sk-kgb"
          className="group rounded-2xl border border-line bg-surface p-5 shadow-xs transition hover:border-biru/40 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Usulan SK KGB
            </span>
            <span
              className={`flex size-9 items-center justify-center rounded-xl ${
                skKgbMenunggu > 0
                  ? "bg-teal-tint text-navy ring-1 ring-teal-200"
                  : "bg-surface-2 text-muted"
              }`}
            >
              <GrDocument className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-black text-ink">
              {skKgbMenunggu}
            </span>
            <span className="chip chip-draft text-[10px] font-semibold">
              Kenaikan Gaji Berkala
            </span>
          </div>
          <p className="mt-2 text-xs text-muted flex items-center justify-between">
            <span>Pengesahan golongan baru</span>
            <FiArrowRight className="size-3.5 transition group-hover:translate-x-1 text-biru" />
          </p>
        </Link>

        {/* KARTU 3: SK Hukuman Disiplin Menunggu */}
        <Link
          href="/osdma/sk-hukuman-disiplin"
          className="group rounded-2xl border border-line bg-surface p-5 shadow-xs transition hover:border-biru/40 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              SK Hukuman Disiplin
            </span>
            <span
              className={`flex size-9 items-center justify-center rounded-xl ${
                skHukdisMenunggu > 0
                  ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200"
                  : "bg-surface-2 text-muted"
              }`}
            >
              <RiFileWarningLine className="size-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-black text-ink">
              {skHukdisMenunggu}
            </span>
            <span className="chip chip-draft text-[10px] font-semibold">
              Potongan Disiplin
            </span>
          </div>
          <p className="mt-2 text-xs text-muted flex items-center justify-between">
            <span>Penetapan sanksi pegawai</span>
            <FiArrowRight className="size-3.5 transition group-hover:translate-x-1 text-biru" />
          </p>
        </Link>

        {/* KARTU 4: Total Keputusan Selesai */}
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Total Berkas Disahkan
            </span>
            <span className="flex size-9 items-center justify-center rounded-xl bg-teal-tint text-biru">
              <RiShieldCheckLine className="size-5" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="font-mono text-3xl font-black text-ink">
              {totalSelesai}
            </span>
            <span className="chip chip-ok text-[10px] font-semibold">
              Selesai OSDMA
            </span>
          </div>
          <p className="mt-2 text-xs text-muted">
            Riwayat keputusan sah di sistem sumber
          </p>
        </div>
      </section>

      {/* ====================================================================
          4. MODUL UTAMA BIRO OSDMA
          ==================================================================== */}
      <section className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
            <span className="size-2 rounded-full bg-biru" />
            Modul & Kewenangan OSDMA
          </h2>
          <span className="text-xs font-semibold text-muted">4 modul aktif</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* MODUL 1: Persetujuan Banding */}
          <Link
            href="/osdma/banding"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 transition hover:border-biru/50 hover:bg-surface-2/40 hover:shadow-md"
          >
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-tint via-surface to-biru/10 text-biru shadow-xs ring-1 ring-biru/20">
                <RiScalesLine className="size-6" />
              </div>
              <h3 className="mt-3.5 text-sm font-extrabold text-ink group-hover:text-navy">
                Persetujuan Akhir Banding
              </h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Telaah berkas pengajuan banding dan bukti lampiran pegawai setelah verifikasi Kasubag TU.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-biru">
              <span>{bandingMenunggu} menunggu telaah</span>
              <FiArrowRight className="size-4 transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* MODUL 2: SK KGB */}
          <Link
            href="/osdma/sk-kgb"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 transition hover:border-biru/50 hover:bg-surface-2/40 hover:shadow-md"
          >
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-tint via-surface to-teal-100 text-navy shadow-xs ring-1 ring-teal-300">
                <GrDocument className="size-5" />
              </div>
              <h3 className="mt-3.5 text-sm font-extrabold text-ink group-hover:text-navy">
                Pengesahan SK KGB
              </h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Konfirmasi usulan kenaikan gaji berkala lintas satuan kerja untuk pemutakhiran golongan dan TMT.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-biru">
              <span>{skKgbMenunggu} usulan diajukan</span>
              <FiArrowRight className="size-4 transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* MODUL 3: SK Hukuman Disiplin */}
          <Link
            href="/osdma/sk-hukuman-disiplin"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 transition hover:border-biru/50 hover:bg-surface-2/40 hover:shadow-md"
          >
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-rose-50 via-surface to-rose-100 text-rose-600 shadow-xs ring-1 ring-rose-200">
                <RiFileWarningLine className="size-6" />
              </div>
              <h3 className="mt-3.5 text-sm font-extrabold text-ink group-hover:text-navy">
                SK Hukuman Disiplin
              </h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Penetapan sanksi disiplin pegawai serta sinkronisasi pemotongan tunjangan kinerja otomatis.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-biru">
              <span>{skHukdisMenunggu} usulan diajukan</span>
              <FiArrowRight className="size-4 transition group-hover:translate-x-1" />
            </div>
          </Link>

          {/* MODUL 4: Update SK Pegawai */}
          <Link
            href="/osdma/update-sk"
            className="group flex flex-col justify-between rounded-2xl border border-line bg-surface p-5 transition hover:border-biru/50 hover:bg-surface-2/40 hover:shadow-md"
          >
            <div>
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-teal-tint via-surface to-biru/10 text-biru shadow-xs ring-1 ring-biru/20">
                <GrDocumentUser className="size-5" />
              </div>
              <h3 className="mt-3.5 text-sm font-extrabold text-ink group-hover:text-navy">
                Update SK Pegawai
              </h3>
              <p className="mt-1 text-xs text-muted leading-relaxed">
                Pemutakhiran langsung SK pelantikan struktural, fungsional, dan penetapan grade kelas jabatan.
              </p>
            </div>
            <div className="mt-4 pt-3 border-t border-line/60 flex items-center justify-between text-xs font-bold text-biru">
              <span>Buka Formulir SK</span>
              <FiArrowRight className="size-4 transition group-hover:translate-x-1" />
            </div>
          </Link>
        </div>
      </section>

      {/* ====================================================================
          5. ANTREAN BERKAS MEMERLUKAN TINDAKAN (PENDING APPROVAL FEED)
          ==================================================================== */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <div>
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500" />
              Antrean Berkas Memerlukan Tindakan ({totalAntrean})
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Daftar pengajuan yang telah diverifikasi Kasubag TU dan menunggu persetujuan akhir OSDMA
            </p>
          </div>
        </div>

        {totalAntrean === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-teal-tint text-biru">
              <FiCheckCircle className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-black text-ink">
              Semua Usulan Telah Tertangani
            </h3>
            <p className="mt-1 text-xs text-muted max-w-md mx-auto">
              Tidak ada berkas banding, usulan KGB, atau hukuman disiplin yang menunggu persetujuan akhir dari Biro OSDMA saat ini.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {/* 1. Antrean Banding */}
            {antreanBanding.map((b) => (
              <div
                key={b.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-biru/40 hover:bg-surface-2/30"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200">
                    <IoMdCheckboxOutline className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-ink">
                        {b.pegawai.nama}
                      </span>
                      <span className="chip chip-amber text-[10px] font-bold">
                        Banding {labelReferensiBanding(b.referensiTipe)}
                      </span>
                      <span className="text-[11px] font-mono text-muted">
                        NIP {b.pegawai.nip}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {b.pegawai.satuanKerja} &bull; Periode {NAMA_BULAN[b.periodeBulan - 1]} {b.periodeTahun}
                    </p>
                    <p className="mt-1 text-xs text-ink-2 italic line-clamp-1">
                      &ldquo;{b.alasan}&rdquo;
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-line/60">
                  <div className="text-right text-[11px] text-muted hidden sm:block">
                    <p>Diajukan</p>
                    <p className="font-semibold text-ink">{formatTanggal(b.createdAt)}</p>
                  </div>
                  <Link
                    href={`/osdma/banding?satker=${encodeURIComponent(b.pegawai.satuanKerja ?? "")}`}
                    className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  >
                    <span>Telaah Berkas</span>
                    <FiArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}

            {/* 2. Antrean SK KGB */}
            {antreanSkKgb.map((sk) => (
              <div
                key={sk.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-biru/40 hover:bg-surface-2/30"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-tint text-navy ring-1 ring-teal-200">
                    <GrDocument className="size-4" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-ink">
                        {sk.pegawai.nama}
                      </span>
                      <span className="chip chip-draft text-[10px] font-bold">
                        Usulan SK KGB
                      </span>
                      <span className="text-[11px] font-mono text-muted">
                        NIP {sk.pegawai.nip}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {sk.pegawai.satuanKerja} &bull; Gol. {sk.golonganLama} &rarr;{" "}
                      <span className="font-bold text-ink">{sk.golonganBaru}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-line/60">
                  <div className="text-right text-[11px] text-muted hidden sm:block">
                    <p>TMT KGB</p>
                    <p className="font-semibold text-ink">{formatTanggal(sk.tmtKgb)}</p>
                  </div>
                  <Link
                    href="/osdma/sk-kgb"
                    className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  >
                    <span>Proses KGB</span>
                    <FiArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}

            {/* 3. Antrean SK Hukuman Disiplin */}
            {antreanHukdis.map((h) => (
              <div
                key={h.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-biru/40 hover:bg-surface-2/30"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-rose-200">
                    <RiFileWarningLine className="size-5" />
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-ink">
                        {h.pegawai.nama}
                      </span>
                      <span className="chip text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        {h.jenisHukuman}
                      </span>
                      <span className="text-[11px] font-mono text-muted">
                        NIP {h.pegawai.nip}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {h.pegawai.satuanKerja} &bull; SK: {h.nomorSk ?? "Belum terbit"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-line/60">
                  <Link
                    href="/osdma/sk-hukuman-disiplin"
                    className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  >
                    <span>Proses Sanksi</span>
                    <FiArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ====================================================================
          6. RIWAYAT KEPUTUSAN TERBARU OSDMA
          ==================================================================== */}
      {riwayatBandingTerbaru.length > 0 && (
        <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
          <div className="flex items-center justify-between border-b border-line pb-3.5">
            <div>
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
                <FiClock className="size-4 text-biru" />
                Riwayat Keputusan Akhir OSDMA
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Pengesahan banding yang telah diputuskan dan tersinkronisasi ke sistem sumber
              </p>
            </div>
            <Link
              href="/osdma/banding"
              className="text-xs font-bold text-biru hover:underline inline-flex items-center gap-1"
            >
              <span>Lihat Semua</span>
              <FiArrowRight className="size-3" />
            </Link>
          </div>

          <div className="mt-3 divide-y divide-line">
            {riwayatBandingTerbaru.map((r) => (
              <div
                key={r.id}
                className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink sm:text-sm">
                      {r.pegawai.nama}
                    </span>
                    <span
                      className={`chip text-[10px] font-bold ${
                        r.status === "DISETUJUI" ? "chip-ok" : "chip-draft text-rose-700 bg-rose-50"
                      }`}
                    >
                      {r.status === "DISETUJUI" ? "Disetujui OSDMA" : "Ditolak OSDMA"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted">
                    {r.pegawai.satuanKerja} &bull; Banding {labelReferensiBanding(r.referensiTipe)} ({NAMA_BULAN[r.periodeBulan - 1]} {r.periodeTahun})
                  </p>
                  {r.usulanPerbaikan ? (
                    <p className="mt-1 text-ink-2 text-[11px]">
                      <span className="font-semibold text-muted">Usulan:</span> {r.usulanPerbaikan}
                    </p>
                  ) : (
                    <p className="mt-1 text-muted italic text-[11px] line-clamp-1">
                      &ldquo;{r.alasan}&rdquo;
                    </p>
                  )}
                </div>

                <div className="text-right text-[11px] text-muted">
                  <p>Tanggal Keputusan</p>
                  <p className="font-semibold text-ink">{formatTanggal(r.updatedAt)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
