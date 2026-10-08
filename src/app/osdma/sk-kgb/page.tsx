import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canApproveSkKgb, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { SetujuTolakForm } from "../SetujuTolakForm";
import { approveSkKgbAction } from "./actions";
import { HALAMAN } from "../../layoutHalaman";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { GrDocument } from "react-icons/gr";
import { FiArrowLeft, FiClock, FiCheckCircle, FiXCircle, FiFilter } from "react-icons/fi";
import { RiShieldCheckLine } from "react-icons/ri";

export const dynamic = "force-dynamic";

const formatTanggal = (tanggal: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(tanggal);

export default async function OsdmaSkKgbPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string; status?: string }>;
}) {
  const { satker, status: statusFilter } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };

  if (!authUser || !canApproveSkKgb(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang memberikan approval SK KGB." />;
  }

  const [satuanKerjaRows, skKgbListAll] = await Promise.all([
    prisma.pegawai.findMany({
      distinct: ["satuanKerja"],
      select: { satuanKerja: true },
      orderBy: { satuanKerja: "asc" },
    }),
    prisma.skKgb.findMany({
      include: { pegawai: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  // Filter list berdasarkan parameter satker & status
  const skKgbList = skKgbListAll.filter((sk) => {
    if (satker && sk.pegawai.satuanKerja !== satker) return false;
    if (statusFilter && statusFilter !== "SEMUA" && sk.status !== statusFilter) return false;
    return true;
  });

  // Hitung statistik
  const jumlahMenunggu = skKgbListAll.filter((s) => s.status === "DIAJUKAN").length;
  const jumlahDisetujui = skKgbListAll.filter((s) => s.status === "DISETUJUI").length;
  const jumlahDitolak = skKgbListAll.filter((s) => s.status === "DITOLAK").length;

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. HEADER UTAMA
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/osdma"
                className="flex size-8 items-center justify-center rounded-xl border border-line bg-surface text-muted hover:text-ink transition shadow-2xs"
                title="Kembali ke Dashboard OSDMA"
              >
                <FiArrowLeft className="size-4" />
              </Link>
              <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Approval SK KGB
              </h1>
              <span className="chip chip-navy font-semibold text-xs">
                Biro OSDMA
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Persetujuan usulan Kenaikan Gaji Berkala lintas satuan kerja &bull; Pengesahan langsung memutakhirkan golongan pegawai di sistem.
            </p>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. STATISTIK RINGKAS
          ==================================================================== */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Menunggu Approval
          </span>
          <p className="font-mono text-2xl font-black text-amber-600 mt-1">
            {jumlahMenunggu}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Disetujui OSDMA
          </span>
          <p className="font-mono text-2xl font-black text-ink mt-1">
            {jumlahDisetujui}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Ditolak
          </span>
          <p className="font-mono text-2xl font-black text-rose-600 mt-1">
            {jumlahDitolak}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Total Usulan
          </span>
          <p className="font-mono text-2xl font-black text-ink mt-1">
            {skKgbListAll.length}
          </p>
        </div>
      </section>

      {/* ====================================================================
          3. BAR FILTER SATKER & STATUS
          ==================================================================== */}
      <section className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
        <form method="get" className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted inline-flex items-center gap-1.5">
              <FiFilter className="size-3.5" /> Filter:
            </span>

            {/* Filter Satuan Kerja */}
            <select
              name="satker"
              defaultValue={satker ?? ""}
              className="field-input py-1.5 px-3 text-xs w-auto min-w-[200px]"
            >
              <option value="">Semua Satuan Kerja</option>
              {satuanKerjaList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* Filter Status */}
            <select
              name="status"
              defaultValue={statusFilter ?? "SEMUA"}
              className="field-input py-1.5 px-3 text-xs w-auto"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="DIAJUKAN">Menunggu Approval</option>
              <option value="DISETUJUI">Disetujui</option>
              <option value="DITOLAK">Ditolak</option>
            </select>

            <button type="submit" className="btn btn-primary btn-sm">
              Terapkan
            </button>
          </div>

          <span className="text-xs font-semibold text-muted">
            Menampilkan {skKgbList.length} usulan
          </span>
        </form>
      </section>

      {/* ====================================================================
          4. DAFTAR USULAN SK KGB
          ==================================================================== */}
      <section className="space-y-4">
        {skKgbList.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
              <GrDocument className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-black text-ink">
              Tidak Ada Berkas SK KGB
            </h3>
            <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
              Tidak ditemukan usulan SK Kenaikan Gaji Berkala yang sesuai dengan filter pencarian ini.
            </p>
          </div>
        ) : (
          skKgbList.map((sk) => (
            <div
              key={sk.id}
              className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)] transition hover:border-biru/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div className="flex items-start gap-3.5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-tint text-navy ring-1 ring-teal-200">
                    <GrDocument className="size-5" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-black tracking-tight text-ink">
                        {sk.pegawai.nama}
                      </h2>
                      <span className="text-xs font-mono text-muted">
                        NIP {sk.pegawai.nip}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {sk.pegawai.satuanKerja} &bull; <span className="font-semibold text-ink-2">{sk.pegawai.unitKerja}</span>
                    </p>
                  </div>
                </div>

                <div>
                  {sk.status === "DIAJUKAN" && (
                    <span className="chip chip-amber font-bold text-xs inline-flex items-center gap-1.5">
                      <FiClock className="size-3.5" /> Menunggu Approval OSDMA
                    </span>
                  )}
                  {sk.status === "DISETUJUI" && (
                    <span className="chip chip-ok font-bold text-xs inline-flex items-center gap-1.5">
                      <FiCheckCircle className="size-3.5" /> Disetujui OSDMA
                    </span>
                  )}
                  {sk.status === "DITOLAK" && (
                    <span className="chip chip-draft font-bold text-xs inline-flex items-center gap-1.5 text-rose-700 bg-rose-50">
                      <FiXCircle className="size-3.5" /> Ditolak OSDMA
                    </span>
                  )}
                </div>
              </div>

              {/* Rincian Usulan SK */}
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Nomor & Tanggal SK
                  </span>
                  <p className="font-semibold text-xs text-ink mt-0.5 truncate" title={sk.nomorSk ?? "-"}>
                    {sk.nomorSk ?? "Belum diisi"}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {formatTanggal(sk.createdAt)}
                  </p>
                </div>

                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Kenaikan Golongan
                  </span>
                  <p className="font-bold text-xs text-ink mt-0.5 flex items-center gap-1.5">
                    <span className="chip chip-draft text-xs">Gol. {sk.golonganLama}</span>
                    <span className="text-biru font-black">&rarr;</span>
                    <span className="chip chip-ok text-xs font-black">Gol. {sk.golonganBaru}</span>
                  </p>
                </div>

                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    TMT KGB
                  </span>
                  <p className="font-bold text-xs text-ink mt-0.5">
                    {formatTanggal(sk.tmtKgb)}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    Terhitung Mulai Tanggal
                  </p>
                </div>

                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Waktu Pengajuan
                  </span>
                  <p className="font-semibold text-xs text-ink mt-0.5">
                    {formatTanggal(sk.createdAt)}
                  </p>
                  <p className="text-[11px] text-muted mt-0.5">
                    Oleh Kasubag Satker
                  </p>
                </div>
              </div>

              {/* Form Approval OSDMA */}
              {sk.status === "DIAJUKAN" && (
                <div className="mt-4">
                  <SetujuTolakForm
                    action={approveSkKgbAction}
                    idFieldName="skKgbId"
                    idValue={sk.id}
                  />
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
