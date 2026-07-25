import { prisma } from "../../../lib/prisma";
import { canInputSkHukumanDisiplin } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { InputSkHukdisForm } from "./InputSkHukdisForm";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { DIAJUKAN: "amber", DISETUJUI: "hijau", DITOLAK: "merah" } as const;

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
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">SK Hukuman Disiplin</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dulu.</p>
        <SatkerPicker satuanKerjaList={resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja))} />
      </main>
    );
  }

  if (!canInputSkHukumanDisiplin(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang input SK Hukuman Disiplin unit ini." />;
  }

  const [pegawaiList, skList] = await Promise.all([
    prisma.pegawai.findMany({ where: { satuanKerja: satkerEfektif }, orderBy: { nama: "asc" }, select: { id: true, nama: true, nip: true } }),
    prisma.skHukumanDisiplin.findMany({ where: { pegawai: { satuanKerja: satkerEfektif } }, include: { pegawai: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">SK Hukuman Disiplin</h1>
      <p className="mt-1 text-sm text-muted">{satkerEfektif}</p>

      <div className="mt-4 rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep">
        TODO(confirm) - alur approval OSDMA untuk SK Hukuman Disiplin di halaman ini ASUMSI dari spesifikasi simulasi,
        BELUM ada konfirmasi resmi dari OSDMA/Biro Hukum. Jenis hukuman masih bebas isi (free-text) karena kategorisasi
        resmi PP 94/2021 belum dipetakan ke sistem ini - jangan anggap alur ini final buat production.
      </div>

      <InputSkHukdisForm pegawaiList={pegawaiList} />

      <div className="mt-6 space-y-3">
        {skList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada SK Hukuman Disiplin dari unit ini.</p>}
        {skList.map((sk) => (
          <div key={sk.id} className="card flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-bold text-ink">{sk.pegawai.nama}</p>
              <p className="text-sm text-muted">
                {sk.nomorSk} - {sk.jenisHukuman} - berlaku sejak {sk.periodeMulaiBulan}/{sk.periodeMulaiTahun}
              </p>
              {sk.keterangan && <p className="mt-1 text-xs text-muted">{sk.keterangan}</p>}
            </div>
            <StatusBadge label={sk.status} warna={WARNA_STATUS[sk.status as keyof typeof WARNA_STATUS] ?? "abu"} />
          </div>
        ))}
      </div>
    </main>
  );
}
