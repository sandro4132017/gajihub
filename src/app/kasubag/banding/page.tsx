import { prisma } from "../../../lib/prisma";
import { canViewRekapUnitKerja } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { VerifikasiBandingForm } from "./VerifikasiBandingForm";

export const dynamic = "force-dynamic";

export default async function VerifikasiBandingUnitPage({
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
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Verifikasi Banding</h1>
        <p className="mt-1 text-sm text-muted">Pilih satuan kerja dulu.</p>
        <SatkerPicker satuanKerjaList={resolveSatuanKerjaListUntukFilter(authUser, satuanKerjaRows.map((r) => r.satuanKerja))} />
      </main>
    );
  }

  // Guard pakai canViewRekapUnitKerja (bukan canVerifikasiBandingJenjang1
  // yang butuh target banding spesifik) - buat LIHAT daftar banding unit,
  // izin verifikasi per-baris dicek ULANG di action (lihat actions.ts),
  // bukan cuma di sini.
  if (!canViewRekapUnitKerja(authUser, satkerEfektif)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat banding unit ini." />;
  }

  const bandingList = await prisma.banding.findMany({
    where: { pegawai: { satuanKerja: satkerEfektif } },
    include: { pegawai: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Verifikasi Banding</h1>
      <p className="mt-1 text-sm text-muted">{satkerEfektif} - jenjang 1 (verifikasi Kasubag TU)</p>

      <div className="mt-6 space-y-4">
        {bandingList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada banding dari unit ini.</p>}
        {bandingList.map((b) => (
          <div key={b.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{b.pegawai.nama}</p>
                <p className="text-sm text-muted">
                  NIP {b.pegawai.nip} - {b.referensiTipe} - Periode {b.periodeBulan}/{b.periodeTahun}
                </p>
              </div>
              {b.status === "DIAJUKAN" && <StatusBadge label="Menunggu verifikasi" warna="amber" />}
              {b.status === "MENUNGGU_APPROVAL_FINAL" && <StatusBadge label="Diteruskan ke OSDMA" warna="hijau" />}
              {b.status === "DISETUJUI" && <StatusBadge label="Disetujui" warna="hijau" />}
              {b.status === "DITOLAK" && <StatusBadge label="Ditolak" warna="merah" />}
            </div>
            <p className="mt-2 text-sm text-ink-2">{b.alasan}</p>
            {b.status === "DIAJUKAN" && <VerifikasiBandingForm bandingId={b.id} />}
          </div>
        ))}
      </div>
    </main>
  );
}
