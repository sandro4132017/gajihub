import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewDataSendiri } from "../../auth/permissions";
import { hitungTotalPenghasilanSlip } from "../../business-logic/gajiInduk";
import { AksesDitolak } from "../AksesDitolak";
import { RincianPotonganKehadiran } from "../RincianPotonganKehadiran";
import { RincianUangMakan } from "../RincianUangMakan";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../business-logic/tarifTukinPokok";
import { dikecualikanPotonganKehadiran } from "../../business-logic/pejabatPimpinanTinggi";
import { BadgePejabatEselon } from "../BadgePejabatEselon";
import { BandingForm } from "./BandingForm";

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
  bandingTerpakai,
}: {
  judul: string;
  rows: KalkulasiRow[];
  referensiTipe: "TUKIN" | "UANG_MAKAN" | "UANG_LEMBUR";
  bandingTerpakai: Set<string>;
}) {
  return (
    <section className="card p-4">
      <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">{judul}</h2>
      {rows.length === 0 && <p className="mt-2 text-sm text-muted">Belum ada data.</p>}
      <div className="mt-2 space-y-3">
        {rows.map((row) => {
          const sudahDibanding = bandingTerpakai.has(row.id);
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
              {sudahDibanding && (
                <p className="mt-1 text-xs font-medium text-gold-deep">Sudah ada banding yang diajukan untuk periode ini.</p>
              )}
              {!sudahDibanding && row.status !== "APPROVED" && (
                <BandingForm referensiTipe={referensiTipe} referensiId={row.id} />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StatTile({ label, nilai }: { label: string; nilai: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 font-mono text-lg font-extrabold text-ink">{formatRupiah(nilai)}</p>
    </div>
  );
}

const TAHAP_BANDING = [
  { key: "DIAJUKAN", label: "Diajukan" },
  { key: "MENUNGGU_APPROVAL_FINAL", label: "Verifikasi Kasubag TU" },
  { key: "DISETUJUI", label: "Approval final OSDMA" },
] as const;

function BandingStepper({ status }: { status: string }) {
  if (status === "DITOLAK") {
    return <span className="chip chip-danger">DITOLAK</span>;
  }
  const tahapAktif = TAHAP_BANDING.findIndex((t) => t.key === status);
  const sudahDisetujui = status === "DISETUJUI";
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {TAHAP_BANDING.map((t, i) => {
        const selesai = sudahDisetujui || tahapAktif > i;
        const aktif = !sudahDisetujui && i === tahapAktif;
        return (
          <div key={t.key} className="flex items-center gap-1.5">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                aktif ? "bg-gold text-white" : selesai ? "bg-green text-white" : "bg-line-2 text-muted"
              }`}
            >
              {t.label}
            </span>
            {i < TAHAP_BANDING.length - 1 && <span className="text-line">&rarr;</span>}
          </div>
        );
      })}
    </div>
  );
}

export default async function DataSayaPage() {
  // Guard: SEMUA role bisa masuk sini buat lihat data DIRI SENDIRI saja
  // (canViewDataSendiri cuma cek kecocokan NIP + akun aktif, role tidak
  // relevan lagi - role matrix simulasi: "PEGAWAI, semua role di bawah
  // otomatis punya privilege ini juga". Lihat src/auth/permissions.ts dan
  // "Simulasi role matrix lengkap" di CLAUDE.md). Praktis guard ini cuma
  // menolak kalau belum login sama sekali (akun null) - dibiarkan pakai
  // canViewDataSendiri (bukan cek `!!authUser` polos) supaya tetap satu
  // pintu otorisasi yang sama dengan aksi banding di bawah.
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewDataSendiri(authUser, authUser.nip)) {
    return <AksesDitolak pesan="Kamu harus login dulu buat lihat halaman ini." />;
  }

  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    include: {
      presensi: { orderBy: { tanggal: "desc" }, take: 14 },
      predikatKinerja: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      tukinCalc: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      uangMakan: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      uangLembur: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      banding: { orderBy: { createdAt: "desc" }, include: { buktiDukung: true } },
      buktiPotongPajak: { orderBy: { tahunPajak: "desc" } },
      gajiInduk: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      rekapPresensi: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
    },
  });

  if (!pegawai) {
    return (
      <AksesDitolak pesan={`Data pegawai untuk NIP ${authUser.nip} tidak ditemukan di sistem.`} />
    );
  }

  const bandingTerpakai = new Set(pegawai.banding.map((b) => b.referensiId));

  // Periode "berjalan" buat ringkasan pendapatan - diambil dari periode
  // Tukin paling baru yang ada datanya (fallback ke Uang Makan/Lembur kalau
  // Tukin kosong).
  const periodeTerbaru =
    pegawai.tukinCalc[0] ?? pegawai.uangMakan[0] ?? pegawai.uangLembur[0] ?? pegawai.gajiInduk[0] ?? null;
  const tukinTerbaru = periodeTerbaru
    ? pegawai.tukinCalc.find(
        (t) => t.periodeBulan === periodeTerbaru.periodeBulan && t.periodeTahun === periodeTerbaru.periodeTahun
      )
    : undefined;
  // Bahan tabel "kenapa tukin saya segini" untuk periode terbaru. Bobot
  // kehadiran penuh = 30% x tarif kelas jabatan (Pasal 5 ayat (2) huruf b).
  const rekapTerbaru = periodeTerbaru
    ? pegawai.rekapPresensi.find(
        (r) => r.periodeBulan === periodeTerbaru.periodeBulan && r.periodeTahun === periodeTerbaru.periodeTahun
      )
    : undefined;
  const tarifKelasSaya =
    pegawai.kelasJabatan === null ? null : (TUKIN_POKOK_PER_KELAS_JABATAN[pegawai.kelasJabatan] ?? null);
  const bobotKehadiranPenuhSaya = tarifKelasSaya === null ? null : tarifKelasSaya * 0.3;

  const umTerbaru = periodeTerbaru
    ? pegawai.uangMakan.find(
        (u) => u.periodeBulan === periodeTerbaru.periodeBulan && u.periodeTahun === periodeTerbaru.periodeTahun
      )
    : undefined;
  const lemburTerbaru = periodeTerbaru
    ? pegawai.uangLembur.find(
        (l) => l.periodeBulan === periodeTerbaru.periodeBulan && l.periodeTahun === periodeTerbaru.periodeTahun
      )
    : undefined;
  const gajiTerbaru = periodeTerbaru
    ? pegawai.gajiInduk.find(
        (g) => g.periodeBulan === periodeTerbaru.periodeBulan && g.periodeTahun === periodeTerbaru.periodeTahun
      )
    : undefined;
  // Pakai rumus yang SAMA dengan slip gaji supaya angka "Total" di sini tidak
  // berbeda dari "Total Penghasilan" di slip yang dicetak.
  const totalTerbaru = hitungTotalPenghasilanSlip({
    gajiBersih: gajiTerbaru?.gajiBersih ?? 0,
    tunjanganKinerja: tukinTerbaru?.tukinBersih ?? 0,
    uangMakan: umTerbaru?.totalUangMakan ?? 0,
    uangLembur: lemburTerbaru?.totalUangLembur ?? 0,
    honorarium: gajiTerbaru?.honorarium ?? 0,
  });

  // Daftar periode buat link "Slip Gaji" - union dari 4 domain (3 kalkulasi
  // Gajihub + gaji induk hasil upload PPABP), unik & diurutkan terbaru dulu.
  const periodeMap = new Map<string, { bulan: number; tahun: number }>();
  for (const r of [...pegawai.tukinCalc, ...pegawai.uangMakan, ...pegawai.uangLembur, ...pegawai.gajiInduk]) {
    const key = `${r.periodeTahun}-${r.periodeBulan}`;
    if (!periodeMap.has(key)) periodeMap.set(key, { bulan: r.periodeBulan, tahun: r.periodeTahun });
  }
  const daftarPeriode = [...periodeMap.values()].sort((a, b) => b.tahun - a.tahun || b.bulan - a.bulan);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Data Saya</h1>
      <p className="mt-1 text-sm text-muted">Ringkasan data kepegawaian, pendapatan, dan banding milik sendiri.</p>

      <section className="card mt-6 p-4">
        <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Profil</h2>
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex justify-between border-t border-line-2 py-1.5 sm:border-t-0 sm:py-1">
            <span className="text-muted">Nama</span>
            {/* Nama + badge dibungkus jadi SATU item flex - kalau badge jadi
                item ketiga, justify-between melemparnya ke ujung kanan,
                terpisah dari namanya. */}
            <div className="text-right font-semibold text-ink">
              {pegawai.nama}
              <BadgePejabatEselon kelasJabatan={pegawai.kelasJabatan} />
            </div>
          </div>
          <div className="flex justify-between border-t border-line-2 py-1.5 sm:border-t-0 sm:py-1">
            <span className="text-muted">NIP</span>
            <span className="font-mono text-ink">{pegawai.nip}</span>
          </div>
          <div className="flex justify-between border-t border-line-2 py-1.5 sm:py-1">
            <span className="text-muted">Jabatan</span>
            <span className="text-ink">{pegawai.jabatan ?? "-"}</span>
          </div>
          <div className="flex justify-between border-t border-line-2 py-1.5 sm:py-1">
            <span className="text-muted">Golongan</span>
            <span className="text-ink">{pegawai.golongan ?? "-"}</span>
          </div>
          <div className="flex justify-between border-t border-line-2 py-1.5 sm:py-1">
            <span className="text-muted">Satuan kerja</span>
            <span className="text-ink">{pegawai.satuanKerja}</span>
          </div>
          <div className="flex justify-between border-t border-line-2 py-1.5 sm:py-1">
            <span className="text-muted">Status kepegawaian</span>
            <span className="chip chip-ok">{pegawai.statusPegawai}</span>
          </div>
        </div>
      </section>

      {periodeTerbaru && (
        <section className="card mt-6 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">
              Ringkasan pendapatan - periode {periodeTerbaru.periodeBulan}/{periodeTerbaru.periodeTahun}
            </h2>
            <Link
              href={`/saya/slip-gaji/${periodeTerbaru.periodeBulan}/${periodeTerbaru.periodeTahun}`}
              className="text-xs font-semibold text-teal-deep underline"
            >
              Lihat slip gaji
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile label="Gaji bersih" nilai={gajiTerbaru?.gajiBersih ?? 0} />
            <StatTile label="Tukin" nilai={tukinTerbaru?.tukinBersih ?? 0} />
            <StatTile label="Uang Makan" nilai={umTerbaru?.totalUangMakan ?? 0} />
            <StatTile label="Uang Lembur" nilai={lemburTerbaru?.totalUangLembur ?? 0} />
            <StatTile label="Total" nilai={totalTerbaru} />
          </div>
          {!gajiTerbaru && (
            <p className="mt-2 text-xs text-muted">
              Gaji bersih masih kosong karena data gaji induk periode ini belum diunggah PPABP.
            </p>
          )}
          {gajiTerbaru && gajiTerbaru.honorarium > 0 && (
            <p className="mt-2 text-xs text-muted">Total sudah termasuk honorarium periode ini.</p>
          )}
        </section>
      )}

      {/* "Kenapa tukin saya segini" - rincian potongan Pasal 13 per jenis
          pelanggaran untuk periode terbaru. Pegawai bisa menjawab sendiri
          tanpa minta rekap ke Kasubag TU, dan angkanya datang dari fungsi
          yang SAMA dengan yang menghitung pembayarannya. */}
      {rekapTerbaru && (
        <RincianPotonganKehadiran
          rekap={rekapTerbaru}
          bobotKehadiranPenuh={bobotKehadiranPenuhSaya}
          nilaiTersimpan={tukinTerbaru?.komponenKehadiran ?? null}
          dikecualikan={dikecualikanPotonganKehadiran(pegawai.kelasJabatan)}
        />
      )}

      {/* "Kenapa uang makan saya segini" - rantai golongan -> tarif -> hari
          dibayar. Ditampilkan meski baris kalkulasinya belum ada, karena
          justru itu yang paling sering ditanyakan: hari hadir tidak sama
          dengan hari dibayar (diklat & dinas keluar tidak berhak). */}
      {rekapTerbaru && (
        <RincianUangMakan
          input={{ golongan: pegawai.golongan, ...rekapTerbaru }}
          nilaiTersimpan={umTerbaru?.totalUangMakan ?? null}
          hariDibayarTersimpan={umTerbaru?.jumlahHariDibayar ?? null}
        />
      )}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
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
          bandingTerpakai={bandingTerpakai}
        />
        <KalkulasiSection
          judul="Uang Makan"
          rows={pegawai.uangMakan.map((r) => ({ ...r, nilai: r.totalUangMakan }))}
          referensiTipe="UANG_MAKAN"
          bandingTerpakai={bandingTerpakai}
        />
        <KalkulasiSection
          judul="Uang Lembur"
          rows={pegawai.uangLembur.map((r) => ({ ...r, nilai: r.totalUangLembur }))}
          referensiTipe="UANG_LEMBUR"
          bandingTerpakai={bandingTerpakai}
        />

        <section className="card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Slip gaji</h2>
            <span className="text-xs font-medium text-muted">Perincian Pembayaran Gaji</span>
          </div>
          {daftarPeriode.length === 0 && <p className="mt-2 text-sm text-muted">Belum ada periode yang bisa dicetak.</p>}
          <div className="mt-2 space-y-2">
            {daftarPeriode.map((p) => (
              <div key={`${p.tahun}-${p.bulan}`} className="flex items-center justify-between border-t border-line-2 pt-2 text-sm first:border-t-0 first:pt-0">
                <span className="text-ink-2">
                  Periode {p.bulan}/{p.tahun}
                </span>
                <Link href={`/saya/slip-gaji/${p.bulan}/${p.tahun}`} className="text-xs font-semibold text-teal-deep underline">
                  Lihat / cetak
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Bukti potong pajak</h2>
          <p className="mt-1 text-xs text-muted">
            Hasil upload manual Kasubag TU/PPABP dari Web Gaji - kamu cuma bisa lihat/download di sini, bukan upload sendiri.
          </p>
          {pegawai.buktiPotongPajak.length === 0 && (
            <p className="mt-2 text-sm text-muted">Belum ada bukti potong pajak yang diunggah untuk kamu.</p>
          )}
          <div className="mt-2 space-y-2">
            {pegawai.buktiPotongPajak.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-t border-line-2 pt-2 text-sm first:border-t-0 first:pt-0">
                <div>
                  <span className="text-ink-2">Tahun pajak {b.tahunPajak}</span>
                  {b.nomorBuktiPotong && <span className="ml-2 font-mono text-xs text-muted">{b.nomorBuktiPotong}</span>}
                </div>
                <a href={b.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-teal-deep underline">
                  Download
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="card p-4">
          <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Banding saya</h2>
          {pegawai.banding.length === 0 && (
            <p className="mt-2 text-sm text-muted">Belum pernah mengajukan banding.</p>
          )}
          <div className="mt-2 space-y-3">
            {pegawai.banding.map((b) => (
              <div key={b.id} className="border-t border-line-2 pt-3 first:border-t-0 first:pt-0 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-2">
                    {b.referensiTipe} - Periode {b.periodeBulan}/{b.periodeTahun}
                  </span>
                </div>
                <BandingStepper status={b.status} />
                <p className="mt-2 text-xs text-muted">{b.alasan}</p>
                {/*
                  Upload bukti dukung SENGAJA belum ada di sini - mekanisme
                  penyimpanan file (local disk vs object storage) masih
                  TODO(confirm), lihat komentar model BuktiDukung di
                  schema.prisma dan CLAUDE.md. Jangan bikin implementasi
                  storage sendiri tanpa konfirmasi kebijakan retensi dokumen.
                */}
                {b.buktiDukung.length === 0 && (
                  <p className="mt-1 text-xs text-muted/70">
                    Upload bukti dukung belum tersedia di sistem ini.
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
