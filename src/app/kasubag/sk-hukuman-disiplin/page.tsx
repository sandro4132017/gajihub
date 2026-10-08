import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { canInputSkHukumanDisiplin } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { InputSkHukdisForm } from "./InputSkHukdisForm";
import { HALAMAN } from "../../layoutHalaman";
import { NAMA_BULAN } from "../../bulan";
import { RiFileWarningLine } from "react-icons/ri";
import { FiClock, FiCheckCircle, FiXCircle, FiAlertTriangle } from "react-icons/fi";

export const dynamic = "force-dynamic";

const formatTanggal = (tanggal: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(tanggal);

export default async function SkHukumanDisiplinUnitPage({
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
              SK Hukuman Disiplin Unit
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Pilih satuan kerja terlebih dahulu untuk melihat dan menginput catatan sanksi disiplin pegawai.
            </p>
          </div>
        </div>
        <SatkerPicker satuanKerjaList={resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja))} />
      </main>
    );
  }

  if (!canInputSkHukumanDisiplin(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang input SK Hukuman Disiplin unit ini." />;
  }

  const [pegawaiList, skList] = await Promise.all([
    prisma.pegawai.findMany({
      where: { satuanKerja: satkerEfektif },
      orderBy: { nama: "asc" },
      select: { id: true, nama: true, nip: true },
    }),
    prisma.skHukumanDisiplin.findMany({
      where: { pegawai: { satuanKerja: satkerEfektif } },
      include: { pegawai: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const jumlahMenunggu = skList.filter((s) => s.status === "DIAJUKAN").length;
  const jumlahDisetujui = skList.filter((s) => s.status === "DISETUJUI").length;
  const jumlahDitolak = skList.filter((s) => s.status === "DITOLAK").length;
  const rawan = skList.filter((sk) => sk.skBelumTerbit && sk.status === "DISETUJUI");

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
                SK Hukuman Disiplin
              </h1>
              <span className="chip chip-navy font-semibold text-xs">
                {satkerEfektif}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Pencatatan sanksi disiplin pegawai unit &bull; Memerlukan persetujuan akhir Biro OSDMA untuk penyesuaian pemotongan tunjangan kinerja.
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
            SK Belum Terbit
          </span>
          <p className="font-mono text-2xl font-black text-rose-600 mt-1">
            {skList.filter((s) => s.skBelumTerbit).length}
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
            Total Usulan Unit
          </span>
          <p className="font-mono text-2xl font-black text-ink mt-1">
            {skList.length}
          </p>
        </div>
      </section>

      {/* ====================================================================
          3. WARNING BANNER: SK RAWAN (MEMOTONG TUKIN TAPI BELUM ADA NOMOR SK)
          ==================================================================== */}
      {rawan.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-rose-50/60 p-4 sm:p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
              <FiAlertTriangle className="size-5" />
            </span>
            <div>
              <h3 className="text-sm font-black text-rose-900">
                Perhatian: {rawan.length} SK Telah Disetujui Namun Nomor Dokumen Belum Terbit
              </h3>
              <p className="mt-0.5 text-xs text-rose-700 leading-relaxed">
                Catatan di bawah ini <strong>sudah memotong tunjangan kinerja</strong> sementara nomor dokumen resmi SK belum diisi. Segera lengkapi nomor SK begitu dokumen resmi selesai diterbitkan.
              </p>
              <ul className="mt-2.5 divide-y divide-rose-200/70 text-xs">
                {rawan.map((sk) => (
                  <li key={sk.id} className="py-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-rose-900">
                      {sk.pegawai.nama} &bull; {sk.jenisHukuman}
                    </span>
                    <span className="chip text-[10px] font-bold bg-white text-rose-700 border border-rose-300">
                      NIP {sk.pegawai.nip}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* ====================================================================
          4. FORMULIR INPUT SK HUKUMAN DISIPLIN
          ==================================================================== */}
      <InputSkHukdisForm pegawaiList={pegawaiList} />

      {/* ====================================================================
          5. DAFTAR RIWAYAT SK HUKUMAN DISIPLIN
          ==================================================================== */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
            <span className="size-2 rounded-full bg-biru" />
            Catatan SK Hukuman Disiplin Unit ({skList.length})
          </h2>
        </div>

        {skList.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
              <RiFileWarningLine className="size-6" />
            </div>
            <h3 className="mt-3 text-sm font-black text-ink">
              Belum Ada Catatan Hukuman Disiplin
            </h3>
            <p className="mt-1 text-xs text-muted max-w-sm mx-auto">
              Tidak ada catatan sanksi hukuman disiplin yang diajukan dari unit ini.
            </p>
          </div>
        ) : (
          skList.map((sk) => (
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
                    Nomor SK:{" "}
                    {sk.skBelumTerbit ? (
                      <span className="chip text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        SK Belum Terbit
                      </span>
                    ) : (
                      <span className="font-semibold text-ink-2">{sk.nomorSk ?? "Belum diisi"}</span>
                    )}
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
                    Jenis Hukuman
                  </span>
                  <p className="font-bold text-xs text-rose-700 mt-0.5">
                    {sk.jenisHukuman}
                  </p>
                  {sk.kelasJabatanSelamaHukuman !== null && (
                    <p className="text-[11px] text-muted mt-0.5">
                      Kelas turun ke: <strong>{sk.kelasJabatanSelamaHukuman}</strong>
                    </p>
                  )}
                </div>

                <div className="rounded-xl border border-line/70 bg-surface-2/40 p-2.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted">
                    Periode Berlaku
                  </span>
                  <p className="font-bold text-xs text-ink mt-0.5">
                    {NAMA_BULAN[sk.periodeMulaiBulan - 1]} {sk.periodeMulaiTahun}
                    {sk.periodeSelesaiBulan && sk.periodeSelesaiTahun
                      ? ` s.d. ${NAMA_BULAN[sk.periodeSelesaiBulan - 1]} ${sk.periodeSelesaiTahun}`
                      : " (sampai dicabut)"}
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

              {sk.keterangan && (
                <div className="mt-3 rounded-xl border border-line/60 bg-surface-2/30 p-2.5 text-xs text-ink-2">
                  <span className="font-bold text-muted uppercase text-[10px] tracking-wide block mb-0.5">
                    Keterangan:
                  </span>
                  &ldquo;{sk.keterangan}&rdquo;
                </div>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
