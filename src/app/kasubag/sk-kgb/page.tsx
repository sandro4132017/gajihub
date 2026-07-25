import { prisma } from "../../../lib/prisma";
import { canAjukanSkKgb } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { AjukanSkKgbForm } from "./AjukanSkKgbForm";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { DIAJUKAN: "amber", DISETUJUI: "hijau", DITOLAK: "merah" } as const;

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
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">SK KGB</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dulu.</p>
        <SatkerPicker satuanKerjaList={resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja))} />
      </main>
    );
  }

  if (!canAjukanSkKgb(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengajukan SK KGB unit ini." />;
  }

  const [pegawaiList, skKgbList] = await Promise.all([
    prisma.pegawai.findMany({ where: { satuanKerja: satkerEfektif }, orderBy: { nama: "asc" }, select: { id: true, nama: true, nip: true, golongan: true } }),
    prisma.skKgb.findMany({ where: { pegawai: { satuanKerja: satkerEfektif } }, include: { pegawai: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">SK KGB</h1>
      <p className="mt-1 text-sm text-muted">{satkerEfektif} - ajukan kenaikan gaji berkala, approval final OSDMA.</p>

      <AjukanSkKgbForm pegawaiList={pegawaiList} />

      <div className="mt-6 space-y-3">
        {skKgbList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada SK KGB diajukan dari unit ini.</p>}
        {skKgbList.map((sk) => (
          <div key={sk.id} className="card flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-bold text-ink">{sk.pegawai.nama}</p>
              <p className="text-sm text-muted">
                {sk.nomorSk} - golongan {sk.golonganLama} &rarr; {sk.golonganBaru} - TMT {new Date(sk.tmtKgb).toLocaleDateString("id-ID")}
              </p>
            </div>
            <StatusBadge label={sk.status} warna={WARNA_STATUS[sk.status as keyof typeof WARNA_STATUS] ?? "abu"} />
          </div>
        ))}
      </div>
    </main>
  );
}
