import { FiCheckCircle, FiExternalLink, FiInbox } from "react-icons/fi";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canBukaHalamanPerintahLembur, type AuthUser } from "../../auth/permissions";
import { AksesDitolak } from "../../components/feedback/AksesDitolak";
import { HALAMAN } from "../../components/layout/layoutHalaman";
import { Paginasi, hitungPaginasi } from "../../components/tables/Paginasi";
import { tanggalIsoWib } from "../../business-logic/perintahLembur";
import { namaCetakPegawai } from "../../business-logic/namaPegawai";
import { NAMA_BULAN } from "../../lib/format/bulan";
import { anggotaTimUntuk } from "../../lib/lembur/anggotaTim";
import { buatPilihanAnggota } from "../../lib/lembur/pilihanForm";
import { berlakuMulaiSpkl } from "../../lib/lembur/gerbangSpkl";
import { TTE_LEMBUR_AKTIF } from "../../lib/lembur/sakelarTteLembur";
import { tanggalIsoTeks, waktuWibTeks } from "../../lib/lembur/waktuTampil";
import { FormPerintahLembur, type PeringatanPresensi } from "./FormPerintahLembur";
import { SisaWaktuKirim } from "./SisaWaktuKirim";

export const dynamic = "force-dynamic";

function KartuMetrik({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-xs">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
      <p className="mt-1 font-mono text-2xl font-black text-ink">{nilai}</p>
    </div>
  );
}

function tanggalDb(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Halaman Kepala Tim: membuat perintah lembur (SPKL) untuk anggota tim dan
 * melihat riwayatnya. Pembuatannya lewat POST /api/lembur/perintah (bukan
 * Server Action; lihat catatan di route itu).
 */
export default async function KepalaTimPage({
  searchParams,
}: {
  searchParams: Promise<{ hal?: string; per?: string }>;
}) {
  const { hal, per } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPerintahLembur(authUser)) {
    return <AksesDitolak pesan="Halaman ini khusus Kepala Tim dan Pimpinan." />;
  }

  // Satker dari tabel Pegawai (bukan User.satuanKerja), sama dengan route kirim.
  const kepala = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    select: { id: true, nama: true, satuanKerja: true },
  });
  if (!kepala) {
    return <AksesDitolak pesan="Data pegawai untuk akun ini belum ada, jadi tim dan satuan kerjanya belum diketahui." />;
  }
  const berlakuMulai = berlakuMulaiSpkl(kepala.satuanKerja);
  if (!berlakuMulai) {
    return <AksesDitolak pesan={`SPKL belum diaktifkan untuk satker ${kepala.satuanKerja}.`} />;
  }

  const sekarang = new Date();
  const hariIni = tanggalIsoWib(sekarang);
  const [tahunIni, bulanIni] = hariIni.split("-").map(Number);
  const filterKepala = { kepalaTim: { nip: authUser.nip }, status: "TERKIRIM" as const };

  const [anggota, totalRiwayat, hariIniRows, rekapTerakhir] = await Promise.all([
    anggotaTimUntuk(prisma, { nip: authUser.nip }),
    prisma.perintahLembur.count({ where: filterKepala }),
    prisma.perintahLembur.findMany({
      where: { ...filterKepala, tanggal: tanggalDb(hariIni) },
      select: { _count: { select: { anggota: true } } },
    }),
    // Kapan presensi periode berjalan terakhir ditarik/diperbarui untuk satker ini.
    prisma.rekapPresensiPeriode.aggregate({
      where: {
        periodeBulan: bulanIni,
        periodeTahun: tahunIni,
        pegawai: { satuanKerja: kepala.satuanKerja },
      },
      _max: { updatedAt: true },
    }),
  ]);

  const paginasi = hitungPaginasi(totalRiwayat, hal, per);
  const riwayat = await prisma.perintahLembur.findMany({
    where: filterKepala,
    orderBy: [{ tanggal: "desc" }, { dikirimPada: "desc" }],
    skip: paginasi.mulai,
    take: paginasi.perHalaman,
    select: {
      id: true,
      tanggal: true,
      nomorSurat: true,
      dikirimPada: true,
      dokumenTteId: true,
      anggota: { select: { jamDiperintahkan: true } },
    },
  });
  const paramPaginasi = new URLSearchParams();

  const ditarikPada = rekapTerakhir._max.updatedAt;
  const peringatanPresensi: PeringatanPresensi | null = ditarikPada
    ? {
        periode: `${tahunIni}-${String(bulanIni).padStart(2, "0")}`,
        labelPeriode: `${NAMA_BULAN[bulanIni - 1]} ${tahunIni}`,
        ditarikPada: waktuWibTeks(ditarikPada),
      }
    : null;

  const jumlahHariIni = hariIniRows.length;
  const anggotaHariIni = hariIniRows.reduce((s, r) => s + r._count.anggota, 0);
  const belumBerlaku = hariIni < berlakuMulai;

  const jamHalaman = riwayat.reduce((n, p) => n + p.anggota.reduce((s, a) => s + a.jamDiperintahkan, 0), 0);

  return (
    <main className={HALAMAN}>
      <div className="flex flex-wrap items-center gap-2.5">
        <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">Perintah Lembur</h1>
        <span className="chip chip-navy text-xs font-semibold">{kepala.satuanKerja}</span>
      </div>
      <p className="mt-1 text-xs text-muted sm:text-sm">
        Buat perintah lembur untuk anggota tim dan pantau riwayatnya.
        {!TTE_LEMBUR_AKTIF && (
          <>
            {" "}
            Kirim perintah tanpa tanda tangan elektronik. SPKL harian dibentuk otomatis pukul 15.00 WIB dan
            setelahnya tidak bisa diubah.
          </>
        )}
      </p>

      <section className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Ringkasan perintah lembur">
        <KartuMetrik label="Perintah terkirim" nilai={totalRiwayat} />
        <KartuMetrik label="Perintah hari ini" nilai={jumlahHariIni} />
        <KartuMetrik label="Anggota hari ini" nilai={anggotaHariIni} />
        <KartuMetrik label="Total jam (halaman riwayat)" nilai={jamHalaman} />
      </section>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <p className="text-sm text-ink-2">
          {belumBerlaku ? (
            <>SPKL di satuan kerja ini berlaku mulai {tanggalIsoTeks(berlakuMulai)}.</>
          ) : jumlahHariIni === 0 ? (
            "Belum ada perintah terkirim untuk hari ini."
          ) : (
            <>
              Hari ini sudah terkirim{" "}
              <strong className="font-mono text-ink">{jumlahHariIni}</strong> perintah untuk{" "}
              <strong className="font-mono text-ink">{anggotaHariIni}</strong> anggota.
            </>
          )}
        </p>
        {!belumBerlaku && <SisaWaktuKirim tanggalIso={hariIni} serverNowMs={sekarang.getTime()} hariIni />}
      </div>

      <FormPerintahLembur
        tteAktif={TTE_LEMBUR_AKTIF}
        anggota={buatPilihanAnggota(anggota.map((a) => ({ id: a.id, nama: namaCetakPegawai(a) })))}
        hariIni={hariIni}
        berlakuMulai={berlakuMulai}
        serverNowMs={sekarang.getTime()}
        peringatanPresensi={peringatanPresensi}
        namaPenandatangan={namaCetakPegawai(kepala)}
        satuanKerja={kepala.satuanKerja}
      />

      <section className="mt-6 space-y-3" aria-labelledby="riwayat-judul">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <h2
            id="riwayat-judul"
            className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-ink"
          >
            <span className="size-2 rounded-full bg-biru" aria-hidden="true" />
            Riwayat perintah ({totalRiwayat})
          </h2>
          <span className="text-xs text-muted">{totalRiwayat} perintah terkirim</span>
        </div>

        {riwayat.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-surface-2 text-muted">
              <FiInbox className="size-6" aria-hidden="true" />
            </div>
            <h3 className="mt-3 text-sm font-black text-ink">Belum ada perintah lembur terkirim</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted">
              Belum ada perintah lembur terkirim atas nama Anda. Perintah baru muncul di sini setelah berhasil
              dikirim.
            </p>
          </div>
        ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="px-3 py-2.5">No.</th>
                  <th className="px-3 py-2.5">Tanggal lembur</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="col-nama px-3 py-2.5">Nomor surat</th>
                  <th className="px-3 py-2.5">Anggota</th>
                  <th className="px-3 py-2.5">Total jam</th>
                  <th className="px-3 py-2.5">Terkirim</th>
                  <th className="px-3 py-2.5">SPKL</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((p, i) => (
                  <tr key={p.id} className="border-b border-line-2">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted">{paginasi.mulai + i + 1}</td>
                    <td className="px-3 py-2.5 font-mono text-ink-2">
                      {tanggalIsoTeks(p.tanggal.toISOString().slice(0, 10))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="chip chip-ok">
                        <FiCheckCircle className="size-3.5" aria-hidden="true" />
                        Terkirim
                      </span>
                    </td>
                    <td className="col-nama px-3 py-2.5 font-mono text-xs text-ink-2">{p.nomorSurat ?? "-"}</td>
                    <td className="px-3 py-2.5 font-mono text-ink-2">{p.anggota.length}</td>
                    <td className="px-3 py-2.5 font-mono font-semibold text-ink">
                      {p.anggota.reduce((s, a) => s + a.jamDiperintahkan, 0)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-ink-2">
                      {p.dikirimPada ? waktuWibTeks(p.dikirimPada) : "-"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <a
                          href={`/berkas/spkl-harian?${new URLSearchParams({
                            tanggal: p.tanggal.toISOString().slice(0, 10),
                            satker: kepala.satuanKerja,
                          }).toString()}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-ghost btn-sm whitespace-nowrap"
                        >
                          <FiExternalLink className="size-3.5" aria-hidden="true" />
                          Buka SPKL
                        </a>
                        {TTE_LEMBUR_AKTIF && p.dokumenTteId && (
                          <a
                            href={`/berkas/tte/${p.dokumenTteId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-ghost btn-sm whitespace-nowrap"
                          >
                            <FiExternalLink className="size-3.5" aria-hidden="true" />
                            Surat tugas
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line-2 px-4 py-3 sm:px-6">
            <Paginasi
              basePath="/kepala-tim"
              params={paramPaginasi}
              info={paginasi}
              totalBaris={totalRiwayat}
              labelBaris="perintah"
            />
          </div>
        </div>
        )}
      </section>
    </main>
  );
}
