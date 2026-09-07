import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canApproveSkHukumanDisiplin, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { SetujuTolakForm } from "../SetujuTolakForm";
import { approveSkHukdisAction } from "./actions";
import { HALAMAN } from "../../layoutHalaman";

export const dynamic = "force-dynamic";

const WARNA_STATUS = { DIAJUKAN: "amber", DISETUJUI: "hijau", DITOLAK: "merah" } as const;

/**
 * TODO(confirm) alur approval OSDMA untuk SK Hukuman Disiplin masih ASUMSI -
 * belum ada konfirmasi resmi dari OSDMA/Biro Hukum. Jenis hukuman juga masih
 * bebas isi (free-text) karena kategorisasi PP 94/2021 belum dipetakan ke
 * sistem ini, dan approval di sini TIDAK memberi efek potongan Tukin otomatis
 * (Pasal 15 belum diimplementasikan).
 *
 * Peringatan ini dulu dipasang sebagai banner kuning di halaman; dicabut
 * 2026-09-06 atas permintaan user menjelang pengujian bersama Kasubag TU.
 * Isinya TIDAK batal - yang berubah cuma tempatnya.
 */
export default async function OsdmaSkHukdisPage() {
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canApproveSkHukumanDisiplin(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang memberikan approval SK Hukuman Disiplin." />;
  }

  const skList = await prisma.skHukumanDisiplin.findMany({ include: { pegawai: true }, orderBy: { createdAt: "desc" } });

  return (
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Approval SK Hukuman Disiplin</h1>
      <p className="mt-1 text-sm text-muted">Lintas satuan kerja.</p>

      <div className="mt-6 space-y-4">
        {skList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada SK Hukuman Disiplin diajukan.</p>}
        {skList.map((sk) => (
          <div key={sk.id} className="card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-ink">{sk.pegawai.nama}</p>
                <p className="text-sm text-muted">
                  NIP {sk.pegawai.nip} - {sk.pegawai.satuanKerja}
                </p>
                <p className="mt-1 text-sm text-ink-2">
                  {sk.skBelumTerbit ? (
                    <span className="chip chip-danger mr-1.5">SK belum terbit</span>
                  ) : (
                    <>{sk.nomorSk} - </>
                  )}
                  {sk.jenisHukuman} - berlaku sejak {sk.periodeMulaiBulan}/{sk.periodeMulaiTahun}
                  {sk.periodeSelesaiBulan && sk.periodeSelesaiTahun
                    ? ` s.d. ${sk.periodeSelesaiBulan}/${sk.periodeSelesaiTahun}`
                    : " (sampai dicabut)"}
                  {sk.kelasJabatanSelamaHukuman !== null && (
                    <> - kelas jabatan turun ke <strong>{sk.kelasJabatanSelamaHukuman}</strong></>
                  )}
                </p>
                {sk.keterangan && <p className="mt-1 text-xs text-muted">{sk.keterangan}</p>}
              </div>
              <StatusBadge label={sk.status} warna={WARNA_STATUS[sk.status as keyof typeof WARNA_STATUS] ?? "abu"} />
            </div>
            {sk.status === "DIAJUKAN" && <SetujuTolakForm action={approveSkHukdisAction} idFieldName="skId" idValue={sk.id} />}
          </div>
        ))}
      </div>
    </main>
  );
}
