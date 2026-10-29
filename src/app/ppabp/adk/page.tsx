import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { SearchableSelect } from "../../../components/forms/SearchableSelect";
import { canGenerateAdk, canKembalikanRekapUnit, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../../components/feedback/AksesDitolak";
import { NAMA_BULAN } from "../../../lib/format/bulan";
import { periodePunyaTukin, resolvePeriode } from "../../periodeDefault";
import { kelompokkanPerBank } from "../../../business-logic/rekeningPegawai";
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
import {
  JENIS_PEGAWAI_ADK,
  bacaJenisPegawai,
  labelJenisPegawai,
  wherePegawaiTanpaJenis,
} from "./jenisPegawaiAdk";
import { HALAMAN } from "../../../components/layout/layoutHalaman";
import { SumberAcuan } from "../../../components/shared/SumberAcuan";
import { PanelTteSptjmPpk } from "./PanelTteSptjmPpk";
import {
  FiDownload,
  FiFileText,
  FiCheckCircle,
  FiAlertCircle,
  FiChevronDown,
  FiShield,
  FiExternalLink,
} from "react-icons/fi";
import {
  RiMoneyDollarCircleLine,
  RiBuilding4Line,
} from "react-icons/ri";
import { FaUtensils, FaClock } from "react-icons/fa6";

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
  }>;
}) {
  const { satker, bulan, tahun, adk, jenis, bank } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };
  if (!authUser || !canGenerateAdk(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengekspor ADK." />;
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
    where: { statusPegawai: "AKTIF" },
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
    pegawai: { satuanKerja: { notIn: satkerBoleh } },
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

  const persentaseTerkirim = Math.round(
    (satkerBoleh.length / (unitAktif.length || 1)) * 100
  );

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. HEADER HALAMAN & KESIAPAN PERIODE
          ==================================================================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              Export ADK
            </h1>
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
                  tentang:
                    "Satu baris per pegawai per hari: NIP, tanggal, dan jam untuk lembur",
                },
                {
                  aturan: "SBM 2026 item 22.1 & 23.1 (PMK 32/2025)",
                  tentang:
                    "Tarif uang makan & uang lembur per golongan — dihitung di sisi Web Gaji",
                },
                {
                  aturan: "Pemisahan per bank SPAN",
                  tentang:
                    "SAKTI hanya dapat memproses SPP per kode bank SPAN, jadi ADK Tukin dipecah per bank",
                },
              ]}
              catatan="Berkas ini adalah PERINTAH BAYAR. Setiap pengunduhan tercatat di jejak audit beserta identitas penariknya."
            />
          </div>
          <p className="mt-1 text-xs sm:text-sm text-muted">
            Penyusunan dan pengunduhan berkas setoran ke Web Gaji Kemenkeu &amp; lampiran SPP SAKTI.
          </p>
        </div>

        {/* Ringkasan Status Pengiriman Unit */}
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-2xs">
          <div className="text-right">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              Unit Terkunci
            </p>
            <p className="text-sm font-extrabold text-ink">
              <span className="text-biru">{satkerBoleh.length}</span> / {unitAktif.length} Satker
            </p>
          </div>
          <div className="h-8 w-px bg-line-2" />
          <a
            href="#status-unit"
            className="flex items-center gap-1.5 rounded-xl bg-teal-tint/50 px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-tint transition"
            title="Lihat rincian pengiriman tiap unit"
          >
            <span>{persentaseTerkirim}% Terkunci</span>
            <FiChevronDown className="size-3.5" />
          </a>
        </div>
      </div>

      {/* ====================================================================
          2. FILTER BAR PERIODE & SATUAN KERJA
          ==================================================================== */}
      <form method="get" className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
        <input type="hidden" name="adk" value={adkDipilih} />
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="field-label text-xs">Satuan Kerja</label>
            <SearchableSelect
              name="satker"
              options={[
                { value: "", label: "Semua satuan kerja (terkirim)" },
                ...satkerBoleh
                  .slice()
                  .sort((a, b) => a.localeCompare(b, "id-ID"))
                  .map((nama) => ({ value: nama, label: nama })),
              ]}
              defaultValue={satkerTerpilih}
            />
          </div>

          <div className="w-36">
            <label className="field-label text-xs">Bulan</label>
            <SearchableSelect
              name="bulan"
              options={NAMA_BULAN.map((nama, index) => ({
                value: String(index + 1),
                label: nama,
              }))}
              defaultValue={periodeBulan}
            />
          </div>

          <div className="w-24">
            <label className="field-label text-xs">Tahun</label>
            <input
              type="number"
              name="tahun"
              defaultValue={periodeTahun}
              className="field-input w-full py-1.5"
            />
          </div>

          <div className="w-44">
            <label className="field-label text-xs">Jenis Pegawai</label>
            <select
              name="jenis"
              defaultValue={jenisPegawai ?? ""}
              className="field-input w-full py-1.5 text-xs font-semibold"
            >
              <option value="">Semua pegawai</option>
              {JENIS_PEGAWAI_ADK.map((j) => (
                <option key={j.kode} value={j.kode}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-primary h-[38px] px-5 text-xs font-bold">
            Terapkan Filter
          </button>
        </div>
      </form>

      {/* Warning Periode Kosong */}
      {totalApproved === 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-gold/40 bg-gold-tint/60 p-4 shadow-2xs">
          <FiAlertCircle className="size-5 shrink-0 text-gold-deep mt-0.5" />
          <div className="text-xs sm:text-sm text-ink-2">
            <p className="font-bold text-ink">
              ADK {NAMA_BULAN[bln - 1]} {thn} belum tersedia
            </p>
            {totalBelumApproved === 0 ? (
              <p className="mt-1 text-muted">
                Periode ini <strong>belum memiliki kalkulasi yang disimpan</strong>. Jalankan kalkulasi terlebih dahulu di menu{" "}
                <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
                  Kalkulasi Unit
                </Link>
                , lalu kunci dan kirim rekap.
              </p>
            ) : (
              <p className="mt-1 text-muted">
                Belum ada satuan kerja yang mengirim dan mengunci rekap pada periode ini. Berkas ADK hanya disusun dari unit yang rekapnya telah berstatus <strong>TERKIRIM</strong>.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          3. TAB NAVIGASI UTAMA (TUKIN / UANG MAKAN / UANG LEMBUR)
          ==================================================================== */}
      <div className="flex flex-wrap gap-2 border-b border-line pb-1">
        {/* Tab 1: Tukin */}
        <Link
          href={tabHref("tukin")}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-2xs ${
            adkDipilih === "tukin"
              ? "bg-navy text-white shadow-xs"
              : "border border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <RiMoneyDollarCircleLine className="size-4 shrink-0" />
          <span>Tunjangan Kinerja</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-mono font-bold ${
              adkDipilih === "tukin" ? "bg-white/20 text-white" : "bg-surface-2 text-ink"
            }`}
          >
            {tukinPeriode.length}
          </span>
          {tteTukin?.status === "TERTANDATANGANI" && (
            <span title="SPTJM TTE Sudah Disahkan">
              <FiCheckCircle className="size-3.5 text-green-300" />
            </span>
          )}
        </Link>

        {/* Tab 2: Uang Makan */}
        <Link
          href={tabHref("uang-makan")}
          className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-2xs ${
            adkDipilih === "uang-makan"
              ? "bg-navy text-white shadow-xs"
              : "border border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink"
          }`}
        >
          <FaUtensils className="size-3.5 shrink-0" />
          <span>Uang Makan</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-mono font-bold ${
              adkDipilih === "uang-makan" ? "bg-white/20 text-white" : "bg-surface-2 text-ink"
            }`}
          >
            {umIkut}
          </span>
          {tteUangMakan?.status === "TERTANDATANGANI" && (
            <span title="SPTJM TTE Sudah Disahkan">
              <FiCheckCircle className="size-3.5 text-green-300" />
            </span>
          )}
        </Link>

        {/* Tab 3: Uang Lembur */}
        {TAMPILKAN_ADK_LEMBUR && (
          <Link
            href={tabHref("uang-lembur")}
            className={`flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-2xs ${
              adkDipilih === "uang-lembur"
                ? "bg-navy text-white shadow-xs"
                : "border border-line bg-surface text-muted hover:bg-surface-2 hover:text-ink"
            }`}
          >
            <FaClock className="size-3.5 shrink-0" />
            <span>Uang Lembur</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-mono font-bold ${
                adkDipilih === "uang-lembur" ? "bg-white/20 text-white" : "bg-surface-2 text-ink"
              }`}
            >
              {pratinjauLembur.pegawai.length}
            </span>
            {tteLembur?.status === "TERTANDATANGANI" && (
              <span title="SPTJM TTE Sudah Disahkan">
                <FiCheckCircle className="size-3.5 text-green-300" />
              </span>
            )}
          </Link>
        )}
      </div>

      {/* ====================================================================
          4. KONTEN TAB: TUNJANGAN KINERJA (TUKIN)
          ==================================================================== */}
      {adkDipilih === "tukin" && (
        <div className="space-y-6">
          {/* Kartu Ringkasan Metrik Tukin */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Pegawai Berhak Tukin
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink">
                {tukinPeriode.length.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-semibold text-muted">orang</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {satkerTerpilih ? satkerTerpilih : "Semua satker yang sudah mengunci rekap"}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Total Pembayaran Bersih
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-teal-deep">
                {formatRupiah(totalTukinBersih)}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Nilai bersih setelah potongan presensi &amp; PPh
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Sebaran Bank Operasional
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink">
                {bankTukin.length}{" "}
                <span className="text-xs font-semibold text-muted">Bank SPAN</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {punyaRekening.size} dari {tukinPeriode.length} pegawai telah ber-rekening
              </p>
            </div>
          </div>

          {/* Unduh Berkas Gabungan (Semua Bank / Arsip Internal) */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  Berkas Gabungan (Semua Bank / Rekonsiliasi Internal)
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Format 21 kolom lengkap mencakup seluruh rekening bank. Cocok untuk rekonsiliasi internal &amp; pengarsipan (bukan untuk SPP SAKTI).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={hrefBerkas("xlsx", "")}
                  className="btn btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-2xs"
                >
                  <FiDownload className="size-4" />
                  <span>Unduh Excel (.xlsx)</span>
                </a>
                <a
                  href={hrefBerkas("txt", "")}
                  className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
                >
                  <FiFileText className="size-4" />
                  <span>TXT</span>
                </a>
              </div>
            </div>
          </section>

          {/* Unduh Per Bank SPAN (Wajib untuk SPP SAKTI) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide text-ink">
                  Berkas Setoran SAKTI per Bank SPAN
                </h3>
                <p className="text-xs text-muted">
                  SAKTI hanya dapat memproses SPP per kode bank SPAN. Klik unduh pada bank yang bersangkutan.
                </p>
              </div>
            </div>

            {bankTukin.length === 0 ? (
              <div className="rounded-2xl border border-line bg-surface-2 p-6 text-center text-sm text-muted">
                Belum ada data rekening Tukin yang terdaftar untuk periode ini. Unggah di{" "}
                <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
                  Rekening Pegawai
                </Link>
                .
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {bankTukin.map((b) => (
                  <div
                    key={b.kodeBankSpan}
                    className="flex flex-col justify-between rounded-2xl border border-line bg-surface p-4 shadow-2xs hover:border-teal-deep/50 transition"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-navy">
                            <RiBuilding4Line className="size-4" />
                          </div>
                          <div>
                            <p className="font-bold text-sm text-ink">{b.namaBank}</p>
                            <p className="font-mono text-[11px] text-muted">
                              SPAN: {b.kodeBankSpan}
                            </p>
                          </div>
                        </div>
                        <span className="rounded-full bg-teal-tint px-2 py-0.5 text-xs font-bold text-teal-deep">
                          {b.jumlah} Pegawai
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2 border-t border-line-2 pt-3">
                      <a
                        href={hrefBerkas("xlsx", b.kodeBankSpan)}
                        className="btn btn-primary btn-sm flex-1 justify-center text-xs font-bold"
                      >
                        <FiDownload className="size-3.5" />
                        <span>Excel</span>
                      </a>
                      <a
                        href={hrefBerkas("txt", b.kodeBankSpan)}
                        className="btn btn-ghost btn-sm text-xs font-bold"
                      >
                        <span>TXT</span>
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Peringatan Pegawai Tanpa Rekening */}
          {tanpaRekening.length > 0 && (
            <details className="group rounded-2xl border border-gold/40 bg-gold-tint/40 p-4 shadow-2xs">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-sm text-gold-deep">
                <span className="flex items-center gap-2">
                  <FiAlertCircle className="size-4 shrink-0" />
                  <span>
                    {tanpaRekening.length} pegawai belum memiliki nomor rekening Tukin
                  </span>
                </span>
                <span className="text-xs font-semibold text-teal-deep underline">
                  <span className="group-open:hidden">Lihat daftar</span>
                  <span className="hidden group-open:inline">Tutup</span>
                </span>
              </summary>
              <div className="mt-3 border-t border-gold/20 pt-3 text-xs text-ink-2 space-y-2">
                <p>
                  Pegawai di bawah ini <strong>tidak masuk ke berkas per-bank SAKTI</strong> karena belum terdaftar di tabel rekening Tukin:
                </p>
                <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 md:grid-cols-3">
                  {tanpaRekening.map((p) => (
                    <li key={p.nip} className="rounded-lg bg-surface/70 px-2.5 py-1.5 font-medium">
                      <span className="font-bold text-ink">{p.nama}</span>
                      <span className="block font-mono text-[11px] text-muted">{p.nip}</span>
                    </li>
                  ))}
                </ul>
                <p className="pt-2">
                  <Link href="/ppabp/rekening" className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
                    <span>Lengkapi di Rekening Pegawai</span>
                    <FiExternalLink className="size-3.5" />
                  </Link>
                </p>
              </div>
            </details>
          )}

          {/* Peringatan Pegawai Tanpa Jenis */}
          {tanpaJenisBerkas.length > 0 && (
            <div className="rounded-2xl border border-gold/40 bg-gold-tint/40 p-4 text-xs text-ink-2">
              <p className="font-bold text-gold-deep">
                {tanpaJenisBerkas.length} pegawai belum terpetakan jenisnya (PNS/PPPK)
              </p>
              <p className="mt-1 text-muted">
                Pegawai ini tidak masuk saat filter jenis aktif. Jenis kepegawaian diambil dari SIAP - jalankan
                sinkronisasi pegawai, atau pilih &quot;Semua pegawai&quot; pada filter.
              </p>
            </div>
          )}

          {/* Panel TTE SPTJM PPK (Tukin) */}
          <PanelTteSptjmPpk
            periodeBulan={bln}
            periodeTahun={thn}
            adkAktif="tukin"
            satuanKerja={satkerTerpilih ?? ""}
            dokumenTteAwal={tteTukin}
            daftarSptjmUnit={daftarSptjmTukin}
          />
        </div>
      )}

      {/* ====================================================================
          5. KONTEN TAB: UANG MAKAN
          ==================================================================== */}
      {adkDipilih === "uang-makan" && (
        <div className="space-y-6">
          {/* Kartu Ringkasan Metrik Uang Makan */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Pegawai Berhak Uang Makan
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink">
                {umIkut.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-semibold text-muted">orang</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {satkerTerpilih ? satkerTerpilih : "Seluruh satuan kerja yang sudah dikirim"}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Total Baris Kehadiran
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-teal-deep">
                {pratinjauUm.totalBaris.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-semibold text-muted">baris</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Format harian NIP + tanggal kehadiran yang dibayar
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Estimasi Total Nominal
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink">
                {formatRupiah(totalUmRupiah)}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Nominal resmi dihitung oleh Web Gaji dari tarif SBM
              </p>
            </div>
          </div>

          {/* Unduh Berkas ADK Uang Makan */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  Berkas ADK Uang Makan (Setoran Web Gaji)
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Satu baris per pegawai per hari kehadiran. Berkas ini tidak dipisah per bank (nominal dihitung otomatis oleh Web Gaji).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={hrefBerkas("xlsx")}
                  className="btn btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-2xs"
                >
                  <FiDownload className="size-4" />
                  <span>Unduh Excel (.xlsx)</span>
                </a>
                <a
                  href={hrefBerkas("txt")}
                  className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
                >
                  <FiFileText className="size-4" />
                  <span>TXT</span>
                </a>
              </div>
            </div>
          </section>

          {/* Pratinjau Grid Kehadiran Uang Makan */}
          {pratinjauUm.pegawai.length > 0 && (
            <details className="group rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-sm text-ink">
                <span>Pratinjau Grid Kehadiran Harian Uang Makan</span>
                <span className="text-xs font-semibold text-teal-deep underline">
                  <span className="group-open:hidden">Buka pratinjau</span>
                  <span className="hidden group-open:inline">Tutup</span>
                </span>
              </summary>
              <div className="mt-4 border-t border-line-2 pt-4">
                <PratinjauAdkUangMakan
                  data={pratinjauUm}
                  periodeBulan={bln}
                  periodeTahun={thn}
                />
              </div>
            </details>
          )}

          {/* Panel TTE SPTJM PPK (Uang Makan) */}
          <PanelTteSptjmPpk
            periodeBulan={bln}
            periodeTahun={thn}
            adkAktif="uang-makan"
            satuanKerja={satkerTerpilih ?? ""}
            dokumenTteAwal={tteUangMakan}
            daftarSptjmUnit={daftarSptjmUangMakan}
          />
        </div>
      )}

      {/* ====================================================================
          6. KONTEN TAB: UANG LEMBUR
          ==================================================================== */}
      {adkDipilih === "uang-lembur" && TAMPILKAN_ADK_LEMBUR && (
        <div className="space-y-6">
          {/* Kartu Ringkasan Metrik Lembur */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Pegawai Lembur
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink">
                {pratinjauLembur.pegawai.length.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-semibold text-muted">orang</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Pegawai dengan jam lembur sah pada periode ini
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Total Jam Lembur
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-teal-deep">
                {totalJamLembur.toLocaleString("id-ID")}{" "}
                <span className="text-xs font-semibold text-muted">Jam</span>
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {pratinjauLembur.totalBaris.toLocaleString("id-ID")} baris data harian
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Estimasi Nominal Lembur
              </p>
              <p className="mt-1 font-mono text-2xl font-black text-ink">
                {formatRupiah(totalLemburRupiah)}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                Uang lembur + uang makan lembur (SBM 2026)
              </p>
            </div>
          </div>

          {/* Unduh Berkas ADK Uang Lembur */}
          <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  Berkas ADK Uang Lembur (Setoran Web Gaji)
                </h3>
                <p className="mt-0.5 text-xs text-muted">
                  Satu baris per pegawai per hari (NIP + Tanggal + Jam). Yang mengesahkan hak bayar adalah Surat Perintah Lembur resmi.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={hrefBerkas("xlsx")}
                  className="btn btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-2xs"
                >
                  <FiDownload className="size-4" />
                  <span>Unduh Excel (.xlsx)</span>
                </a>
                <a
                  href={hrefBerkas("txt")}
                  className="btn btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
                >
                  <FiFileText className="size-4" />
                  <span>TXT</span>
                </a>
              </div>
            </div>
          </section>

          {/* Peringatan & Validasi Lembur */}
          {(pratinjauLembur.tanpaKalkulasi.length > 0 || pratinjauLembur.selisih.length > 0) && (
            <div className="rounded-2xl border border-gold/40 bg-gold-tint/40 p-4 text-xs text-ink-2 space-y-2">
              <p className="font-bold text-gold-deep">
                Periksa catatan lembur sebelum berkas dikirim:
              </p>
              <ul className="list-disc list-inside space-y-1 text-muted">
                {pratinjauLembur.tanpaKalkulasi.length > 0 && (
                  <li>
                    <strong className="text-ink">
                      {pratinjauLembur.tanpaKalkulasi.length} pegawai
                    </strong>{" "}
                    memiliki jam lembur di presensi tetapi belum dihitung pada kalkulasi bulanan.
                  </li>
                )}
                {pratinjauLembur.selisih.length > 0 && (
                  <li>
                    <strong className="text-ink">
                      {pratinjauLembur.selisih.length} pegawai
                    </strong>{" "}
                    jam lemburnya berbeda dari rekap bulanan (terjadi perubahan presensi setelah kalkulasi).
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Pratinjau Grid Jam Lembur Harian */}
          {pratinjauLembur.pegawai.length > 0 && (
            <details className="group rounded-2xl border border-line bg-surface p-4 shadow-2xs">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold text-sm text-ink">
                <span>Pratinjau Grid Jam Lembur Harian</span>
                <span className="text-xs font-semibold text-teal-deep underline">
                  <span className="group-open:hidden">Buka pratinjau</span>
                  <span className="hidden group-open:inline">Tutup</span>
                </span>
              </summary>
              <div className="mt-4 border-t border-line-2 pt-4">
                <PratinjauAdkUangLembur
                  data={pratinjauLembur}
                  periodeBulan={bln}
                  periodeTahun={thn}
                  terbuka={true}
                />
              </div>
            </details>
          )}

          {/* Panel TTE SPTJM PPK (Uang Lembur) */}
          <PanelTteSptjmPpk
            periodeBulan={bln}
            periodeTahun={thn}
            adkAktif="uang-lembur"
            satuanKerja={satkerTerpilih ?? ""}
            dokumenTteAwal={tteLembur}
            daftarSptjmUnit={daftarSptjmLembur}
          />
        </div>
      )}

      {/* ====================================================================
          7. STATUS PENGIRIMAN SELURUH UNIT (COLLAPSIBLE DI BAWAH)
          ==================================================================== */}
      <details id="status-unit" className="group rounded-2xl border border-line bg-surface p-4 shadow-2xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-ink">
              Status Pengiriman Satuan Kerja ({satkerBoleh.length} / {unitAktif.length} Terkunci)
            </span>
            <span className="rounded-full bg-teal-tint px-2 py-0.5 text-xs font-bold text-teal-deep">
              {persentaseTerkirim}%
            </span>
          </div>
          <span className="text-xs font-semibold text-teal-deep underline">
            <span className="group-open:hidden">Lihat rincian unit</span>
            <span className="hidden group-open:inline">Tutup</span>
          </span>
        </summary>
        <div className="mt-4 border-t border-line-2 pt-4">
          <PapanProgres
            progres={progres}
            periodeBulan={bln}
            periodeTahun={thn}
            bolehKembalikan={canKembalikanRekapUnit(authUser)}
          />
        </div>
      </details>

      {/* ====================================================================
          8. INFORMASI FORMAT ADK & DOKUMENTASI TEKNIS
          ==================================================================== */}
      <details className="group rounded-2xl border border-line bg-surface p-4 shadow-2xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-ink">
          <span>Struktur &amp; Ketentuan Berkas ADK</span>
          <span className="text-xs font-semibold text-teal-deep underline">
            <span className="group-open:hidden">Buka panduan</span>
            <span className="hidden group-open:inline">Tutup</span>
          </span>
        </summary>
        <ul className="mt-3 space-y-2 border-t border-line-2 pt-3 text-xs text-muted leading-relaxed">
          <li>
            <strong className="text-ink">Format Setoran PPABP:</strong> Berkas ADK memuat format baku yang diterima langsung oleh Web Gaji Kemenkeu tanpa baris header tambahan atau format tabel dekoratif.
          </li>
          <li>
            <strong className="text-ink">Pemisahan SAKTI:</strong> ADK Tukin wajib dipisah per kode bank SPAN karena aplikasi SAKTI hanya dapat menerbitkan SPP per satu rekening bank operasional yang sama.
          </li>
          <li>
            <strong className="text-ink">Struktur Excel ADK Uang Makan &amp; Lembur:</strong> Terdiri atas sheet <span className="font-mono text-ink">hasil</span> (data mentah setoran) dan sheet <span className="font-mono text-ink">depan</span> (tampilan grid per tanggal untuk audit visual).
          </li>
        </ul>
      </details>
    </main>
  );
}
