import { prisma } from "../../../lib/prisma";
import { canInputSkHukumanDisiplin } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { StatusBadge } from "../../StatusBadge";
import { resolveSatuanKerjaListUntukFilter } from "../../dashboardScope";
import { ambilAksesUnit } from "../access";
import { SatkerPicker } from "../SatkerPicker";
import { InputSkHukdisForm } from "./InputSkHukdisForm";
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
      <main className={HALAMAN}>
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
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">SK Hukuman Disiplin</h1>
      <p className="mt-1 text-sm text-muted">{satkerEfektif}</p>

      {/* Kombinasi paling berbahaya: SUDAH disetujui (jadi sudah memotong
          tukin) TAPI nomor SK-nya belum ada. Ditampilkan sebagai daftar, bukan
          cuma chip per baris, supaya bisa ditelusuri sekali lihat menjelang
          tutup periode. */}
      {(() => {
        const rawan = skList.filter((sk) => sk.skBelumTerbit && sk.status === "DISETUJUI");
        if (rawan.length === 0) return null;
        return (
          <div className="card mt-4 border-l-4 border-l-danger p-4">
            <p className="text-sm font-bold text-ink">
              {rawan.length} SK sudah disetujui tapi nomornya belum terbit
            </p>
            <p className="mt-1 text-sm text-muted">
              Baris di bawah ini <strong>sudah memotong tunjangan kinerja</strong> sementara dokumen resminya belum
              ada. Lengkapi nomor SK-nya begitu terbit, atau cabut kalau keputusannya berubah.
            </p>
            <ul className="mt-2 list-inside list-disc text-sm text-ink-2">
              {rawan.map((sk) => (
                <li key={sk.id}>
                  {sk.pegawai.nama} - {sk.jenisHukuman}
                  {sk.kelasJabatanSelamaHukuman !== null && ` (kelas jabatan turun ke ${sk.kelasJabatanSelamaHukuman})`}
                </li>
              ))}
            </ul>
          </div>
        );
      })()}

      <InputSkHukdisForm pegawaiList={pegawaiList} />

      <div className="mt-6 space-y-3">
        {skList.length === 0 && <p className="card p-6 text-sm text-muted">Belum ada SK Hukuman Disiplin dari unit ini.</p>}
        {skList.map((sk) => (
          <div key={sk.id} className="card flex items-start justify-between gap-3 p-4">
            <div>
              <p className="font-bold text-ink">{sk.pegawai.nama}</p>
              <p className="text-sm text-muted">
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
        ))}
      </div>
    </main>
  );
}
