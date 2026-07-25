import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canViewRekonsiliasiLintasSatker, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { PutuskanRekonsiliasiForm } from "./PutuskanRekonsiliasiForm";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { DRAFT: "abu", COCOK: "hijau", SELISIH: "amber", SANGGAH: "amber", DIPUTUSKAN: "hijau" } as const;

export default async function RekonsiliasiLintasUnitPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewRekonsiliasiLintasSatker(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang melihat rekonsiliasi lintas unit." />;
  }

  // ReconciliationStatus.pegawaiId BUKAN foreign key relasi Prisma (cuma
  // string biasa + unique constraint) - lihat schema.prisma, jadi join ke
  // Pegawai dilakukan manual di sini, bukan lewat `include`.
  const reconList = await prisma.reconciliationStatus.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
  const pegawaiMap = new Map(
    (await prisma.pegawai.findMany({ where: { id: { in: reconList.map((r) => r.pegawaiId) } } })).map((p) => [p.id, p])
  );

  const perluDitangani = reconList.filter((r) => r.status === "SELISIH" || r.status === "SANGGAH");
  const sudahBeres = reconList.filter((r) => r.status !== "SELISIH" && r.status !== "SANGGAH");

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Rekonsiliasi Lintas Unit</h1>
      <p className="mt-1 text-sm text-muted">
        Monitoring status rekonsiliasi (DRAFT/COCOK/SELISIH/SANGGAH/DIPUTUSKAN) &amp; tindak lanjut kasus SELISIH/SANGGAH.
      </p>

      <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-muted">Perlu ditangani ({perluDitangani.length})</h2>
      <div className="mt-2 space-y-4">
        {perluDitangani.length === 0 && <p className="card p-6 text-sm text-muted">Tidak ada kasus SELISIH/SANGGAH yang menunggu keputusan.</p>}
        {perluDitangani.map((r) => {
          const pegawai = pegawaiMap.get(r.pegawaiId);
          return (
            <div key={r.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-ink">{pegawai?.nama ?? r.pegawaiId}</p>
                  <p className="text-sm text-muted">
                    NIP {pegawai?.nip} - {pegawai?.satuanKerja} - Periode {r.periodeBulan}/{r.periodeTahun}
                  </p>
                  {r.detailSelisih !== null && (
                    <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-surface-2 p-2 text-xs text-ink-2">
                      {JSON.stringify(r.detailSelisih, null, 2)}
                    </pre>
                  )}
                </div>
                <StatusBadge label={r.status} warna={WARNA_STATUS[r.status as keyof typeof WARNA_STATUS] ?? "abu"} />
              </div>
              <PutuskanRekonsiliasiForm id={r.id} />
            </div>
          );
        })}
      </div>

      {sudahBeres.length > 0 && (
        <>
          <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-muted">Histori ({sudahBeres.length})</h2>
          <div className="mt-2 space-y-2">
            {sudahBeres.map((r) => {
              const pegawai = pegawaiMap.get(r.pegawaiId);
              return (
                <div key={r.id} className="card flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold text-ink">{pegawai?.nama ?? r.pegawaiId}</p>
                    <p className="text-xs text-muted">
                      Periode {r.periodeBulan}/{r.periodeTahun}
                      {r.keputusanAkhir ? ` - ${r.keputusanAkhir}` : ""}
                    </p>
                  </div>
                  <StatusBadge label={r.status} warna={WARNA_STATUS[r.status as keyof typeof WARNA_STATUS] ?? "abu"} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
