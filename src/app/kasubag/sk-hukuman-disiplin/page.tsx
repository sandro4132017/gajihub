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
