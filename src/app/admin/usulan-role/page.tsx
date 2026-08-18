import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canEksekusiPerubahanRole, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { LABEL_ROLE, labelRole } from "../../../auth/roleLabel";
import { EksekusiUsulanForm } from "./EksekusiUsulanForm";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { MENUNGGU: "amber", DIEKSEKUSI: "hijau", DITOLAK: "merah" } as const;

export default async function EksekusiUsulanRolePage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canEksekusiPerubahanRole(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengeksekusi usulan perubahan role." />;
  }

  const [usulanList, satuanKerjaRows] = await Promise.all([
    prisma.usulanPerubahanRole.findMany({
      include: { user: true, diusulkanOleh: true, diputuskanOleh: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
  ]);
  const satuanKerjaList = satuanKerjaRows.map((r) => r.satuanKerja);

  // Prefill unit akun buat usulan yang mempromosikan ke KASUBAG_TU: pakai
  // unit akunnya kalau sudah ada, kalau belum pakai satuan kerja data
  // pegawainya (tebakan paling masuk akal - Kasubag TU biasanya memimpin
  // unitnya sendiri). Admin tetap bisa menggantinya sebelum eksekusi.
  const nipPerluPrefill = usulanList
    .filter((u) => u.status === "MENUNGGU" && u.roleDiusulkan === "KASUBAG_TU")
    .map((u) => u.user.nip);
  const pegawaiByNip = new Map(
    (await prisma.pegawai.findMany({ where: { nip: { in: nipPerluPrefill } } })).map((p) => [p.nip, p])
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Eksekusi Usulan Perubahan Role</h1>
      <p className="mt-1 text-sm text-muted">
        Usulan dari PPABP (lihat &quot;LIHAT &amp; USULKAN&quot; di role matrix) - eksekusi di sini benar-benar mengubah role akun.
      </p>

      <div className="mt-6 space-y-4">
        {usulanList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada usulan perubahan role.</p>}
        {usulanList.map((u) => (
          <div key={u.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{u.user.nama}</p>
                <p className="text-sm text-muted">
                  {labelRole(u.roleSaatIni, u.user.satuanKerja)} &rarr; {LABEL_ROLE[u.roleDiusulkan]} - diusulkan oleh{" "}
                  {u.diusulkanOleh.nama}
                </p>
                {u.alasan && <p className="mt-1 text-sm text-ink-2">{u.alasan}</p>}
                {u.diputuskanOleh && (
                  <p className="mt-1 text-xs text-muted">
                    Diputuskan oleh {u.diputuskanOleh.nama} pada {u.diputuskanPada?.toLocaleDateString("id-ID")}
                  </p>
                )}
              </div>
              <StatusBadge label={u.status} warna={WARNA_STATUS[u.status as keyof typeof WARNA_STATUS] ?? "abu"} />
            </div>
            {u.status === "MENUNGGU" && (
              <EksekusiUsulanForm
                usulanId={u.id}
                butuhSatuanKerja={u.roleDiusulkan === "KASUBAG_TU"}
                satuanKerjaList={satuanKerjaList}
                satuanKerjaDefault={u.user.satuanKerja ?? pegawaiByNip.get(u.user.nip)?.satuanKerja ?? ""}
              />
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
