import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewDataSendiri } from "../../auth/permissions";
import { AksesDitolak } from "../AksesDitolak";
import { SanggahanForm } from "./SanggahanForm";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

const formatTanggal = (tanggal: Date) =>
  new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(tanggal);

type KalkulasiRow = {
  id: string;
  periodeBulan: number;
  periodeTahun: number;
  status: string;
  nilai: number;
};

function KalkulasiSection({
  judul,
  rows,
  referensiTipe,
  sanggahanTerpakai,
}: {
  judul: string;
  rows: KalkulasiRow[];
  referensiTipe: "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";
  sanggahanTerpakai: Set<string>;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">{judul}</h2>
      {rows.length === 0 && <p className="mt-2 text-sm text-muted">Belum ada data.</p>}
      <div className="mt-2 space-y-3">
        {rows.map((row) => {
          const sudahDisanggah = sanggahanTerpakai.has(row.id);
          return (
            <div key={row.id} className="border-t border-line-2 pt-3 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink-2">
                  Periode {row.periodeBulan}/{row.periodeTahun}
                </span>
                <span className="font-mono font-bold text-ink">{formatRupiah(row.nilai)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted">
                Status: {row.status === "APPROVED" ? "Disetujui (histori pembayaran)" : `${row.status} (estimasi, belum final)`}
              </p>
              {sudahDisanggah && (
                <p className="mt-1 text-xs font-medium text-gold-deep">Sudah ada sanggahan yang diajukan untuk periode ini.</p>
              )}
              {!sudahDisanggah && row.status !== "APPROVED" && (
                <SanggahanForm referensiTipe={referensiTipe} referensiId={row.id} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default async function DataSayaPage() {
  // Guard: cuma PEGAWAI yang boleh masuk sini, dan cuma lihat data dirinya
  // sendiri (canViewDataSendiri sudah cek role + kecocokan NIP - lihat
  // src/auth/permissions.ts dan role matrix di CLAUDE.md).
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewDataSendiri(authUser, authUser.nip)) {
    return (
      <AksesDitolak
        pesan="Halaman ini cuma buat role Pegawai, buat lihat data diri sendiri."
        hrefAlternatif="/tukin"
        labelAlternatif="Ke dashboard approver"
      />
    );
  }

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    include: {
      presensi: { orderBy: { tanggal: "desc" }, take: 14 },
      predikatKinerja: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      tukinCalc: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      uangMakan: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      uangLembur: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      sanggahan: { orderBy: { createdAt: "desc" }, include: { buktiPendukung: true } },
    },
  });

  if (!pegawai) {
    return (
      <AksesDitolak pesan={`Data pegawai untuk NIP ${authUser.nip} tidak ditemukan di sistem.`} />
    );
  }

  const sanggahanTerpakai = new Set(pegawai.sanggahan.map((s) => s.referensiId));

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Data Saya</h1>
      <p className="mt-1 text-sm text-muted">
        {pegawai.nama} - NIP {pegawai.nip} - {pegawai.jabatan ?? "-"} - {pegawai.satuanKerja}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <section className="card p-4">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Presensi terbaru</h2>
          {pegawai.presensi.length === 0 && <p className="mt-2 text-sm text-muted">Belum ada data presensi.</p>}
          {pegawai.presensi.length > 0 && (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {pegawai.presensi.map((p) => (
                  <tr key={p.id} className="border-t border-line-2">
                    <td className="py-1.5 text-muted">{formatTanggal(p.tanggal)}</td>
                    <td className="py-1.5 text-right font-semibold text-ink">{p.statusKehadiran}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Predikat kinerja</h2>
          {pegawai.predikatKinerja.length === 0 && (
            <p className="mt-2 text-sm text-muted">Belum ada data predikat kinerja.</p>
          )}
          {pegawai.predikatKinerja.length > 0 && (
            <table className="mt-2 w-full text-sm">
              <tbody>
                {pegawai.predikatKinerja.map((pk) => (
                  <tr key={pk.id} className="border-t border-line-2">
                    <td className="py-1.5 text-muted">
                      {pk.periodeBulan}/{pk.periodeTahun}
                    </td>
                    <td className="py-1.5 text-right font-semibold text-ink">
                      {pk.predikat} ({pk.nilaiAngka}%)
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="mt-6 space-y-6">
        <KalkulasiSection
          judul="Tukin"
          rows={pegawai.tukinCalc.map((r) => ({ ...r, nilai: r.tukinBersih }))}
          referensiTipe="TUKIN"
          sanggahanTerpakai={sanggahanTerpakai}
        />
        <KalkulasiSection
          judul="Uang Makan"
          rows={pegawai.uangMakan.map((r) => ({ ...r, nilai: r.totalUangMakan }))}
          referensiTipe="UANG_MAKAN"
          sanggahanTerpakai={sanggahanTerpakai}
        />
        <KalkulasiSection
          judul="Uang Lembur"
          rows={pegawai.uangLembur.map((r) => ({ ...r, nilai: r.totalUangLembur }))}
          referensiTipe="UANG_LEMBUR"
          sanggahanTerpakai={sanggahanTerpakai}
        />

        <section className="card p-4">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Sanggahan saya</h2>
          {pegawai.sanggahan.length === 0 && (
            <p className="mt-2 text-sm text-muted">Belum pernah mengajukan sanggahan.</p>
          )}
          <div className="mt-2 space-y-3">
            {pegawai.sanggahan.map((s) => (
              <div key={s.id} className="border-t border-line-2 pt-3 first:border-t-0 first:pt-0 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-2">
                    {s.referensiTipe} - Periode {s.periodeBulan}/{s.periodeTahun}
                  </span>
                  <span className="chip chip-wait">{s.status}</span>
                </div>
                <p className="mt-1 text-xs text-muted">{s.alasan}</p>
                {/*
                  Upload bukti pendukung SENGAJA belum ada di sini - mekanisme
                  penyimpanan file (local disk vs object storage) masih
                  TODO(confirm), lihat komentar model BuktiPendukungUpload di
                  schema.prisma dan CLAUDE.md. Jangan bikin implementasi
                  storage sendiri tanpa konfirmasi kebijakan retensi dokumen.
                */}
                {s.buktiPendukung.length === 0 && (
                  <p className="mt-1 text-xs text-muted/70">
                    Upload bukti pendukung belum tersedia di sistem ini.
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
