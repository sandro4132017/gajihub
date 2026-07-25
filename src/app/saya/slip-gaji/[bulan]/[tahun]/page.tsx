import Link from "next/link";
import { prisma } from "../../../../../lib/prisma";
import { getSessionAccount } from "../../../../../auth/getSessionAccount";
import { canCetakSlipGajiSendiri } from "../../../../../auth/permissions";
import { AksesDitolak } from "../../../../AksesDitolak";
import { NAMA_BULAN } from "../../../../bulan";
import { PrintButton } from "../../../PrintButton";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

function BarisRincian({ label, nilai, tebal }: { label: string; nilai: number; tebal?: boolean }) {
  return (
    <div className={`flex justify-between border-t border-line-2 py-1.5 text-sm ${tebal ? "font-bold text-ink" : "text-ink-2"}`}>
      <span>{label}</span>
      <span className="font-mono">{formatRupiah(nilai)}</span>
    </div>
  );
}

export default async function SlipGajiPage({
  params,
}: {
  params: Promise<{ bulan: string; tahun: string }>;
}) {
  const { bulan: bulanParam, tahun: tahunParam } = await params;
  const periodeBulan = Number(bulanParam);
  const periodeTahun = Number(tahunParam);

  // Guard: SEMUA role bisa cetak slip gaji sendiri (privilege Pegawai
  // otomatis dipunya semua role - lihat canCetakSlipGajiSendiri di
  // src/auth/permissions.ts dan "Simulasi role matrix lengkap" di CLAUDE.md).
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canCetakSlipGajiSendiri(authUser, authUser.nip) || !Number.isInteger(periodeBulan) || !Number.isInteger(periodeTahun)) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    include: {
      tukinCalc: { where: { periodeBulan, periodeTahun } },
      uangMakan: { where: { periodeBulan, periodeTahun } },
      uangLembur: { where: { periodeBulan, periodeTahun } },
    },
  });

  if (!pegawai) {
    return <AksesDitolak pesan={`Data pegawai untuk NIP ${authUser.nip} tidak ditemukan di sistem.`} />;
  }

  const tukin = pegawai.tukinCalc[0];
  const uangMakan = pegawai.uangMakan[0];
  const uangLembur = pegawai.uangLembur[0];

  if (!tukin && !uangMakan && !uangLembur) {
    return (
      <AksesDitolak
        pesan={`Belum ada data kalkulasi untuk periode ${NAMA_BULAN[periodeBulan - 1] ?? periodeBulan}/${periodeTahun}.`}
        hrefAlternatif="/saya"
        labelAlternatif="Kembali ke Data Saya"
      />
    );
  }

  const semuaApproved = [tukin, uangMakan, uangLembur].every((r) => !r || r.status === "APPROVED");
  const total = (tukin?.tukinBersih ?? 0) + (uangMakan?.totalUangMakan ?? 0) + (uangLembur?.totalUangLembur ?? 0);

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8 print:max-w-full print:px-0 print:py-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/saya" className="text-sm font-semibold text-teal-deep underline">
          &larr; Kembali ke Data Saya
        </Link>
        <PrintButton label="Cetak" />
      </div>

      <div className="card mt-4 p-6 print:border-0 print:p-0 print:shadow-none">
        <div className="rounded-lg bg-gold-tint px-3 py-2 text-xs font-semibold text-gold-deep print:border print:border-line">
          PLACEHOLDER - format slip gaji ini contoh sementara, BELUM format final.
        </div>

        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="text-lg font-extrabold tracking-tight text-ink">Slip Gaji</h1>
            <p className="text-sm text-muted">
              Periode {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan}/{periodeTahun}
            </p>
          </div>
          <span className={`chip ${semuaApproved ? "chip-ok" : "chip-wait"}`}>
            {semuaApproved ? "Final (disetujui)" : "Estimasi (belum final)"}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-muted">Nama</span>
          <span className="text-right font-semibold text-ink">{pegawai.nama}</span>
          <span className="text-muted">NIP</span>
          <span className="text-right font-mono text-ink">{pegawai.nip}</span>
          <span className="text-muted">Jabatan</span>
          <span className="text-right text-ink">{pegawai.jabatan ?? "-"}</span>
          <span className="text-muted">Golongan</span>
          <span className="text-right text-ink">{pegawai.golongan ?? "-"}</span>
          <span className="text-muted">Satuan kerja</span>
          <span className="text-right text-ink">{pegawai.satuanKerja}</span>
        </div>

        <div className="mt-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-teal-deep">Rincian</h2>
          {tukin && (
            <>
              <BarisRincian label="Tukin - komponen kinerja (70%)" nilai={tukin.komponenKinerja} />
              <BarisRincian label="Tukin - komponen kehadiran (30%)" nilai={tukin.komponenKehadiran} />
              {tukin.potonganPph > 0 && <BarisRincian label="Potongan PPh" nilai={-tukin.potonganPph} />}
              <BarisRincian label="Tukin bersih" nilai={tukin.tukinBersih} tebal />
            </>
          )}
          {uangMakan && <BarisRincian label="Uang Makan" nilai={uangMakan.totalUangMakan} tebal />}
          {uangLembur && <BarisRincian label="Uang Lembur" nilai={uangLembur.totalUangLembur} tebal />}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg bg-navy px-4 py-3 text-white">
          <span className="text-sm font-semibold opacity-90">Total</span>
          <span className="font-mono text-lg font-extrabold">{formatRupiah(total)}</span>
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Dokumen ini dihasilkan otomatis oleh Gajihub - bukan dokumen resmi sampai format final dikonfirmasi.
        </p>
      </div>
    </main>
  );
}
