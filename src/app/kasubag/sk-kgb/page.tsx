import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { canAjukanSkKgb } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { AjukanSkKgbForm } from "./AjukanSkKgbForm";
import { HALAMAN } from "../../layoutHalaman";
import { GrDocument } from "react-icons/gr";
import { FiClock, FiCheckCircle, FiXCircle } from "react-icons/fi";

export const dynamic = "force-dynamic";

const formatTanggal = (tanggal: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(tanggal);

export default async function SkKgbUnitPage({
  searchParams,
}: {
  searchParams: Promise<{ satker?: string }>;
}) {
  const { satker } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;

  if (!satkerEfektif) {
    const satuanKerjaRows = await prisma.pegawai.findMany({
      distinct: ["satuanKerja"],
      select: { satuanKerja: true },
      orderBy: { satuanKerja: "asc" },
    });
    return (
      <main className={`${HALAMAN} space-y-6`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              SK KGB Unit
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Pilih satuan kerja terlebih dahulu untuk mengelola usulan Kenaikan Gaji Berkala.
            </p>
          </div>
        </div>
        <SatkerPicker satuanKerjaList={resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja))} />
      </main>
    );
  }

  if (!canAjukanSkKgb(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengajukan SK KGB unit ini." />;
  }

  const [pegawaiList, skKgbList] = await Promise.all([
    prisma.pegawai.findMany({
      where: { satuanKerja: satkerEfektif },
      orderBy: { nama: "asc" },
      select: { id: true, nama: true, nip: true, golongan: true },
    }),
    prisma.skKgb.findMany({
      where: { pegawai: { satuanKerja: satkerEfektif } },
      include: { pegawai: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const jumlahMenunggu = skKgbList.filter((s) => s.status === "DIAJUKAN").length;
  const jumlahDisetujui = skKgbList.filter((s) => s.status === "DISETUJUI").length;
  const jumlahDitolak = skKgbList.filter((s) => s.status === "DITOLAK").length;

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. HEADER UTAMA
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                SK Kenaikan Gaji Berkala (KGB)
              </h1>
              <span className="chip chip-navy font-semibold text-xs">
                {satkerEfektif}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Portal pengajuan usulan kenaikan gaji berkala pegawai unit ke Biro OSDMA untuk pengesahan golongan.
            </p>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. METRIK RINGKAS UNIT
          ==================================================================== */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Menunggu OSDMA
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
            Total Usulan Unit
          </span>
          <p className="font-mono text-2xl font-black text-ink mt-1">
            {skKgbList.length}
          </p>
        </div>
      </section>

      {/* ====================================================================
          3. FORMULIR PENGAJUAN SK KGB
          ==================================================================== */}
      <AjukanSkKgbForm pegawaiList={pegawaiList} />

      {/* ====================================================================
          4. RIWAYAT USULAN SK KGB UNIT
          ==================================================================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
            <span className="size-2 rounded-full bg-biru" />
            Riwayat Usulan SK KGB Unit ({skKgbList.length})
          </h2>
        </div>

        {skKgbList.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
              <GrDocument className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-black text-ink">
              Belum Ada Usulan SK KGB
            </h3>
            <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
              Belum ada usulan kenaikan gaji berkala yang diajukan dari unit ini. Gunakan formulir di atas untuk mengajukan usulan baru.
            </p>
          </div>
        ) : (
          skKgbList.map((sk) => (
            <div
              key={sk.id}
              className="rounded-2xl border border-line bg-surface p-5 shadow-xs transition hover:border-biru/40"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-ink">
                      {sk.pegawai.nama}
                    </span>
                    <span className="text-xs font-mono text-muted">
                      NIP {sk.pegawai.nip}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Nomor SK: <span className="font-semibold text-ink-2">{sk.nomorSk ?? "Belum terbit"}</span>
                  </p>
                </div>

                <div>
                  {sk.status === "DIAJUKAN" && (
                    <span className="chip chip-amber font-bold text-xs inline-flex items-center gap-1.5">
                      <FiClock className="size-3.5" /> Menunggu Persetujuan OSDMA
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

              <div className="mt-3.5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Kenaikan Golongan
                  </span>
                  <p className="font-bold text-xs text-ink mt-0.5 flex items-center gap-1.5">
                    <span className="chip chip-draft text-xs">Gol. {sk.golonganLama}</span>
                    <span className="text-biru font-black">&rarr;</span>
                    <span className="chip chip-ok text-xs font-black">Gol. {sk.golonganBaru}</span>
                  </p>
                </div>

                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    TMT KGB
                  </span>
                  <p className="font-bold text-xs text-ink mt-0.5">
                    {formatTanggal(sk.tmtKgb)}
                  </p>
                </div>

                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Diajukan Pada
                  </span>
                  <p className="font-semibold text-xs text-ink mt-0.5">
                    {formatTanggal(sk.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
