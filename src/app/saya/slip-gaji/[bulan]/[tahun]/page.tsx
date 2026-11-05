import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import { getSessionAccount } from "../../../../../auth/getSessionAccount";
import { canCetakSlipGajiSendiri } from "../../../../../auth/permissions";
import { hitungTotalPenghasilanSlip } from "../../../../../business-logic/gajiInduk";
import { getEselon1 } from "../../../../../business-logic/strukturEselon";
import { AksesDitolak } from "../../../../../components/feedback/AksesDitolak";
import { NAMA_BULAN } from "../../../../../lib/format/bulan";
import { PrintButton } from "../../../PrintButton";
import { NavigasiBulan } from "../../../NavigasiBulan";
import { periodeDariParam } from "../../../periodeSaya";
import { keteranganFinalitas } from "../../../statusPembayaran";
import { statusUnit } from "../../../../../business-logic/pengirimanUnit";
import { periodeSekarang } from "../../../../periodeDefault";
import { TAMPILKAN_NOMINAL_LEMBUR } from "../../../../../lib/format/tampilUangLembur";

export const dynamic = "force-dynamic";

/**
 * SLIP GAJI - mengikuti format "PERINCIAN PEMBAYARAN GAJI" yang selama ini
 * dicetak manual oleh PPABP Setjen (contoh: slip a.n. MANGGALA HARTANTO,
 * Februari 2025). Urutan baris, penamaan komponen, dan blok tanda tangan
 * sengaja dibuat sama supaya hasil cetak Gajihub bisa langsung menggantikan
 * proses manualnya.
 *
 * Sumber angkanya dua: bagian PENGHASILAN/POTONGAN dari `GajiInduk` (upload
 * ADK GPP oleh PPABP), sisanya dari kalkulasi Gajihub sendiri (Tukin, Uang
 * Makan, Uang Lembur) + honorarium yang diinput manual PPABP.
 *
 * TODO(confirm):
 * - Alamat kantor di kop masih satu alamat (kantor pusat Kemnaker, sesuai
 *   slip contoh). Kalau pilot melebar ke satker di luar Gatot Subroto, ini
 *   perlu jadi data per satuan kerja, bukan konstanta.
 * - Slip contoh punya logo Kemnaker di kop. Sengaja TIDAK ditiru di sini -
 *   yang tersedia di repo cuma logo Gajihub, dan memakai logo itu di dokumen
 *   yang formatnya dokumen resmi kementerian jelas keliru.
 */

const ALAMAT_KANTOR = ["Jl. Jenderal Gatot Subroto kav. 51", "Jakarta - Selatan"];
const ALAMAT_KOP = "Jalan Jenderal Gatot Subroto kav. 51 Jakarta Selatan 12950 Telp. 5255733";

/** Format angka gaya slip: ribuan bertitik, nilai nol jadi "-" (sama dengan contoh). */
const formatAngka = (nilai: number) =>
  nilai === 0 ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(nilai);

function BarisNilai({
  nomor,
  label,
  nilai,
  tebal,
  garisAtas,
}: {
  nomor?: number;
  label: string;
  nilai: number;
  tebal?: boolean;
  garisAtas?: boolean;
}) {
  return (
    <tr className={garisAtas ? "border-t border-line" : undefined}>
      <td className={`break-words py-1 pr-2 align-top ${nomor ? "pl-6" : "pl-2"} ${tebal ? "font-bold text-ink" : "text-ink-2"}`}>
        {nomor ? `${nomor}. ` : ""}
        {label}
      </td>
      <td className={`py-1 pr-2 align-top ${tebal ? "font-bold text-ink" : "text-ink-2"}`}>:</td>
      <td className={`py-1 pr-2 align-top ${tebal ? "font-bold text-ink" : "text-ink-2"}`}>Rp</td>
      <td className={`whitespace-nowrap py-1 text-right align-top font-mono tabular-nums ${tebal ? "font-bold text-ink" : "text-ink-2"}`}>
        {formatAngka(nilai)}
      </td>
    </tr>
  );
}

export default async function SlipGajiPage({
  params,
}: {
  params: Promise<{ bulan: string; tahun: string }>;
}) {
  const { bulan: bulanParam, tahun: tahunParam } = await params;
  const periodeSah = periodeDariParam(bulanParam, tahunParam);

  // Guard: SEMUA role bisa cetak slip gaji sendiri (privilege Pegawai
  // otomatis dipunya semua role - lihat canCetakSlipGajiSendiri di
  // src/auth/permissions.ts dan "Simulasi role matrix lengkap" di CLAUDE.md).
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }
  if (!canCetakSlipGajiSendiri(authUser, authUser.nip)) {
    return <AksesDitolak pesan="Kamu tidak berwenang melihat halaman ini." />;
  }
  if (!periodeSah) {
    return (
      <AksesDitolak
        pesan="Alamat periode tidak sah."
        hrefAlternatif="/saya?tab=dokumen"
        labelAlternatif="Kembali ke Data Saya"
      />
    );
  }
  const periodeBulan = periodeSah.bulan;
  const periodeTahun = periodeSah.tahun;
  const sekarang = periodeSekarang();

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    include: {
      tukinCalc: { where: { periodeBulan, periodeTahun } },
      uangMakan: { where: { periodeBulan, periodeTahun } },
      uangLembur: { where: { periodeBulan, periodeTahun } },
      gajiInduk: {
        where: { periodeBulan, periodeTahun },
        include: { diunggahOleh: { select: { nama: true, nip: true } } },
      },
    },
  });

  if (!pegawai) {
    return <AksesDitolak pesan={`Data kepegawaian untuk NIP ${authUser.nip} belum tercatat di Gajihub. Hubungi Admin Gajihub.`} />;
  }

  const tukin = pegawai.tukinCalc[0];
  const uangMakan = pegawai.uangMakan[0];
  const uangLembur = pegawai.uangLembur[0];
  const gaji = pegawai.gajiInduk[0];

  if (!tukin && !uangMakan && !uangLembur && !gaji) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <Link href="/saya?tab=dokumen" className="text-sm font-semibold text-teal-deep underline">
            &larr; Kembali ke Data Saya
          </Link>
          <NavigasiBulan periode={periodeSah} sekarang={sekarang} dasar="/saya/slip-gaji" />
        </div>
        <div className="card mt-4 p-5">
          <h1 className="text-base font-extrabold text-ink">Slip Gaji</h1>
          <p className="mt-2 text-sm text-muted">
            Belum ada data pembayaran untuk {NAMA_BULAN[periodeBulan - 1]} {periodeTahun}. Gunakan tombol periode di
            atas untuk membuka bulan lain.
          </p>
        </div>
      </main>
    );
  }

  // Finalitas mengikuti keadaan rekap UNIT pegawai (statusUnit), bukan status
  // per-baris kalkulasi. Hanya relevan bila ada komponen hitungan Gajihub;
  // gaji induk berasal dari ADK GPP PPABP, bukan dari rekap unit.
  const adaKomponenGajihub = Boolean(tukin || uangMakan || (TAMPILKAN_NOMINAL_LEMBUR && uangLembur));
  let peringatanFinal: string | null = null;
  if (adaKomponenGajihub) {
    const barisKirim = await prisma.pengirimanUnit.findUnique({
      where: {
        satuanKerja_periodeBulan_periodeTahun: { satuanKerja: pegawai.satuanKerja, periodeBulan, periodeTahun },
      },
      select: { status: true, dikirimPada: true, alasanKembali: true },
    });
    peringatanFinal = keteranganFinalitas(statusUnit(barisKirim)).peringatan;
  }

  // "Tunjangan Umum/Jabatan" di slip = tunjangan umum PNS ATAU tunjangan
  // struktural (di file GPP dua kolom terpisah, tapi satu pegawai praktis
  // cuma dapat salah satunya - yang fungsional masuk baris berikutnya).
  const tunjanganUmumJabatan = (gaji?.tunjanganUmum ?? 0) + (gaji?.tunjanganStruktural ?? 0);

  const totalPenghasilanSlip = hitungTotalPenghasilanSlip({
    gajiBersih: gaji?.gajiBersih ?? 0,
    tunjanganKinerja: tukin?.tukinBersih ?? 0,
    uangMakan: uangMakan?.totalUangMakan ?? 0,
    // Lihat src/lib/format/tampilUangLembur.ts. Sekali slip tercetak, keterangan
    // "angka ini belum final" tidak ikut tercetak bersamanya.
    uangLembur: TAMPILKAN_NOMINAL_LEMBUR ? uangLembur?.totalUangLembur ?? 0 : 0,
    honorarium: gaji?.honorarium ?? 0,
  });

  const unitEselon1 = getEselon1(pegawai.satuanKerja) ?? pegawai.satuanKerja;
  const tanggalCetak = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date()
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8 print:max-w-full print:px-0 print:py-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/saya" className="text-sm font-semibold text-teal-deep underline">
          &larr; Kembali ke Data Saya
        </Link>
        <NavigasiBulan periode={periodeSah} sekarang={sekarang} dasar="/saya/slip-gaji" />
        <PrintButton label="Cetak" />
      </div>

      <div className="card mt-4 p-4 sm:p-8 print:border-0 print:p-0 print:shadow-none">
        {/* --- KOP --- */}
        <div className="border-b-2 border-ink pb-3 text-center">
          <p className="text-base font-semibold uppercase tracking-wide text-ink">Kementerian Ketenagakerjaan RI</p>
          <p className="text-lg font-extrabold uppercase tracking-wide text-ink">{unitEselon1}</p>
          <p className="mt-0.5 text-xs text-ink-2">{ALAMAT_KOP}</p>
          <p className="text-xs text-ink-2">Laman : www.naker.go.id</p>
        </div>

        <div className="mt-5 text-center">
          <h1 className="text-sm font-extrabold uppercase tracking-wide text-ink underline">
            Perincian Pembayaran Gaji
          </h1>
          <p className="mt-1 text-sm font-extrabold uppercase tracking-wide text-ink">
            Bulan : {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} {periodeTahun}
          </p>
        </div>

        {peringatanFinal && (
          <p className="mt-4 rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep print:border print:border-line">
            {peringatanFinal}
          </p>
        )}

        {/* --- IDENTITAS --- */}
        <table data-tabel="dokumen" className="mt-5 w-full text-sm">
          <tbody>
            <tr className="block sm:table-row print:table-row">
              <td className="block pt-1.5 text-xs align-top text-ink-2 sm:table-cell sm:w-56 sm:pt-0.5 sm:text-sm print:table-cell print:w-56 print:text-sm">Nama</td>
              <td className="hidden w-4 py-0.5 align-top text-ink-2 sm:table-cell print:table-cell">:</td>
              <td className="block py-0.5 align-top sm:table-cell print:table-cell font-semibold text-ink">{pegawai.nama}</td>
            </tr>
            <tr className="block sm:table-row print:table-row">
              <td className="block pt-1.5 text-xs align-top text-ink-2 sm:table-cell sm:w-56 sm:pt-0.5 sm:text-sm print:table-cell print:w-56 print:text-sm">Nomor Induk Pegawai (NIP)</td>
              <td className="hidden py-0.5 align-top text-ink-2 sm:table-cell print:table-cell">:</td>
              <td className="block py-0.5 align-top sm:table-cell print:table-cell font-mono text-ink">{pegawai.nip}</td>
            </tr>
            <tr className="block sm:table-row print:table-row">
              <td className="block pt-1.5 text-xs align-top text-ink-2 sm:table-cell sm:w-56 sm:pt-0.5 sm:text-sm print:table-cell print:w-56 print:text-sm">Golongan/Pangkat</td>
              <td className="hidden py-0.5 align-top text-ink-2 sm:table-cell print:table-cell">:</td>
              <td className="block py-0.5 align-top text-ink sm:table-cell print:table-cell">{pegawai.golongan ?? "-"}</td>
            </tr>
            <tr className="block sm:table-row print:table-row">
              <td className="block pt-1.5 text-xs align-top text-ink-2 sm:table-cell sm:w-56 sm:pt-0.5 sm:text-sm print:table-cell print:w-56 print:text-sm">Jabatan</td>
              <td className="hidden py-0.5 align-top text-ink-2 sm:table-cell print:table-cell">:</td>
              <td className="block py-0.5 align-top text-ink sm:table-cell print:table-cell">{pegawai.jabatan ?? "-"}</td>
            </tr>
            <tr className="block sm:table-row print:table-row">
              <td className="block pt-1.5 text-xs align-top text-ink-2 sm:table-cell sm:w-56 sm:pt-0.5 sm:text-sm print:table-cell print:w-56 print:text-sm">Unit Kerja</td>
              <td className="hidden py-0.5 align-top text-ink-2 sm:table-cell print:table-cell">:</td>
              <td className="block py-0.5 align-top text-ink sm:table-cell print:table-cell">{pegawai.satuanKerja}</td>
            </tr>
            <tr className="block sm:table-row print:table-row">
              <td className="block pt-1.5 text-xs align-top text-ink-2 sm:table-cell sm:w-56 sm:pt-0.5 sm:text-sm print:table-cell print:w-56 print:text-sm">Alamat Kantor</td>
              <td className="hidden py-0.5 align-top text-ink-2 sm:table-cell print:table-cell">:</td>
              <td className="block py-0.5 align-top text-ink sm:table-cell print:table-cell">
                {ALAMAT_KANTOR.map((baris) => (
                  <span key={baris} className="block">
                    {baris}
                  </span>
                ))}
              </td>
            </tr>
          </tbody>
        </table>

        {/* --- RINCIAN --- */}
        <p className="mt-5 text-sm text-ink-2">Keterangan</p>

        {gaji ? (
          <table data-tabel="dokumen" className="mt-1 w-full text-sm">
            <tbody>
              <tr>
                <td colSpan={4} className="pb-1 pl-2 font-bold uppercase text-ink underline">
                  Penghasilan
                </td>
              </tr>
              <BarisNilai nomor={1} label="Gaji Pokok" nilai={gaji.gajiPokok} />
              <BarisNilai nomor={2} label="Tunjangan Istri/Suami" nilai={gaji.tunjanganIstri} />
              <BarisNilai nomor={3} label="Tunjangan Anak" nilai={gaji.tunjanganAnak} />
              <BarisNilai nomor={4} label="Tunjangan Umum/Jabatan" nilai={tunjanganUmumJabatan} />
              <BarisNilai nomor={5} label="Tunjangan Fungsional" nilai={gaji.tunjanganFungsional} />
              <BarisNilai nomor={6} label="Tunjangan Beras" nilai={gaji.tunjanganBeras} />
              <BarisNilai nomor={7} label="PPH" nilai={gaji.tunjanganPph} />
              <BarisNilai nomor={8} label="Pembulatan" nilai={gaji.pembulatan} />
              {/* Baris tambahan yang TIDAK ada di slip contoh - cuma muncul kalau
                  satker ini memang mengisinya, supaya tidak ada nilai dari file
                  GPP yang hilang tanpa jejak di slip. */}
              {gaji.tunjanganLain > 0 && <BarisNilai nomor={9} label="Tunjangan Lain-lain" nilai={gaji.tunjanganLain} />}
              <BarisNilai label="Jumlah Penghasilan" nilai={gaji.totalPenghasilan} garisAtas />

              <tr>
                <td colSpan={4} className="pb-1 pl-2 pt-4 font-bold uppercase text-ink underline">
                  Potongan
                </td>
              </tr>
              <BarisNilai nomor={1} label="Iuran Gaji Pegawai" nilai={gaji.potonganIuranPegawai} />
              <BarisNilai nomor={2} label="PPH" nilai={gaji.potonganPph} />
              <BarisNilai nomor={3} label="BPJS" nilai={gaji.potonganBpjs} />
              {gaji.potonganLain > 0 && <BarisNilai nomor={4} label="Potongan Lain-lain" nilai={gaji.potonganLain} />}
              <BarisNilai label="Jumlah Potongan" nilai={gaji.totalPotongan} garisAtas />

              <BarisNilai label="Jumlah Gaji Bersih" nilai={gaji.gajiBersih} tebal garisAtas />
              <BarisNilai label="Tunjangan Kinerja" nilai={tukin?.tukinBersih ?? 0} />
              <BarisNilai label="Uang Makan" nilai={uangMakan?.totalUangMakan ?? 0} />
              {TAMPILKAN_NOMINAL_LEMBUR && (
                <BarisNilai label="Uang Lembur" nilai={uangLembur?.totalUangLembur ?? 0} />
              )}
              <BarisNilai label="Honorarium" nilai={gaji.honorarium} />
              <BarisNilai label="Total Penghasilan" nilai={totalPenghasilanSlip} tebal garisAtas />
            </tbody>
          </table>
        ) : (
          <>
            <div className="mt-1 rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep print:border print:border-line">
              Gaji pokok dan tunjangan bulan ini belum tersedia; slip ini baru memuat Tunjangan Kinerja dan Uang Makan
              {TAMPILKAN_NOMINAL_LEMBUR && " dan Uang Lembur"}.
            </div>
            <table data-tabel="dokumen" className="mt-2 w-full text-sm">
              <tbody>
                <BarisNilai label="Tunjangan Kinerja" nilai={tukin?.tukinBersih ?? 0} />
                <BarisNilai label="Uang Makan" nilai={uangMakan?.totalUangMakan ?? 0} />
                {TAMPILKAN_NOMINAL_LEMBUR && (
                  <BarisNilai label="Uang Lembur" nilai={uangLembur?.totalUangLembur ?? 0} />
                )}
                <BarisNilai label="Jumlah" nilai={totalPenghasilanSlip} tebal garisAtas />
              </tbody>
            </table>
          </>
        )}

        {/* --- TANDA TANGAN --- */}
        <div className="mt-8 flex justify-end">
          <div className="text-center text-sm">
            <p className="text-ink-2">Jakarta, {tanggalCetak}</p>
            <p className="font-bold text-ink">Petugas Pengelola Administrasi Belanja Pegawai</p>
            <div className="h-16" />
            {gaji?.diunggahOleh ? (
              <>
                <p className="font-bold text-ink underline">{gaji.diunggahOleh.nama}</p>
                <p className="font-mono text-xs text-ink-2">NIP. {gaji.diunggahOleh.nip}</p>
              </>
            ) : (
              <>
                <p className="text-ink-2">( ................................. )</p>
                <p className="text-xs text-ink-2">NIP.</p>
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted">
          Dicetak dari Gajihub. Belum ditandatangani secara elektronik - keabsahan dokumen mengikuti ketentuan yang
          berlaku di satuan kerja masing-masing.
        </p>
      </div>
    </main>
  );
}
