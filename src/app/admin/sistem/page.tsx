import type { IconType } from "react-icons";
import {
  RiBankLine,
  RiCalendarCheckLine,
  RiDatabase2Line,
  RiFileList3Line,
  RiGroupLine,
  RiHistoryLine,
  RiStarLine,
  RiTeamLine,
  RiWallet3Line,
} from "react-icons/ri";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canMonitorKesehatanSistem, canKonfigurasiAdapter, type AuthUser } from "../../../auth/permissions";
import { getModeJaringan } from "../../../auth/modeJaringan";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { IkonBercahaya, KartuBercahaya, type NuansaKpi } from "../../../components/shared/KartuKpi";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { ToggleModeJaringan } from "../ToggleModeJaringan";
import { SinkronPegawaiForm } from "./SinkronPegawaiForm";

export const dynamic = "force-dynamic";

type StatusSumber = "Tersambung" | "Manual" | "Belum ada";

// Sumber data eksternal beserta cara ambilnya. Status menjawab satu
// pertanyaan saja: apakah datanya masuk sendiri lewat koneksi, atau menunggu
// orang mengunggah/mengunduh berkas.
//
// SIAP & e-Presensi diakses READ-ONLY - keduanya sistem produksi yang sedang
// melayani pegawai, dan Gajihub tidak pernah menulis apa pun ke sana.
const SUMBER_DATA: { sistem: string; cara: string; status: StatusSumber; catatan: string; Ikon: IconType }[] = [
  {
    sistem: "SIAP",
    cara: "Koneksi langsung (baca saja)",
    status: "Tersambung",
    catatan: "Identitas, jabatan, golongan, kelas jabatan, dan jenis kepegawaian.",
    Ikon: RiTeamLine,
  },
  {
    sistem: "e-Presensi",
    cara: "Koneksi langsung (baca saja)",
    status: "Tersambung",
    catatan: "Kehadiran harian, jam masuk/pulang, dan cuti. Ditarik per periode dari menu Presensi.",
    Ikon: RiCalendarCheckLine,
  },
  {
    sistem: "e-Kinerja BKN",
    cara: "Unggah rekap",
    status: "Manual",
    catatan: "Predikat kinerja diunggah dari rekap portal BKN - belum ada koneksi langsung.",
    Ikon: RiStarLine,
  },
  {
    sistem: "Web Gaji Kemenkeu",
    cara: "Berkas ADK",
    status: "Manual",
    catatan: "Berkas ADK diunduh dari menu Export ADK, lalu diunggah ke Web Gaji.",
    Ikon: RiWallet3Line,
  },
  {
    sistem: "SAKTI",
    cara: "-",
    status: "Belum ada",
    catatan: "SPP/SP2D - di luar cakupan integrasi saat ini.",
    Ikon: RiBankLine,
  },
];

// Status selalu TEKS; titik warna cuma pendamping.
const GAYA_STATUS: Record<StatusSumber, { chip: string; titik: string }> = {
  Tersambung: { chip: "chip-ok", titik: "bg-green" },
  Manual: { chip: "chip-draft", titik: "bg-muted" },
  "Belum ada": { chip: "chip-wait", titik: "bg-gold" },
};

const angka = (n: number) => n.toLocaleString("id-ID");

const formatWaktu = (t: Date) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(t);

const KELAS_AKSI: Record<string, string> = {
  CREATE: "chip-ok",
  UPDATE: "chip-navy",
  DELETE: "chip-danger",
  SYNC: "chip-draft",
  APPROVE: "chip-ok",
};

function KartuAngka({
  nuansa,
  tundaMs,
  label,
  nilai,
  keterangan,
  Ikon,
}: {
  nuansa: NuansaKpi;
  tundaMs: number;
  label: string;
  nilai: string;
  keterangan: string;
  Ikon: IconType;
}) {
  return (
    <KartuBercahaya nuansa={nuansa} tundaMs={tundaMs}>
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">{label}</p>
          <p className="mt-1 font-mono text-3xl font-black text-ink">{nilai}</p>
        </div>
        <IkonBercahaya nuansa={nuansa}>
          <Ikon aria-hidden="true" className="size-5" />
        </IkonBercahaya>
      </div>
      <p className="relative mt-3 text-xs text-ink-2">{keterangan}</p>
    </KartuBercahaya>
  );
}

export default async function SistemPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canMonitorKesehatanSistem(authUser) || !canKonfigurasiAdapter(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus Admin." />;
  }

  const [totalPegawai, pegawaiAktif, sinkronTerakhir, totalUser, userAktif, totalAuditTrail, auditTerakhir, tukinTerbaru] =
    await Promise.all([
      prisma.pegawai.count(),
      prisma.pegawai.count({ where: { statusPegawai: "AKTIF" } }),
      prisma.pegawai.aggregate({ _max: { sourceSyncedAt: true } }),
      prisma.user.count(),
      prisma.user.count({ where: { aktif: true } }),
      prisma.auditTrail.count(),
      prisma.auditTrail.findMany({
        orderBy: { timestamp: "desc" },
        take: 10,
        select: { id: true, entitas: true, aksi: true, aktor: true, satuanKerja: true, timestamp: true },
      }),
      prisma.tukinCalculation.findFirst({
        orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
        select: { periodeBulan: true, periodeTahun: true, calculatedAt: true },
      }),
    ]);
  const modeJaringan = getModeJaringan();

  // Nama aktor - NIP saja tidak bisa dibaca sekilas.
  const nipAktor = [...new Set(auditTerakhir.map((a) => a.aktor).filter((a) => a !== "SYSTEM"))];
  const namaAktor = new Map(
    (await prisma.user.findMany({ where: { nip: { in: nipAktor } }, select: { nip: true, nama: true } })).map((u) => [
      u.nip,
      u.nama,
    ])
  );
  const tglSinkron = sinkronTerakhir._max.sourceSyncedAt;

  return (
    <div data-tema="palet-2026" className="min-h-full">
      <main className={`${HALAMAN} space-y-6`}>
        <div className="gj-masuk">
          <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
            Konfigurasi &amp; Kesehatan Sistem
          </h1>
          <p className="mt-0.5 text-sm font-bold text-ink">Database Gajihub &amp; sambungan ke sistem sumber</p>
          <p className="mt-1.5 text-sm text-biru">
            Tarik data pegawai dari SIAP, atur mode jaringan, dan pantau isi database serta aktivitas terbaru.
          </p>
        </div>

        {/* DI ATAS ringkasan angka: satu-satunya bagian halaman ini yang bisa
            DIKERJAKAN, sisanya bacaan. Aturan urutan yang sama dengan
            /ppabp/adk - yang menuntut tindakan naik, yang cuma dibaca turun. */}
        <SinkronPegawaiForm />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KartuAngka
            nuansa={1}
            tundaMs={60}
            label="Pegawai aktif"
            nilai={angka(pegawaiAktif)}
            keterangan={`${angka(totalPegawai)} baris pegawai · sinkron ${tglSinkron ? formatWaktu(tglSinkron) : "belum pernah"}`}
            Ikon={RiTeamLine}
          />
          <KartuAngka
            nuansa={2}
            tundaMs={120}
            label="Akun aktif"
            nilai={angka(userAktif)}
            keterangan={`${angka(totalUser - userAktif)} akun nonaktif`}
            Ikon={RiGroupLine}
          />
          <KartuAngka
            nuansa={4}
            tundaMs={180}
            label="Catatan audit trail"
            nilai={angka(totalAuditTrail)}
            keterangan="Jejak perubahan data sejak awal"
            Ikon={RiFileList3Line}
          />
          <KartuAngka
            nuansa={3}
            tundaMs={240}
            label="Periode kalkulasi terbaru"
            nilai={tukinTerbaru ? `${tukinTerbaru.periodeBulan}/${tukinTerbaru.periodeTahun}` : "-"}
            keterangan={
              tukinTerbaru
                ? `${NAMA_BULAN[tukinTerbaru.periodeBulan - 1]} ${tukinTerbaru.periodeTahun} · dihitung ${formatWaktu(tukinTerbaru.calculatedAt)}`
                : "Belum ada kalkulasi"
            }
            Ikon={RiDatabase2Line}
          />
        </div>

        {/* SUMBER DATA - kartu per sistem, bukan tabel empat kolom: yang
            dibaca orang di sini cuma "sistem mana, tersambung atau tidak". */}
        <section aria-labelledby="judul-sumber">
          <h2 id="judul-sumber" className="text-sm font-bold text-ink">
            Sumber data
          </h2>
          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SUMBER_DATA.map((s) => (
              <li key={s.sistem} className="flex gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-tint text-navy">
                  <s.Ikon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-ink">{s.sistem}</p>
                    <span className={`chip ${GAYA_STATUS[s.status].chip} inline-flex items-center gap-1.5 text-[11px]`}>
                      <span aria-hidden="true" className={`size-1.5 rounded-full ${GAYA_STATUS[s.status].titik}`} />
                      {s.status}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-ink-2">{s.cara}</p>
                  <p className="mt-1 text-xs text-muted">{s.catatan}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            Sambungan ke sistem luar diatur lewat konfigurasi server, bukan dari halaman ini.
          </p>
        </section>

        <ToggleModeJaringan modeAwal={modeJaringan} />

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-line-2 pb-3">
            <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
              <RiHistoryLine aria-hidden="true" className="size-4 text-muted" />
              Aktivitas terbaru
            </h2>
            <span className="text-xs text-muted">
              <span className="font-mono">{auditTerakhir.length}</span> catatan terakhir
            </span>
          </div>
          {auditTerakhir.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Belum ada aktivitas tercatat.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line-2">
              {auditTerakhir.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                      <span className={`chip ${KELAS_AKSI[a.aksi] ?? "chip-draft"} text-[11px]`}>{a.aksi}</span>
                      <span className="font-mono text-xs text-ink-2">{a.entitas}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {a.aktor === "SYSTEM" ? "Proses otomatis" : (namaAktor.get(a.aktor) ?? "Akun tidak dikenal")}
                      {a.satuanKerja ? ` · ${a.satuanKerja}` : ""}
                    </p>
                  </div>
                  <time dateTime={a.timestamp.toISOString()} className="shrink-0 font-mono text-[11px] text-muted">
                    {formatWaktu(a.timestamp)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
