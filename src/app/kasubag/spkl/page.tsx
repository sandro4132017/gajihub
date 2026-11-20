import { prisma } from "../../../lib/prisma";
import { canLihatPerintahLemburUnit, canTandatanganiSpklBulanan } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { FilterBar } from "../../../components/forms/FilterBar";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { Paginasi, hitungPaginasi } from "../../../components/tables/Paginasi";
import { namaCetakPegawai } from "../../../business-logic/namaPegawai";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { SPKL_AKTIF, berlakuMulaiSpkl } from "../../../lib/lembur/gerbangSpkl";
import { spklBerlakuDiPeriode } from "../../../lib/lembur/perintahPeriode";
import { jumlahPerintahDiAudit, muatRekapSpkl, perintahTidakTermuat } from "../../../lib/lembur/rekapSpklBulanan";
import { tanggalIsoTeks, waktuWibTeks } from "../../../lib/lembur/waktuTampil";
import { susunBarisLampiranSpkl } from "../../../lib/tte/spklBulananPdf";
import { satkerTerkunciUntukAkun } from "../../dashboardScope";
import { resolvePeriode, type Periode } from "../../periodeDefault";
import { ambilAksesUnit } from "../access";
import { PanelSpklBulanan, type SpklTertandatangani } from "./PanelSpklBulanan";

export const dynamic = "force-dynamic";

/**
 * SPKL Bulanan unit: rekap otomatis semua perintah lembur harian TERKIRIM
 * satu bulan, pratinjau lampirannya, dan tanda tangan BSrE (lewat
 * POST /api/lembur/spkl).
 *
 * Halaman sendiri, TANPA entri sidebar: menu Kasubag TU sudah 11 entri (di
 * atas 7+/-2, lihat gajihub-laws-of-ux bagian 3). Pintu masuknya tautan di
 * kartu TTE halaman Kalkulasi Unit, yang juga dipakai PPABP/ADMIN.
 * Satker Kasubag TU dikunci dari akunnya (ambilAksesUnit); ?satker= hanya
 * dibaca untuk PPABP/ADMIN yang lihat-saja.
 */
export default async function SpklBulananPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; hal?: string; per?: string }>;
}) {
  const { bulan, tahun, satker, hal, per } = await searchParams;
  const akses = await ambilAksesUnit(satker);
  if (!akses) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  const { authUser, satkerEfektif } = akses;
  const terkunci = satkerTerkunciUntukAkun(authUser);
  // Satker yang SPKL-nya sudah diaktifkan; sumber tunggalnya gerbangSpkl.
  const satuanKerjaList = terkunci ? (satkerEfektif ? [satkerEfektif] : []) : SPKL_AKTIF.map((a) => a.satuanKerja);

  // Wewenang SEBELUM cabang "satker belum dipilih": role tanpa hak lihat tidak
  // boleh sampai ke FilterBar. Tanpa satker terpilih, cukup berhak atas salah
  // satu satker yang ditawarkan.
  const berhakLihat = satkerEfektif
    ? canLihatPerintahLemburUnit(authUser, satkerEfektif)
    : satuanKerjaList.some((s) => canLihatPerintahLemburUnit(authUser, s));
  if (!berhakLihat) {
    return <AksesDitolak pesan="Peran kamu tidak berwenang melihat SPKL unit ini." />;
  }

  if (!satkerEfektif) {
    return (
      <main className={HALAMAN}>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">SPKL Bulanan</h1>
        <p className="mt-2 text-sm text-biru">Pilih satuan kerja dan periode dulu.</p>
        <FilterBar wajibPeriode wajibSatker satuanKerjaList={satuanKerjaList} bulan={bulan} tahun={tahun} satker={satker} />
      </main>
    );
  }
  const boleh = canTandatanganiSpklBulanan(authUser, satkerEfektif);

  // Periode bawaan: bulan terakhir yang punya perintah (bulan berjalan dilewati,
  // aturan resolvePeriode). Satu query kecil: tanggal berbeda perintah satker ini.
  const tanggalPerintah = await prisma.perintahLembur.findMany({
    where: { satuanKerja: satkerEfektif, status: "TERKIRIM" },
    distinct: ["tanggal"],
    select: { tanggal: true },
  });
  const tersedia = new Map<string, Periode>();
  for (const t of tanggalPerintah) {
    const p = { bulan: t.tanggal.getUTCMonth() + 1, tahun: t.tanggal.getUTCFullYear() };
    tersedia.set(`${p.tahun}-${p.bulan}`, p);
  }
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(bulan, tahun, [...tersedia.values()]);
  const labelPeriode = `${NAMA_BULAN[periodeBulan - 1]} ${periodeTahun}`;

  const kepala = (
    <>
      <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">SPKL Bulanan</h1>
      <p className="mt-0.5 text-sm font-bold text-ink">
        {satkerEfektif} &middot; {labelPeriode}
      </p>
      <p className="mt-2 text-sm text-biru">
        Rekap semua perintah lembur harian yang sudah terkirim pada bulan ini, siap ditandatangani.
      </p>
      <div className="card mt-4 p-4">
        <FilterBar
          tanpaKartu
          wajibPeriode
          wajibSatker
          satkerTerkunci={terkunci}
          satuanKerjaList={satuanKerjaList}
          bulan={String(periodeBulan)}
          tahun={String(periodeTahun)}
          satker={satkerEfektif}
        />
      </div>
    </>
  );

  // Di luar gerbang pilot: sebutkan sebabnya, jangan tampilkan dokumen kosong.
  if (!spklBerlakuDiPeriode(satkerEfektif, periodeBulan, periodeTahun)) {
    const mulai = berlakuMulaiSpkl(satkerEfektif);
    return (
      <main className={HALAMAN}>
        {kepala}
        <div className="mt-4 border-l-4 border-l-gold bg-gold-tint px-4 py-3 text-sm text-ink-2" role="status">
          {mulai
            ? `SPKL di satuan kerja ini berlaku mulai ${tanggalIsoTeks(mulai)}, jadi belum ada SPKL untuk ${labelPeriode}.`
            : `SPKL belum diaktifkan untuk satuan kerja ${satkerEfektif}.`}
        </div>
      </main>
    );
  }

  const [rekap, dokumen, penandatangan] = await Promise.all([
    muatRekapSpkl(prisma, satkerEfektif, periodeBulan, periodeTahun),
    prisma.dokumenTte.findFirst({
      where: {
        jenisDokumen: "SPKL_BULANAN",
        satuanKerja: satkerEfektif,
        periodeBulan,
        periodeTahun,
        status: "TERTANDATANGANI",
      },
      orderBy: { signedAt: "desc" },
      select: { id: true, nomorDokumen: true, signedAt: true, createdAt: true, penandatanganNama: true },
    }),
    boleh
      ? prisma.pegawai.findUnique({ where: { nip: authUser.nip }, select: { nama: true } })
      : Promise.resolve(null),
  ]);

  const { ringkasan } = rekap;
  const kosong = rekap.anggota.length === 0;
  const sudah: SpklTertandatangani | null = dokumen
    ? {
        id: dokumen.id,
        nomorDokumen: dokumen.nomorDokumen,
        ditandatanganiPada: dokumen.signedAt ? waktuWibTeks(dokumen.signedAt) : "-",
        penandatanganNama: dokumen.penandatanganNama,
      }
    : null;
  // Jumlah perintah saat rekap SPKL dimuat, dari AuditTrail route penandatanganan.
  const auditSpkl = dokumen
    ? await prisma.auditTrail.findFirst({
        where: { entitas: "spkl_bulanan", entitasId: dokumen.id },
        select: { dataSesudah: true },
      })
    : null;
  const sesudahTtd = dokumen
    ? perintahTidakTermuat({
        waktuKirim: rekap.waktuKirim,
        jumlahSaatIni: ringkasan.jumlahPerintah,
        jumlahDiDokumen: jumlahPerintahDiAudit(auditSpkl?.dataSesudah),
        dokumenDibuat: dokumen.createdAt,
      })
    : 0;

  const baris = susunBarisLampiranSpkl(rekap.anggota);
  const paginasi = hitungPaginasi(baris.length, hal, per);
  const barisHalaman = baris.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams({
    bulan: String(periodeBulan),
    tahun: String(periodeTahun),
    satker: satkerEfektif,
  });

  const angka: { label: string; nilai: number }[] = [
    { label: "Perintah", nilai: ringkasan.jumlahPerintah },
    { label: "Pegawai", nilai: ringkasan.jumlahPegawai },
    { label: "Hari", nilai: ringkasan.jumlahHari },
    { label: "Total jam diperintahkan", nilai: ringkasan.totalJam },
  ];

  return (
    <main className={HALAMAN}>
      {kepala}

      {/* SATU kartu berisi aksi (hierarki: paling banyak satu kotak penuh per kolom);
          peringatan di dalamnya berupa strip, status berupa teks + ikon. */}
      <section className="card mt-4 p-4 sm:p-5" aria-labelledby="spkl-dokumen">
        <h2 id="spkl-dokumen" className="text-sm font-bold text-ink">
          Dokumen SPKL {labelPeriode}
        </h2>

        {kosong ? (
          <p className="mt-2 text-sm text-ink-2">
            Belum ada perintah lembur terkirim untuk {labelPeriode} di unit ini, jadi belum ada SPKL yang bisa
            ditandatangani. SPKL bulanan dibentuk otomatis dari perintah harian yang sudah ditandatangani Kepala
            Tim; pilih bulan lain di filter bila perintahnya ada di bulan lain.
          </p>
        ) : (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {angka.map((a) => (
              <div key={a.label}>
                <dt className="text-xs text-muted">{a.label}</dt>
                <dd className="font-mono text-xl font-bold text-ink">{a.nilai}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4">
          <PanelSpklBulanan
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            labelPeriode={labelPeriode}
            satuanKerja={satkerEfektif}
            namaPenandatangan={penandatangan ? namaCetakPegawai(penandatangan) : ""}
            boleh={boleh}
            kosong={kosong}
            ringkasan={`${ringkasan.jumlahPegawai} pegawai, ${ringkasan.jumlahPerintah} perintah, ${ringkasan.totalJam} jam`}
            sudah={sudah}
            perintahSesudahTtd={sesudahTtd}
          />
        </div>
      </section>

      {!kosong && (
        <section className="mt-6" aria-labelledby="spkl-lampiran">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="spkl-lampiran" className="text-base font-bold text-ink">
              Lampiran
            </h2>
            <span className="text-xs text-muted">Isi yang sama dengan lampiran di PDF</span>
          </div>
          <div className="card mt-2 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                    <th className="px-3 py-2.5">No.</th>
                    <th className="col-nama px-3 py-2.5">Nama / NIP</th>
                    <th className="px-3 py-2.5">Gol.</th>
                    <th className="px-3 py-2.5">Tanggal ({NAMA_BULAN[periodeBulan - 1]})</th>
                    <th className="px-3 py-2.5">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {barisHalaman.map((r, i) => {
                    const [nama, nip] = r[1].split("\n");
                    return (
                      <tr key={`${nip}-${paginasi.mulai + i}`} className="border-b border-line-2 align-top">
                        <td className="px-3 py-2.5 font-mono text-xs text-muted">{r[0]}</td>
                        <td className="col-nama px-3 py-2.5">
                          <span className="font-semibold text-ink">{nama}</span>
                          <span className="block font-mono text-xs text-muted">{nip}</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-ink-2">{r[2]}</td>
                        <td className="px-3 py-2.5 font-mono text-ink-2">{r[3]}</td>
                        <td className="whitespace-pre-line px-3 py-2.5 text-ink-2">{r[4]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-line-2 px-4 py-3 sm:px-6">
              <Paginasi
                basePath="/kasubag/spkl"
                params={paramPaginasi}
                info={paginasi}
                totalBaris={baris.length}
                labelBaris="pegawai"
              />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
