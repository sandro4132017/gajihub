import type React from "react";
import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canGenerateAdk, canKembalikanRekapUnit, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { periodePunyaTukin, resolvePeriode } from "../../periodeDefault";
import { kelompokkanPerBank } from "../../../business-logic/rekeningPegawai";
import { SUMBER_DUMMY } from "../../../lib/dataUji";
import { dataUangMakanHarian } from "./dataUangMakanHarian";
import { dataUangLemburHarian } from "./dataUangLemburHarian";
import { PratinjauAdkUangMakan } from "./PratinjauAdkUangMakan";
import { PratinjauAdkUangLembur } from "./PratinjauAdkUangLembur";
import {
  TAMPILKAN_ADK_LEMBUR,
  TAMPILKAN_NOMINAL_LEMBUR,
} from "../../../lib/format/tampilUangLembur";
import { PapanProgres } from "../../kasubag/kirim/PapanProgres";
import { rangkumProgres } from "../../../business-logic/pengirimanUnit";
import {
  satkerTerkirim,
  sempitkanKeSatker,
  whereIkutAdk,
} from "./satkerTerkirim";
import { bacaJenisPegawai, wherePegawaiJenis, wherePegawaiTanpaJenis } from "./jenisPegawaiAdk";
import { FilterAdk } from "./FilterAdk";
import { PanduanAdk } from "./PanduanAdk";
import { bacaStatusPapan } from "../../kasubag/kirim/PapanProgres";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { SumberAcuan } from "../../../components/shared/SumberAcuan";
import { PanelTteSptjmPpk } from "./PanelTteSptjmPpk";
import { FiDownload, FiAlertCircle, FiExternalLink } from "react-icons/fi";

export const dynamic = "force-dynamic";

type JenisBerkasAdk = "tukin" | "uang-makan" | "uang-lembur";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(nilai);

export default async function ExportAdkPage({
  searchParams,
}: {
  searchParams: Promise<{
    satker?: string;
    bulan?: string;
    tahun?: string;
    adk?: string;
    jenis?: string;
    bank?: string;
    /** Papan progres unit: saringan status, cari, paginasi. */
    status?: string;
    cariUnit?: string;
    halUnit?: string;
    perUnit?: string;
  }>;
}) {
  const { satker, bulan, tahun, adk, jenis, bank, status, cariUnit, halUnit, perUnit } = await searchParams;
  const statusUnit = bacaStatusPapan(status);
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };
  if (!authUser || !canGenerateAdk(authUser)) {
    return <AksesDitolak pesan="Peran kamu tidak berwenang mengekspor ADK." />;
  }

  const periode = resolvePeriode(bulan, tahun, await periodePunyaTukin());
  const periodeBulan = String(periode.bulan);
  const periodeTahun = String(periode.tahun);
  const bln = Number(periodeBulan);
  const thn = Number(periodeTahun);

  const jenisPegawai = bacaJenisPegawai(jenis ?? null);
  const adkDipilih: JenisBerkasAdk =
    adk === "uang-makan" || (adk === "uang-lembur" && TAMPILKAN_ADK_LEMBUR)
      ? adk
      : "tukin";
  const bankDipilih = adkDipilih === "tukin" ? (bank ?? "") : "";

  const satkerBoleh = await satkerTerkirim(prisma, bln, thn);
  const { dipakai: satkerDipakai, terpilih: satkerTerpilih } =
    sempitkanKeSatker(satkerBoleh, satker);

  // 1. DATA TUKIN
  const tukinPeriode = await prisma.tukinCalculation.findMany({
    where: whereIkutAdk(bln, thn, satkerDipakai, jenisPegawai),
    select: {
      pegawaiId: true,
      tukinBersih: true,
      tukinPokok: true,
      pegawai: { select: { nip: true, nama: true } },
    },
  });
  const totalTukinBersih = tukinPeriode.reduce((sum, t) => sum + (t.tukinBersih || 0), 0);

  // Penyebut kartu "Pegawai yang memenuhi syarat": pegawai AKTIF di unit yang
  // sudah mengirim, di luar yang dikecualikan periode ini - dengan saringan
  // jenis yang sama dengan berkasnya.
  const pegawaiIkut = await prisma.pegawai.count({
    where: {
      statusPegawai: "AKTIF",
      satuanKerja: { in: satkerDipakai },
      sourceSystem: { not: SUMBER_DUMMY },
      ...wherePegawaiJenis(jenisPegawai),
      pengecualian: { none: { periodeBulan: bln, periodeTahun: thn } },
    },
  });

  const rekeningTukin = await prisma.rekeningPegawai.findMany({
    where: {
      jenisPembayaran: "TUKIN",
      pegawaiId: { in: tukinPeriode.map((t) => t.pegawaiId) },
    },
    select: { pegawaiId: true, kodeBankSpan: true, namaBank: true },
  });
  const bankTukin = kelompokkanPerBank(rekeningTukin);
  const punyaRekening = new Set(rekeningTukin.map((r) => r.pegawaiId));
  const tanpaRekening = tukinPeriode
    .filter((t) => !punyaRekening.has(t.pegawaiId))
    .map((t) => t.pegawai);

  // 2. DATA UANG MAKAN
  const pratinjauUm = await dataUangMakanHarian(
    bln,
    thn,
    satkerTerpilih || null,
    jenisPegawai,
  );
  const umRows = await prisma.uangMakan.findMany({
    where: whereIkutAdk(bln, thn, satkerDipakai, jenisPegawai),
    select: { id: true, totalUangMakan: true },
  });
  const umIkut = umRows.length;
  const totalUmRupiah = umRows.reduce((sum, u) => sum + (u.totalUangMakan || 0), 0);

  // 3. DATA UANG LEMBUR
  const pratinjauLembur = await dataUangLemburHarian(
    bln,
    thn,
    satkerTerpilih || null,
    jenisPegawai,
  );
  const lemburRows = await prisma.uangLembur.findMany({
    where: whereIkutAdk(bln, thn, satkerDipakai, jenisPegawai),
    select: { id: true, totalUangLembur: true, totalJamLembur: true },
  });
  const totalLemburRupiah = lemburRows.reduce((sum, l) => sum + (l.totalUangLembur || 0), 0);
  const totalJamLembur = lemburRows.reduce((sum, l) => sum + (l.totalJamLembur || 0), 0);

  // 4. UNIT PROGRESS & LOCK STATUS
  const unitAktif = await prisma.pegawai.findMany({
    where: { statusPegawai: "AKTIF", sourceSystem: { not: SUMBER_DUMMY } },
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
  });
  const barisPengiriman = await prisma.pengirimanUnit.findMany({
    where: { periodeBulan: bln, periodeTahun: thn },
  });
  const progres = rangkumProgres(
    unitAktif.map((u) => u.satuanKerja),
    new Map(barisPengiriman.map((b) => [b.satuanKerja, b])),
  );

  const belumKirim = {
    periodeBulan: bln,
    periodeTahun: thn,
    pegawai: { satuanKerja: { notIn: satkerBoleh }, sourceSystem: { not: SUMBER_DUMMY } },
  };
  const [tukinDraft, umDraft, lemburDraft] = await Promise.all([
    prisma.tukinCalculation.count({ where: belumKirim }),
    prisma.uangMakan.count({ where: belumKirim }),
    prisma.uangLembur.count({ where: belumKirim }),
  ]);
  const totalApproved = tukinPeriode.length + umIkut + pratinjauLembur.pegawai.length;
  const totalBelumApproved = tukinDraft + umDraft + lemburDraft;

  // 5. PENGECEKAN JENIS KEPEGAWAIAN DARI SIAP (PNS vs PPPK)
  const whereTanpaJenis = {
    periodeBulan: bln,
    periodeTahun: thn,
    pegawai: {
      satuanKerja: { in: satkerDipakai },
      sourceSystem: { not: SUMBER_DUMMY },
      ...wherePegawaiTanpaJenis(),
    },
  };
  const pilihPegawai = {
    pegawai: { select: { nip: true, nama: true } },
  } as const;
  const tanpaJenisBerkas = !jenisPegawai
    ? []
    : adkDipilih === "tukin"
      ? (
          await prisma.tukinCalculation.findMany({
            where: whereTanpaJenis,
            select: pilihPegawai,
          })
        ).map((r) => r.pegawai)
      : adkDipilih === "uang-makan"
        ? (
            await prisma.uangMakan.findMany({
              where: whereTanpaJenis,
              select: pilihPegawai,
            })
          ).map((r) => r.pegawai)
        : (
            await prisma.uangLembur.findMany({
              where: whereTanpaJenis,
              select: pilihPegawai,
            })
          ).map((r) => r.pegawai);

  // 6. TTE SPTJM PPK DOKUMEN PER JENIS & DAFTAR PER UNIT (Defensif fallback kosong jika tabel belum dimigrasi)
  const semuaDokumenTtePeriode = await prisma.dokumenTte
    .findMany({
      where: {
        periodeBulan: bln,
        periodeTahun: thn,
        ...(satkerTerpilih ? { satuanKerja: satkerTerpilih } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        jenisDokumen: true,
        satuanKerja: true,
        status: true,
        nomorDokumen: true,
        fileDraftPath: true,
        fileSignedPath: true,
        signedAt: true,
        penandatanganNama: true,
      },
    })
    .catch(() => []);

  const ambilTerbaruPerSatker = (jenisTarget: string) => {
    const mapSatker = new Map<string, (typeof semuaDokumenTtePeriode)[number]>();
    for (const d of semuaDokumenTtePeriode) {
      if (d.jenisDokumen !== jenisTarget) continue;
      if (!mapSatker.has(d.satuanKerja)) {
        mapSatker.set(d.satuanKerja, d);
      }
    }
    return Array.from(mapSatker.values()).map((d) => ({
      id: d.id,
      status: d.status,
      nomorDokumen: d.nomorDokumen,
      satuanKerja: d.satuanKerja,
      fileDraftPath: d.fileDraftPath,
      fileSignedPath: d.fileSignedPath,
      signedAt: d.signedAt ? d.signedAt.toISOString() : null,
      penandatanganNama: d.penandatanganNama,
    }));
  };

  const daftarSptjmTukin = ambilTerbaruPerSatker("SPTJM_TUKIN");
  const daftarSptjmUangMakan = ambilTerbaruPerSatker("SPTJM_UANG_MAKAN");
  const daftarSptjmLembur = ambilTerbaruPerSatker("SPTJM_LEMBUR");

  const tteTukin = daftarSptjmTukin[0] || null;
  const tteUangMakan = daftarSptjmUangMakan[0] || null;
  const tteLembur = daftarSptjmLembur[0] || null;

  // HELPER UNTUK URL UNDUH
  const hrefBerkas = (format: "xlsx" | "txt", bankKode?: string, jenisOverride?: JenisBerkasAdk) => {
    const targetAdk = jenisOverride ?? adkDipilih;
    const p = new URLSearchParams({
      bulan: periodeBulan,
      tahun: periodeTahun,
      format,
    });
    if (satkerTerpilih) p.set("satker", satkerTerpilih);
    if (jenisPegawai) p.set("jenis", jenisPegawai);
    const bk = bankKode !== undefined ? bankKode : bankDipilih;
    if (bk) p.set("bank", bk);
    return `/ppabp/adk/${targetAdk}?${p.toString()}`;
  };

  // HELPER UNTUK URL TAB
  const tabHref = (targetAdk: JenisBerkasAdk) => {
    const p = new URLSearchParams();
    if (satkerTerpilih) p.set("satker", satkerTerpilih);
    p.set("bulan", periodeBulan);
    p.set("tahun", periodeTahun);
    if (jenisPegawai) p.set("jenis", jenisPegawai);
    p.set("adk", targetAdk);
    return `/ppabp/adk?${p.toString()}`;
  };

  // Parameter yang dibawa papan progres (filter, tab, periode) saat berpindah
  // saringan status / halaman / pencarian unit.
  const paramDasarPapan: Record<string, string> = {
    bulan: periodeBulan,
    tahun: periodeTahun,
    adk: adkDipilih,
    ...(satkerTerpilih ? { satker: satkerTerpilih } : {}),
    ...(jenisPegawai ? { jenis: jenisPegawai } : {}),
  };

  const persentaseTerkirim = Math.round(
    (satkerBoleh.length / (unitAktif.length || 1)) * 100
  );

  // Kartu ringkas: label & angka per tab, bentuknya sama untuk ketiga tab.
  const namaPeriode = `${NAMA_BULAN[bln - 1] ?? bln} ${thn}`;
  const kartuRingkas: { judul: string; angka: React.ReactNode; sub: string; perhatian?: boolean; nada?: "biru" }[] =
    adkDipilih === "tukin"
      ? [
          {
            judul: "Pegawai yang memenuhi syarat",
            angka: (
              <>
                {tukinPeriode.length.toLocaleString("id-ID")}
                <span className="font-mono text-sm font-medium text-muted">
                  /{pegawaiIkut.toLocaleString("id-ID")} pegawai
                </span>
              </>
            ),
            sub:
              tukinPeriode.length >= pegawaiIkut
                ? "Semua data lengkap & valid"
                : `${pegawaiIkut - tukinPeriode.length} pegawai belum punya hasil kalkulasi`,
            perhatian: tukinPeriode.length < pegawaiIkut,
          },
          {
            judul: "Total Pembayaran Bersih",
            angka: formatRupiah(totalTukinBersih),
            sub: "Siap diusulkan ke Kemenkeu",
            nada: "biru",
          },
          {
            judul: "Bank Operasional (SPAN)",
            angka: `${bankTukin.length} Bank SPAN`,
            sub: `${punyaRekening.size}/${tukinPeriode.length} pegawai telah ber-rekening`,
            perhatian: punyaRekening.size < tukinPeriode.length,
          },
        ]
      : adkDipilih === "uang-makan"
        ? [
            {
              judul: "Pegawai berhak uang makan",
              angka: (
                <>
                  {umIkut.toLocaleString("id-ID")}
                  <span className="font-mono text-sm font-medium text-muted"> pegawai</span>
                </>
              ),
              sub: satkerTerpilih || "Seluruh satuan kerja yang sudah mengirim",
            },
            {
              judul: "Total Baris Kehadiran",
              angka: `${pratinjauUm.totalBaris.toLocaleString("id-ID")} baris`,
              sub: "Satu baris per pegawai per hari yang dibayar",
              nada: "biru",
            },
            {
              judul: "Estimasi Total Nominal",
              angka: formatRupiah(totalUmRupiah),
              sub: "Nominal resmi dihitung Web Gaji dari tarif SBM",
            },
          ]
        : [
            {
              judul: "Pegawai lembur",
              angka: (
                <>
                  {pratinjauLembur.pegawai.length.toLocaleString("id-ID")}
                  <span className="font-mono text-sm font-medium text-muted"> pegawai</span>
                </>
              ),
              sub: "Pegawai dengan jam lembur sah pada periode ini",
            },
            {
              judul: "Total Jam Lembur",
              angka: `${totalJamLembur.toLocaleString("id-ID")} jam`,
              sub: `${pratinjauLembur.totalBaris.toLocaleString("id-ID")} baris data harian`,
              nada: "biru",
            },
            {
              judul: "Estimasi Nominal Lembur",
              angka: formatRupiah(totalLemburRupiah),
              sub: "Uang lembur + uang makan lembur (SBM 2026)",
            },
          ];

  const TAB: { kunci: JenisBerkasAdk; label: string; jumlah: number }[] = [
    { kunci: "tukin", label: "Tunjangan Kinerja", jumlah: tukinPeriode.length },
    { kunci: "uang-makan", label: "Uang Makan", jumlah: umIkut },
    ...(TAMPILKAN_ADK_LEMBUR
      ? [{ kunci: "uang-lembur" as const, label: "Uang Lembur", jumlah: pratinjauLembur.pegawai.length }]
      : []),
  ];

  const dokumenTab =
    adkDipilih === "tukin"
      ? { awal: tteTukin, daftar: daftarSptjmTukin }
      : adkDipilih === "uang-makan"
        ? { awal: tteUangMakan, daftar: daftarSptjmUangMakan }
        : { awal: tteLembur, daftar: daftarSptjmLembur };

  return (
    <main className={`${HALAMAN} space-y-4`}>
      {/* ====================================================================
          1. KEPALA: judul + tab komponen, filter + unit terkunci, 3 kartu ringkas
          ==================================================================== */}
      <section className="card p-5 sm:p-6" aria-label="Export ADK">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
              Export ADK
              <SumberAcuan
                judulKeterangan="Tentang Berkas ADK"
                keterangan={[
                  "Hanya memuat rekap unit yang sudah dikirim & dikunci Kasubag TU.",
                  "Excel (.xlsx) dan TXT isinya sama persis — TXT muatan yang disetor, Excel untuk verifikasi visual.",
                  "ADK Tukin memuat rupiah dan dipisah per bank; ADK Uang Makan & Uang Lembur fakta kehadiran harian.",
                  "Nominal uang makan & lembur dihitung otomatis oleh Web Gaji dari grade/golongan pegawai.",
                ]}
                acuan={[
                  {
                    aturan: "Template daftar bayar PPABP",
                    tentang:
                      "ADK Tukin 21 kolom — NIP, nama, nilai bruto/potongan/bersih, kode bank SPAN & nomor rekening",
                  },
                  {
                    aturan: "Template ADK-UM & ADK-Lembur",
                    tentang: "Satu baris per pegawai per hari: NIP, tanggal, dan jam untuk lembur",
                  },
                  {
                    aturan: "SBM 2026 item 22.1 & 23.1 (PMK 32/2025)",
                    tentang: "Tarif uang makan & uang lembur per golongan — dihitung di sisi Web Gaji",
                  },
                  {
                    aturan: "Pemisahan per bank SPAN",
                    tentang: "SAKTI hanya dapat memproses SPP per kode bank SPAN, jadi ADK Tukin dipecah per bank",
                  },
                ]}
                catatan="Berkas ini adalah PERINTAH BAYAR. Setiap pengunduhan tercatat di jejak audit beserta identitas penariknya."
              />
            </h1>
            <p className="mt-1 text-sm text-muted">
              Unduh berkas ADK per bank SPAN dari satuan kerja yang telah mengirim dan mengunci rekap.
            </p>
          </div>

          {/* Tab komponen - segmented control */}
          <nav aria-label="Jenis berkas ADK" className="shrink-0">
            <ul className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface-2 p-1">
              {TAB.map((t) => {
                const aktif = t.kunci === adkDipilih;
                return (
                  <li key={t.kunci}>
                    <Link
                      href={tabHref(t.kunci)}
                      aria-current={aktif ? "page" : undefined}
                      className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm no-underline transition ${
                        aktif ? "bg-navy font-bold text-white shadow-sm" : "font-medium text-ink-2 hover:text-ink"
                      }`}
                    >
                      {t.label}
                      <span
                        className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                          aktif ? "bg-white/20 text-white" : "bg-surface text-ink-2"
                        }`}
                      >
                        {t.jumlah}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        <div className="mt-5 grid gap-4 border-t border-line-2 pt-5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="rounded-xl border border-line bg-surface-2/60 p-4">
            <FilterAdk
              satkerList={satkerBoleh}
              satker={satkerTerpilih}
              bulan={periodeBulan}
              tahun={periodeTahun}
              jenis={jenisPegawai ?? ""}
              adk={adkDipilih}
            />
          </div>
          <div className="rounded-xl border border-line bg-surface-2/60 p-4">
            <p className="field-label text-xs">Unit Terkunci</p>
            <div className="flex items-center gap-3">
              <a
                href="#status-unit"
                title="Lihat progres pengiriman tiap unit"
                className="rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm font-bold text-ink no-underline hover:border-biru/50"
              >
                {satkerBoleh.length} / {unitAktif.length} Satker
              </a>
              <span className="rounded-lg bg-green-tint px-3 py-2 text-xs font-bold text-green">
                {persentaseTerkirim}% Terkunci
              </span>
            </div>
          </div>
        </div>

        <dl className="mt-4 grid gap-4 sm:grid-cols-3">
          {kartuRingkas.map((k) => (
            <div key={k.judul} className="rounded-xl border border-line bg-surface-2/40 p-4">
              <dt className={k.nada === "biru" ? "text-[11px] font-semibold uppercase tracking-wide text-muted" : "text-xs font-semibold text-ink-2"}>
                {k.judul}
              </dt>
              <dd className={`mt-1 font-mono text-xl font-bold ${k.nada === "biru" ? "text-biru-deep" : "text-ink"}`}>
                {k.angka}
              </dd>
              <dd className={`mt-0.5 text-[11px] ${k.perhatian ? "font-medium text-gold-deep" : "text-muted"}`}>{k.sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Periode yang belum bisa diekspor */}
      {totalApproved === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-tint/60 p-4">
          <FiAlertCircle className="mt-0.5 size-5 shrink-0 text-gold-deep" />
          <div className="text-sm text-ink-2">
            <p className="font-bold text-ink">ADK {namaPeriode} belum tersedia</p>
            {totalBelumApproved === 0 ? (
              <p className="mt-1 text-muted">
                Periode ini <strong>belum memiliki kalkulasi yang disimpan</strong>. Jalankan kalkulasi terlebih dahulu di
                menu{" "}
                <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
                  Kalkulasi Unit
                </Link>
                , lalu kunci dan kirim rekap.
              </p>
            ) : (
              <p className="mt-1 text-muted">
                Belum ada satuan kerja yang mengirim dan mengunci rekap pada periode ini. Berkas ADK hanya disusun dari
                unit yang rekapnya telah berstatus <strong>TERKIRIM</strong>.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          2. BERKAS (kiri) + SPTJM & PANDUAN (kanan)
          ==================================================================== */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section className="card p-5" aria-labelledby="judul-berkas-adk">
          {adkDipilih === "tukin" ? (
            <>
              <h2 id="judul-berkas-adk" className="text-base font-bold text-ink">
                Berkas Setoran SAKTI per Bank SPAN
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                SAKTI hanya dapat memproses SPP per kode bank SPAN. Klik unduh pada bank yang bersangkutan.
              </p>

              {bankTukin.length === 0 ? (
                <div className="mt-4 rounded-xl border border-line bg-surface-2 p-6 text-center text-sm text-muted">
                  Belum ada data rekening Tukin yang terdaftar untuk periode ini. Unggah di{" "}
                  <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
                    Rekening Pegawai
                  </Link>
                  .
                </div>
              ) : (
                <ul className="mt-4 divide-y divide-line-2 overflow-hidden rounded-xl border border-line">
                  {bankTukin.map((b) => (
                    <BarisBerkas
                      key={b.kodeBankSpan}
                      logo={<LogoBank nama={b.namaBank} />}
                      judul={b.namaBank}
                      jumlah={b.jumlah}
                      sub={`Berkas Setoran SAKTI per Bank SPAN · kode ${b.kodeBankSpan}`}
                      hrefXlsx={hrefBerkas("xlsx", b.kodeBankSpan)}
                      hrefTxt={hrefBerkas("txt", b.kodeBankSpan)}
                      labelXlsx="Excel (.xlsx)"
                    />
                  ))}
                  <BarisBerkas
                    logo={<span aria-hidden className="grid size-9 place-items-center rounded-lg bg-surface-2" />}
                    judul="Berkas Gabungan Semua Bank"
                    jumlah={tukinPeriode.length}
                    sub="Untuk rekonsiliasi internal lintas bank oleh PPABP"
                    hrefXlsx={hrefBerkas("xlsx", "")}
                    hrefTxt={hrefBerkas("txt", "")}
                    labelXlsx="Gabungan (.xlsx)"
                    latar
                  />
                </ul>
              )}

              {tanpaRekening.length > 0 && (
                <details className="group mt-3 rounded-xl border border-gold/40 bg-gold-tint/40 p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-bold text-gold-deep [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2">
                      <FiAlertCircle className="size-4 shrink-0" />
                      {tanpaRekening.length} pegawai belum memiliki nomor rekening Tukin - tidak masuk berkas per bank
                    </span>
                    <span className="shrink-0 font-semibold text-biru-deep underline">
                      <span className="group-open:hidden">Lihat daftar</span>
                      <span className="hidden group-open:inline">Tutup</span>
                    </span>
                  </summary>
                  <ul className="mt-3 grid grid-cols-1 gap-1 border-t border-gold/20 pt-3 text-xs sm:grid-cols-2">
                    {tanpaRekening.map((p) => (
                      <li key={p.nip} className="rounded-lg bg-surface/70 px-2.5 py-1.5">
                        <span className="font-bold text-ink">{p.nama}</span>
                        <span className="block font-mono text-[11px] text-muted">{p.nip}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/ppabp/rekening"
                    className="btn btn-secondary btn-sm mt-3 inline-flex items-center gap-1.5"
                  >
                    Lengkapi di Rekening Pegawai
                    <FiExternalLink className="size-3.5" />
                  </Link>
                </details>
              )}
            </>
          ) : (
            <>
              <h2 id="judul-berkas-adk" className="text-base font-bold text-ink">
                Berkas ADK {adkDipilih === "uang-makan" ? "Uang Makan" : "Uang Lembur"} (Setoran Web Gaji)
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {adkDipilih === "uang-makan"
                  ? "Satu baris per pegawai per hari kehadiran. Tidak dipisah per bank - nominal dihitung Web Gaji."
                  : "Satu baris per pegawai per hari (NIP + tanggal + jam). Yang mengesahkan hak bayar adalah Surat Perintah Lembur resmi."}
              </p>
              <ul className="mt-4 overflow-hidden rounded-xl border border-line">
                <BarisBerkas
                  logo={<span aria-hidden className="grid size-9 place-items-center rounded-lg bg-surface-2" />}
                  judul={`ADK ${adkDipilih === "uang-makan" ? "Uang Makan" : "Uang Lembur"} ${namaPeriode}`}
                  jumlah={adkDipilih === "uang-makan" ? umIkut : pratinjauLembur.pegawai.length}
                  sub={satkerTerpilih || "Seluruh satuan kerja yang sudah mengirim"}
                  hrefXlsx={hrefBerkas("xlsx")}
                  hrefTxt={hrefBerkas("txt")}
                  labelXlsx="Excel (.xlsx)"
                />
              </ul>

              {adkDipilih === "uang-lembur" &&
                (pratinjauLembur.tanpaKalkulasi.length > 0 || pratinjauLembur.selisih.length > 0) && (
                  <div className="mt-3 space-y-1 rounded-xl border border-gold/40 bg-gold-tint/40 p-3 text-xs text-ink-2">
                    <p className="font-bold text-gold-deep">Periksa catatan lembur sebelum berkas dikirim:</p>
                    {pratinjauLembur.tanpaKalkulasi.length > 0 && (
                      <p>
                        <strong className="text-ink">{pratinjauLembur.tanpaKalkulasi.length} pegawai</strong> punya jam
                        lembur di presensi tetapi belum dihitung pada kalkulasi bulanan.
                      </p>
                    )}
                    {pratinjauLembur.selisih.length > 0 && (
                      <p>
                        <strong className="text-ink">{pratinjauLembur.selisih.length} pegawai</strong> jam lemburnya
                        berbeda dari rekap bulanan (presensi berubah setelah kalkulasi).
                      </p>
                    )}
                  </div>
                )}

              {(adkDipilih === "uang-makan" ? pratinjauUm.pegawai.length : pratinjauLembur.pegawai.length) > 0 && (
                <details className="group mt-3 rounded-xl border border-line p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-ink [&::-webkit-details-marker]:hidden">
                    <span>
                      Pratinjau grid {adkDipilih === "uang-makan" ? "kehadiran harian uang makan" : "jam lembur harian"}
                    </span>
                    <span className="text-xs font-semibold text-biru-deep underline">
                      <span className="group-open:hidden">Buka pratinjau</span>
                      <span className="hidden group-open:inline">Tutup</span>
                    </span>
                  </summary>
                  <div className="mt-3 border-t border-line-2 pt-3">
                    {adkDipilih === "uang-makan" ? (
                      <PratinjauAdkUangMakan data={pratinjauUm} periodeBulan={bln} periodeTahun={thn} />
                    ) : (
                      <PratinjauAdkUangLembur data={pratinjauLembur} periodeBulan={bln} periodeTahun={thn} terbuka />
                    )}
                  </div>
                </details>
              )}
            </>
          )}

          {tanpaJenisBerkas.length > 0 && (
            <div className="mt-3 rounded-xl border border-gold/40 bg-gold-tint/40 p-3 text-xs text-ink-2">
              <p className="font-bold text-gold-deep">
                {tanpaJenisBerkas.length} pegawai belum terpetakan jenisnya (PNS/PPPK)
              </p>
              <p className="mt-1 text-muted">
                Pegawai ini tidak masuk saat filter jenis aktif. Jenis kepegawaian diambil dari SIAP - jalankan
                sinkronisasi pegawai, atau pilih &quot;Semua&quot; pada filter Jenis Pegawai.
              </p>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <PanelTteSptjmPpk
            periodeBulan={bln}
            periodeTahun={thn}
            adkAktif={adkDipilih}
            satuanKerja={satkerTerpilih ?? ""}
            dokumenTteAwal={dokumenTab.awal}
            daftarSptjmUnit={dokumenTab.daftar}
          />

          <PanduanAdk />
        </div>
      </div>

      {/* ====================================================================
          3. PROGRES PENGIRIMAN UNIT + RINGKASAN
          ==================================================================== */}
      <PapanProgres
        progres={progres}
        periodeBulan={bln}
        periodeTahun={thn}
        bolehKembalikan={canKembalikanRekapUnit(authUser)}
        status={statusUnit}
        cari={cariUnit ?? ""}
        hal={halUnit}
        per={perUnit}
        paramDasar={paramDasarPapan}
      />
    </main>
  );
}

/** Logo bank: singkatan dalam kotak berwarna - penanda selain teks nama. */
function LogoBank({ nama }: { nama: string }) {
  const n = nama.toUpperCase();
  const singkat = n.includes("MANDIRI")
    ? "MDR"
    : n.includes("NEGARA INDONESIA") || /\bBNI\b/.test(n)
      ? "BNI"
      : n.includes("RAKYAT") || /\bBRI\b/.test(n)
        ? "BRI"
        : n.includes("SYARIAH") || /\bBSI\b/.test(n)
          ? "BSI"
          : n.includes("TABUNGAN NEGARA") || /\bBTN\b/.test(n)
            ? "BTN"
            : n
                .replace(/^BANK\s+/, "")
                .split(/\s+/)
                .map((k) => k[0])
                .join("")
                .slice(0, 3);
  const warna =
    singkat === "MDR"
      ? "bg-biru/10 text-biru-deep"
      : singkat === "BNI"
        ? "bg-gold-tint text-gold-deep"
        : singkat === "BRI"
          ? "bg-biru/10 text-navy"
          : singkat === "BSI"
            ? "bg-green-tint text-green"
            : "bg-surface-2 text-ink-2";
  return (
    <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-lg font-mono text-[11px] font-extrabold ${warna}`}>
      {singkat}
    </span>
  );
}

/** Satu baris berkas: logo, nama + jumlah pegawai, keterangan, Excel & .txt. */
function BarisBerkas({
  logo,
  judul,
  jumlah,
  sub,
  hrefXlsx,
  hrefTxt,
  labelXlsx,
  latar = false,
}: {
  logo: React.ReactNode;
  judul: string;
  jumlah: number;
  sub: string;
  hrefXlsx: string;
  hrefTxt: string;
  labelXlsx: string;
  latar?: boolean;
}) {
  return (
    <li className={`flex flex-wrap items-center gap-3 px-4 py-3 ${latar ? "bg-surface-2/60" : "bg-surface"}`}>
      {logo}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-ink">
          {judul}
          <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-medium text-ink-2">
            {jumlah} Pegawai
          </span>
        </p>
        <p className="truncate text-xs text-muted">{sub}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <a
          href={hrefXlsx}
          className="inline-flex items-center gap-1.5 rounded-lg bg-navy px-3.5 py-2 text-xs font-bold text-white no-underline transition hover:bg-navy-deep"
        >
          <FiDownload className="size-4" />
          {labelXlsx}
        </a>
        <a
          href={hrefTxt}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs font-medium text-ink-2 no-underline transition hover:border-muted"
        >
          <FiDownload className="size-3.5" />
          .txt
        </a>
      </div>
    </li>
  );
}
