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
import { NAMA_BULAN } from "../bulan";
import { SearchableSelect } from "../SearchableSelect";
import { labelStatus } from "../presensiTampilan";
import {
  DASAR_PENGENAAN_TER,
  hitungPtkp,
  tanggalAcuanPtkp,
  tarifFinalHonorarium,
} from "../../business-logic/ptkp";
import { TAB_SAYA, resolveTabSaya } from "./tabs";
import { kunciPeriode, pilihPeriode, type PeriodeSaya } from "./periodeSaya";
import { TAMPILKAN_NOMINAL_LEMBUR } from "../tampilUangLembur";
import { HALAMAN } from "../layoutHalaman";

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

/**
 * Satu butir keterangan bergaya dua baris (label kecil di atas, isi di bawah) -
 * pola yang sama dipakai di seluruh tab Profil.
 *
 * Sengaja BUKAN baris "label ... titik dua ... isi" yang lama: nilai yang
 * panjang (nama unit kerja Eselon II bisa 60 karakter) mendorong labelnya
 * keluar layar di HP, dan yang pertama hilang justru labelnya.
 */
/**
 * Satu butir data berlabel.
 *
 * `keterangan` muncul sebagai tooltip pada labelnya, ditandai garis putus-
 * putus supaya kelihatan bisa ditunjuk. Dipakai untuk batasan yang HARUS ada
 * tapi tidak layak memakan satu paragraf di halaman - kalau tiap batasan
 * dicetak penuh, yang dibaca orang justru catatannya, bukan angkanya.
 */
function Butir({
  label,
  keterangan,
  children,
}: {
  label: string;
  keterangan?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt
        className={`text-[11px] font-semibold uppercase tracking-wide text-muted${
          keterangan ? " cursor-help underline decoration-dotted underline-offset-2" : ""
        }`}
        title={keterangan}
      >
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-semibold text-ink">{children}</dd>
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

export default async function DataSayaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; periode?: string }>;
}) {
  const { tab, periode } = await searchParams;
  const tabAktif = resolveTabSaya(tab);

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

  // SATU query untuk semua tab, bukan satu query per tab.
  //
  // Terlihat boros - tab Profil ikut menarik riwayat Tukin yang tidak
  // ditampilkannya - tapi seluruh relasi di sini terikat pada SATU pegawai:
  // riwayat 3 tahun pun cuma puluhan baris per relasi, bukan ribuan. Memecahnya
  // per tab berarti enam bentuk hasil query yang berbeda, dan tipe Prisma-nya
  // ikut bercabang enam. Kalau suatu saat halaman ini terasa lambat, DI SINI
  // levernya.
  //
  // Presensi HARIAN sengaja TIDAK ikut di sini: jumlahnya ~250 baris setahun
  // dan tab Kehadiran cuma butuh rekap per periode. Rinciannya punya halaman
  // sendiri (/saya/presensi/[bulan]/[tahun]) yang menariknya satu periode saja.
  const pegawai = await prisma.pegawai.findUnique({
    where: { nip: authUser.nip },
    include: {
      predikatKinerja: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      tukinCalc: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      uangMakan: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      uangLembur: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      banding: { orderBy: { createdAt: "desc" }, include: { buktiDukung: true } },
      buktiPotongPajak: { orderBy: { tahunPajak: "desc" } },
      gajiInduk: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      rekapPresensi: { orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }] },
      rekening: { orderBy: { jenisPembayaran: "asc" } },
      skKgb: { orderBy: { tanggalSk: "desc" } },
      skHukumanDisiplin: { orderBy: { tanggalSk: "desc" } },
    },
  });

  if (!pegawai) {
    return (
      <AksesDitolak pesan={`Data pegawai untuk NIP ${authUser.nip} tidak ditemukan di sistem.`} />
    );
  }

  const bandingTerpakai = new Set(pegawai.banding.map((b) => b.referensiId));

  // DUGAAN status PTKP dari data kepegawaian SIAP - bukan status resmi DJP.
  // Ditampilkan justru supaya pegawainya sendiri bisa mengoreksi: dialah
  // satu-satunya yang tahu anaknya sudah bekerja atau belum, dan apakah
  // punya surat keterangan suami tidak berpenghasilan. Aturannya di
  // src/business-logic/ptkp.ts, lengkap dengan yang belum bisa diketahui.
  const ptkp = hitungPtkp({
    statusKawin: pegawai.statusKawin,
    jenisKelamin: pegawai.jenisKelamin,
    jumlahTanggungan: pegawai.jumlahAnakTanggungan,
  });
  // Tarif final honorarium = rezim yang BERBEDA dari TER. Lihat catatan
  // panjang di ptkp.ts - keduanya sama-sama PPh Pasal 21 tapi mengenai
  // penghasilan yang berlainan, dan menyandingkannya tanpa penjelasan
  // membuat pegawai mengira tunjangan kinerjanya dipotong final.
  const finalHonor = tarifFinalHonorarium(pegawai.golongan);
  // PTKP ditetapkan menurut keadaan AWAL TAHUN KALENDER, bukan hari ini.
  const acuanPtkp = tanggalAcuanPtkp(new Date().getFullYear());

  // Periode yang bisa dipilih di tab Kehadiran = periode yang rekapnya ADA.
  // Bukan 12 bulan terakhir: menawarkan bulan yang belum ditarik unitnya
  // berarti menawarkan halaman kosong, dan kosong di sini terbaca "presensi
  // saya hilang". rekapPresensi sudah diurutkan terbaru dulu oleh query.
  const periodeKehadiranTersedia: PeriodeSaya[] = pegawai.rekapPresensi.map((r) => ({
    bulan: r.periodeBulan,
    tahun: r.periodeTahun,
  }));
  const periodeKehadiran = pilihPeriode(periode, periodeKehadiranTersedia);
  const rekapKehadiran = periodeKehadiran
    ? pegawai.rekapPresensi.find(
        (r) => r.periodeBulan === periodeKehadiran.bulan && r.periodeTahun === periodeKehadiran.tahun
      )
    : undefined;
  // Nilai komponen kehadiran yang TERSIMPAN untuk periode yang sama - dipakai
  // RincianPotonganKehadiran buat mengadu hasil hitungnya dengan yang dibayar.
  const tukinKehadiran = periodeKehadiran
    ? pegawai.tukinCalc.find(
        (t) => t.periodeBulan === periodeKehadiran.bulan && t.periodeTahun === periodeKehadiran.tahun
      )
    : undefined;

  // Sebaran status hari DITURUNKAN dari baris harian, bukan dibaca dari
  // RekapPresensiPeriode - dan itu bukan pilihan gaya.
  //
  // Rekap periode TIDAK PUNYA kolom untuk izin & sakit. rekapDariLaporanPdf()
  // menghitung keduanya (hitung.izin, hitung.sakit di presensiPdfKeRekap.ts)
  // tapi simpanRekapPresensi.ts tidak menyimpannya ke mana pun, jadi keduanya
  // hilang begitu rekapnya ditulis. Selama sumbernya rekap, hari sakit &
  // izin TIDAK PERNAH bisa muncul di sini berapa pun kolom yang ditambahkan
  // ke tampilan.
  //
  // Menurunkannya dari baris harian juga menutup masalah kedua: status baru
  // yang suatu saat dikirim e-Presensi ikut muncul sendiri, tanpa ada yang
  // perlu ingat menambah kolomnya. Dan angkanya dijamin sama dengan tabel di
  // /saya/presensi/[bulan]/[tahun] karena barisnya memang itu-itu juga.
  //
  // Dijalankan HANYA waktu tab Kehadiran dibuka - tab lain tidak menanggungnya.
  const sebaranStatus =
    tabAktif === "kehadiran" && periodeKehadiran
      ? await prisma.presensiHarian.groupBy({
          by: ["statusKehadiran"],
          where: {
            pegawaiId: pegawai.id,
            tanggal: {
              gte: new Date(Date.UTC(periodeKehadiran.tahun, periodeKehadiran.bulan - 1, 1)),
              lt: new Date(Date.UTC(periodeKehadiran.tahun, periodeKehadiran.bulan, 1)),
            },
          },
          _count: { _all: true },
        })
      : [];
  // Diurutkan di memori, bukan lewat orderBy groupBy: jumlahnya paling banyak
  // belasan baris, dan urutan "terbanyak dulu" jadi jelas terbaca di kode.
  const sebaranTerurut = [...sebaranStatus].sort((a, b) => b._count._all - a._count._all);

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
    // Uang lembur belum ikut selama angkanya belum disetujui - lihat
    // src/app/tampilUangLembur.ts. Slip gaji diperlakukan sama persis,
    // supaya Total di sini dan Total Penghasilan di slip tetap sepadan.
    uangLembur: TAMPILKAN_NOMINAL_LEMBUR ? lemburTerbaru?.totalUangLembur ?? 0 : 0,
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

  // Jumlah yang ditempel di tab - supaya orang tahu ada isinya tanpa membuka
  // satu per satu. HANYA untuk tab yang jumlahnya bermakna: "Profil 6" tidak
  // berarti apa-apa, sementara "Banding 2" berarti ada dua yang berjalan.
  const jumlahPerTab: Partial<Record<(typeof TAB_SAYA)[number]["key"], number>> = {
    dokumen: daftarPeriode.length + pegawai.buktiPotongPajak.length + pegawai.skKgb.length + pegawai.skHukumanDisiplin.length,
    banding: pegawai.banding.length,
  };

  return (
    <main className={HALAMAN}>
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Data Saya</h1>
      <p className="mt-1 text-sm text-muted">Ringkasan data kepegawaian, pendapatan, dan banding milik sendiri.</p>

      {/* ====================================================================
          KEPALA IDENTITAS - tetap terlihat di SEMUA tab.
          Tanpa ini, orang yang berpindah ke tab Pendapatan kehilangan konteks
          "ini punya siapa" - dan di halaman yang isinya angka gaji, keraguan
          itu tidak boleh ada sedetik pun.
          ==================================================================== */}
      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-ink">
              {pegawai.nama}
              <BadgePejabatEselon kelasJabatan={pegawai.kelasJabatan} />
            </h2>
            <p className="mt-0.5 text-sm text-muted">
              {pegawai.jabatan ?? "Jabatan belum terisi"}
              <span className="mx-1.5 text-line">&bull;</span>
              {pegawai.unitKerja}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="chip chip-navy font-mono">{pegawai.nip}</span>
            <span className="chip chip-ok">{pegawai.statusPegawai}</span>
          </div>
        </div>
      </section>

      {/* ====================================================================
          TAB - <Link> biasa dengan ?tab=, bukan state React. Lihat tabs.ts.
          ==================================================================== */}
      <nav className="mt-5 flex flex-wrap items-end gap-1 border-b border-line" aria-label="Bagian data saya">
        {TAB_SAYA.map((t) => {
          const aktif = t.key === tabAktif;
          const jumlah = jumlahPerTab[t.key];
          return (
            <Link
              key={t.key}
              href={`/saya?tab=${t.key}`}
              aria-current={aktif ? "page" : undefined}
              className={`-mb-px flex items-center gap-1.5 rounded-t-lg border-b-2 px-3.5 py-2.5 text-[13px] font-bold transition ${
                aktif
                  ? "border-navy bg-surface text-navy"
                  : "border-transparent text-muted hover:border-line hover:text-ink"
              }`}
            >
              {t.label}
              {jumlah !== undefined && jumlah > 0 && (
                <span
                  className={`rounded-full px-1.5 text-[10px] font-bold ${
                    aktif ? "bg-teal-tint text-navy" : "bg-line-2 text-muted"
                  }`}
                >
                  {jumlah}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ==================================================================
          TAB: PROFIL
          ================================================================== */}
      {tabAktif === "profil" && (
        <div className="mt-6 space-y-6">
          <section className="card p-5">
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Data kepegawaian</h2>
            <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <Butir label="Nama">{pegawai.nama}</Butir>
              <Butir label="NIP">
                <span className="font-mono">{pegawai.nip}</span>
              </Butir>
              <Butir label="Status kepegawaian">{pegawai.statusPegawai}</Butir>
              <Butir label="Jabatan">{pegawai.jabatan ?? "-"}</Butir>
              <Butir label="Golongan">{pegawai.golongan ?? "-"}</Butir>
              <Butir label="Kelas jabatan">{pegawai.kelasJabatan ?? "-"}</Butir>
              <Butir label="Unit kerja">{pegawai.unitKerja}</Butir>
              <Butir label="Satuan kerja">{pegawai.satuanKerja}</Butir>
              <Butir label="TMT SK terakhir">
                {pegawai.tmtSkTerakhir ? formatTanggal(pegawai.tmtSkTerakhir) : "-"}
              </Butir>
            </dl>

            {/* Tidak ada tombol ubah DI MANA PUN di tab ini, dan itu disengaja.
                SIAP adalah sumber kebenaran kepegawaian; Gajihub cuma cerminnya
                (lihat importPegawaiSiap.ts). Menyediakan tombol ubah di sini
                berarti membuat dua versi kebenaran yang akan berbeda dalam
                hitungan minggu - dan yang dipakai membayar adalah yang salah. */}
            <p className="mt-5 border-t border-line-2 pt-3 text-xs text-muted">
              Data di atas cerminan dari SIAP, disinkronkan {formatTanggal(pegawai.sourceSyncedAt)}. Perbaikan
              dilakukan di {pegawai.sourceSystem}, bukan di sini - kalau ada yang keliru, hubungi Kasubag TU unit
              kamu.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Rekening pembayaran</h2>
            <p className="mt-1 text-xs text-muted">
              Rekening tujuan transfer per jenis pembayaran, hasil unggahan PPABP.
            </p>
            {pegawai.rekening.length === 0 && (
              <p className="mt-3 text-sm text-muted">Belum ada rekening yang terdaftar untuk kamu.</p>
            )}
            <div className="mt-3 space-y-3">
              {pegawai.rekening.map((r) => (
                <div key={r.id} className="rounded-xl border border-line-2 bg-surface-2 p-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="chip chip-navy">{r.jenisPembayaran}</span>
                    <span className="text-xs text-muted">{r.namaBank}</span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                    {/* Nomornya ditampilkan UTUH, tidak disamarkan. Justru
                        memeriksa digitnya yang jadi gunanya halaman ini -
                        nomor yang keliru baru ketahuan waktu gaji tidak masuk,
                        dan saat itu sudah terlambat satu periode. Ini rekening
                        miliknya sendiri, bukan milik orang lain. */}
                    <Butir label="Nomor rekening">
                      <span className="font-mono">{r.nomorRekening}</span>
                    </Butir>
                    <Butir label="Nama rekening">{r.namaRekening ?? "-"}</Butir>
                  </dl>
                </div>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Status PTKP (PPh Pasal 21)</h2>
              <span className="chip chip-wait">Berdasarkan Data SIAP</span>
            </div>
            {/* TANGGALNYA TETAP DISEBUT walau kalimatnya dipendekkan
                (permintaan user 2026-09-06): PTKP ditetapkan menurut keadaan
                AWAL TAHUN, bukan hari ini. Tanpa tanggal itu, pegawai yang
                menikah di tengah tahun akan mengira sistemnya salah baca -
                padahal justru begitu aturannya (PMK 168/2023).
                "Bukan status resmi, yang berlaku yang terdaftar di DJP" sudah
                diwakili chip "Dugaan sistem" di sebelah judul. */}
            <p className="mt-1 text-xs text-muted">
              Status per <strong className="text-ink-2">{formatTanggal(acuanPtkp)}</strong>, dari data SIAP.
            </p>

            {!ptkp && (
              <p className="mt-4 text-sm text-muted">
                Belum bisa ditentukan karena status kawin kamu belum terisi di SIAP. Perbaikannya lewat Kasubag TU
                unit kamu, bukan di sini.
              </p>
            )}

            {ptkp && (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  <Butir label="Kode PTKP">
                    <span className="font-mono text-base">{ptkp.kode}</span>
                  </Butir>
                  <Butir label="Kategori TER">{ptkp.kategoriTer}</Butir>
                  <Butir label="PTKP setahun">{formatRupiah(ptkp.ptkpSetahun)}</Butir>
                  <Butir
                    label="Tanggungan dihitung"
                    keterangan="Hanya anak. Tanggungan lain (orang tua, mertua, anak tiri, anak angkat) belum ikut, dan anak tanpa catatan pekerjaan dianggap tanggungan. Kalau tidak sesuai, sampaikan ke Kasubag TU unit kamu."
                  >
                    {ptkp.tanggunganDipakai}
                  </Butir>
                </dl>

                {/* Catatan dari mesin aturannya, bukan teks tetap - yang muncul
                    persis alasan yang berlaku untuk orang ini. */}
                {ptkp.catatan.length > 0 && (
                  <ul className="mt-4 space-y-1.5 rounded-xl border border-gold bg-gold/10 p-3.5">
                    {ptkp.catatan.map((c, i) => (
                      <li key={i} className="text-[11px] leading-relaxed text-ink-2">
                        {c}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}

            {/* ------------------------------------------------------------
                DASAR PENGENAAN - menjawab "tunjangan saya yang mana yang kena
                pajak". Daftarnya dari contoh kasus resmi DJP, bukan tafsiran.
                ------------------------------------------------------------ */}
            <div className="mt-5 border-t border-line-2 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Penghasilan yang menjadi dasar pengenaan
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {DASAR_PENGENAAN_TER.map((d) => (
                  <li key={d} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink-2">
                    {d}
                  </li>
                ))}
              </ul>
              {/* Dua keterangan dicabut dari layar atas permintaan user
                  2026-09-06, dan keduanya TETAP BERLAKU:
                  1. Untuk ASN yang penghasilannya dibebankan APBN, PPh Pasal
                     21 atas komponen di atas DITANGGUNG PEMERINTAH - tidak
                     mengurangi yang diterima pegawai.
                  2. TODO(confirm) uang makan & uang lembur belum masuk daftar
                     ini; perlakuan pajaknya menunggu penegasan Bagian
                     Keuangan. */}
            </div>

            {/* ------------------------------------------------------------
                REZIM KEDUA - honorarium, tarif FINAL menurut golongan.
                Dipisahkan dengan kotak sendiri dan diberi judul yang tegas
                supaya tidak terbaca sebagai tarif atas tunjangan kinerja.
                ------------------------------------------------------------ */}
            <div className="mt-5 border-t border-line-2 pt-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Honorarium APBN/APBD - dipotong final
              </p>
              {finalHonor ? (
                <>
                  <p className="mt-2 text-sm text-ink">
                    Golongan <strong>{pegawai.golongan}</strong> dikenai tarif{" "}
                    <strong className="font-mono">{(finalHonor.tarif * 100).toFixed(0)}%</strong> dan bersifat{" "}
                    <strong>final</strong>.
                  </p>
                  <p className="mt-1 text-[11px] text-muted">
                    Berlaku HANYA atas honorarium atau imbalan lain yang dibebankan APBN/APBD - bukan atas gaji
                    maupun tunjangan kinerja. Final berarti selesai di situ dan tidak digabung lagi di SPT Tahunan.
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted">
                  Belum bisa ditentukan untuk golongan{" "}
                  <strong className="text-ink-2">{pegawai.golongan ?? "(belum terisi)"}</strong>. Tabel tarif final
                  hanya menyebut PNS Golongan I sampai IV; golongan PPPK tidak tercantum, dan sistem ini tidak
                  menebaknya.
                </p>
              )}
            </div>

            {/* ------------------------------------------------------------
                ASAL & UMUR DATA - siapa pun yang membantah angka di atas akan
                menanyakan ini lebih dulu: datanya dari mana dan kapan diambil.
                ------------------------------------------------------------ */}
            <div className="mt-5 border-t border-line-2 pt-4">
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-3">
                <Butir label="Sumber data">{pegawai.sourceSystem}</Butir>
                <Butir label="Terakhir disinkronkan">{formatTanggal(pegawai.sourceSyncedAt)}</Butir>
                <Butir label="Status kawin tercatat">{pegawai.statusKawin ?? "(kosong)"}</Butir>
              </dl>
              <p className="mt-2 text-[11px] text-muted">
                Perubahan data keluarga dicatat di SIAP, lalu masuk ke sini pada sinkronisasi berikutnya. Kalau
                sudah diperbarui di SIAP tetapi tanggal di atas masih lama, artinya sinkronisasi belum dijalankan.
              </p>
            </div>

          </section>
        </div>
      )}

      {/* ==================================================================
          TAB: KEHADIRAN
          ================================================================== */}
      {tabAktif === "kehadiran" && (
        <div className="mt-6 space-y-6">
          {/* Pemilih periode. <form method="get">, bukan state React - sama
              dengan seluruh filter di aplikasi ini, jadi tetap jalan tanpa
              JavaScript dan tiap periode punya URL sendiri.

              Isinya HANYA periode yang rekapnya benar-benar ada. Dropdown
              12 bulan yang sebagian menghasilkan halaman kosong lebih buruk
              daripada dropdown pendek yang semuanya berisi. */}
          {periodeKehadiran && (
            <form method="get" className="flex flex-wrap items-center gap-2 [&_input]:mt-0">
              <input type="hidden" name="tab" value="kehadiran" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Periode</span>
              <SearchableSelect
                name="periode"
                className="w-52"
                options={periodeKehadiranTersedia.map((p) => ({
                  value: kunciPeriode(p),
                  label: `${NAMA_BULAN[p.bulan - 1]} ${p.tahun}`,
                }))}
                defaultValue={kunciPeriode(periodeKehadiran)}
              />
              <button type="submit" className="btn btn-primary">
                Tampilkan
              </button>
              <Link
                href={`/saya/presensi/${periodeKehadiran.bulan}/${periodeKehadiran.tahun}`}
                className="btn btn-ghost inline-flex items-center gap-1.5"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Presensi lengkap
              </Link>
            </form>
          )}

          {rekapKehadiran && (
            <section className="card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Rekap kehadiran</h2>
                <span className="text-xs font-medium text-muted">
                  {NAMA_BULAN[rekapKehadiran.periodeBulan - 1]} {rekapKehadiran.periodeTahun}
                </span>
              </div>
              {/* Dua angka INI yang dipakai menghitung, jadi dibaca dari rekap
                  yang tersimpan - bukan dihitung ulang di layar. */}
              <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                <Butir label="Hari kerja">{rekapKehadiran.jumlahHariKerja}</Butir>
                <Butir label="Hari hadir">{rekapKehadiran.jumlahHariHadir}</Butir>
              </dl>

              {/* Sisi pelanggarannya (terlambat, alpha, tidak presensi) TIDAK
                  diulang di sini - itu tugas panel rincian potongan di bawah,
                  yang menampilkannya lengkap dengan perhitungan Pasal 13-nya.
                  Mengulanginya di dua tempat berarti dua angka yang bisa beda. */}
              {sebaranTerurut.length > 0 && (
                <div className="mt-5 border-t border-line-2 pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Sebaran status hari</p>
                  <ul className="mt-2.5 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                    {sebaranTerurut.map((sb) => (
                      <li
                        key={sb.statusKehadiran}
                        className="flex items-baseline justify-between gap-3 border-b border-line-2 py-1 text-sm last:border-b-0"
                      >
                        <span className="text-ink-2">{labelStatus(sb.statusKehadiran)}</span>
                        <span className="font-mono font-bold text-ink">{sb._count._all} hari</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Periode yang rekapnya diisi lewat template Excel tidak punya
                  baris harian sama sekali, jadi sebarannya kosong. Dikatakan apa
                  adanya - daftar kosong tanpa keterangan terbaca sebagai "saya
                  tidak pernah cuti/sakit", padahal artinya "tidak tercatat". */}
              {sebaranTerurut.length === 0 && (
                <div className="mt-5 border-t border-line-2 pt-4">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                    <Butir label="WFO">{rekapKehadiran.jumlahHariWfo}</Butir>
                    <Butir label="WFH / WFA">{rekapKehadiran.jumlahHariWfhWfa}</Butir>
                    <Butir label="Diklat">{rekapKehadiran.jumlahHariDiklat}</Butir>
                    <Butir label="Dinas luar">{rekapKehadiran.jumlahHariDinasLuar}</Butir>
                    <Butir label="Tugas belajar">{rekapKehadiran.jumlahHariTugasBelajar}</Butir>
                    <Butir label="Cuti">{rekapKehadiran.jumlahHariCuti}</Butir>
                  </dl>
                  <p className="mt-3 text-xs text-muted">
                    Periode ini tidak punya rincian harian - rekapnya diisi lewat template Excel, bukan tarikan
                    e-Presensi. Hari izin &amp; sakit tidak tersimpan di rekap, jadi tidak bisa ditampilkan untuk
                    periode ini.
                  </p>
                </div>
              )}

              <p className="mt-4 border-t border-line-2 pt-3 text-xs text-muted">
                Hari hadir tidak sama dengan hari yang dibayar uang makan - diklat dan dinas luar tetap bekerja
                tapi konsumsinya sudah ditanggung kegiatannya. Rinciannya di tab Pendapatan.
              </p>
            </section>
          )}

          {/* "Kenapa tukin saya segini" - rincian potongan Pasal 13 per jenis
              pelanggaran untuk periode yang SEDANG DIPILIH, bukan selalu yang
              terbaru. Pegawai bisa menjawab sendiri tanpa minta rekap ke
              Kasubag TU, dan angkanya datang dari fungsi yang SAMA dengan yang
              menghitung pembayarannya. */}
          {rekapKehadiran && (
            <RincianPotonganKehadiran
              rekap={rekapKehadiran}
              bobotKehadiranPenuh={bobotKehadiranPenuhSaya}
              nilaiTersimpan={tukinKehadiran?.komponenKehadiran ?? null}
              dikecualikan={dikecualikanPotonganKehadiran(pegawai.kelasJabatan)}
            />
          )}

          {!periodeKehadiran && (
            <section className="card p-4">
              <p className="text-sm text-muted">
                Belum ada rekap presensi untuk kamu. Rekap dibuat waktu unit kamu menarik presensi periode berjalan
                dari e-Presensi - kalau periode ini sudah lewat tapi belum muncul, tanyakan ke Kasubag TU unit kamu.
              </p>
            </section>
          )}

          {periodeKehadiran && (
            <p className="text-xs text-muted">
              Kehadiran ditarik dari e-Presensi apa adanya - Gajihub tidak pernah mengubahnya. Kalau ada yang tidak
              sesuai, ajukan lewat tab Banding.
            </p>
          )}
        </div>
      )}

      {/* ==================================================================
          TAB: KINERJA
          ================================================================== */}
      {tabAktif === "kinerja" && (
        <div className="mt-6 space-y-6">
          <section className="card p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Predikat kinerja</h2>
              <span className="text-xs font-medium text-muted">Sumber: e-Kinerja BKN</span>
            </div>
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
                      <td className="py-1.5 font-semibold text-ink">
                        {pk.predikat} ({pk.nilaiAngka}%)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 border-t border-line-2 pt-3 text-xs text-muted">
              Predikat kinerja menentukan komponen 70% Tunjangan Kinerja (Pasal 5). Perubahannya dilakukan di
              e-Kinerja BKN, lalu diunggah ulang oleh unit kamu.
            </p>
          </section>
        </div>
      )}

      {/* ==================================================================
          TAB: PENDAPATAN
          ================================================================== */}
      {tabAktif === "pendapatan" && (
        <div className="mt-6 space-y-6">
          {periodeTerbaru && (
            <section className="card p-4">
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
              <div
                className={`mt-3 grid grid-cols-2 gap-3 ${
                  TAMPILKAN_NOMINAL_LEMBUR ? "sm:grid-cols-5" : "sm:grid-cols-4"
                }`}
              >
                <StatTile label="Gaji bersih" nilai={gajiTerbaru?.gajiBersih ?? 0} />
                <StatTile label="Tukin" nilai={tukinTerbaru?.tukinBersih ?? 0} />
                <StatTile label="Uang Makan" nilai={umTerbaru?.totalUangMakan ?? 0} />
                {TAMPILKAN_NOMINAL_LEMBUR && (
                  <StatTile label="Uang Lembur" nilai={lemburTerbaru?.totalUangLembur ?? 0} />
                )}
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

          {!periodeTerbaru && (
            <p className="text-sm text-muted">Belum ada periode pendapatan yang tercatat untuk kamu.</p>
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
          {TAMPILKAN_NOMINAL_LEMBUR && (
            <KalkulasiSection
              judul="Uang Lembur"
              rows={pegawai.uangLembur.map((r) => ({ ...r, nilai: r.totalUangLembur }))}
              referensiTipe="UANG_LEMBUR"
              bandingTerpakai={bandingTerpakai}
            />
          )}
        </div>
      )}

      {/* ==================================================================
          TAB: DOKUMEN
          ================================================================== */}
      {tabAktif === "dokumen" && (
        <div className="mt-6 space-y-6">
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
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">SK Kenaikan Gaji Berkala</h2>
            {pegawai.skKgb.length === 0 && <p className="mt-2 text-sm text-muted">Belum ada SK KGB yang tercatat.</p>}
            <div className="mt-2 space-y-2">
              {pegawai.skKgb.map((sk) => (
                <div key={sk.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-2 pt-2 text-sm first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="font-mono text-xs text-ink-2">{sk.nomorSk}</p>
                    <p className="text-xs text-muted">
                      {sk.golonganLama} &rarr; {sk.golonganBaru} &bull; TMT {formatTanggal(sk.tmtKgb)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="chip chip-draft">{sk.status}</span>
                    {sk.fileUrl && (
                      <a href={sk.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-teal-deep underline">
                        Download
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Ditampilkan ke pegawainya sendiri dengan sengaja: hukuman disiplin
              MENURUNKAN tukin (Pasal 14), dan orang berhak tahu dasar angka
              yang dibayarkan kepadanya. Menyembunyikannya cuma memindahkan
              pertanyaan "kenapa tukin saya turun" ke meja Kasubag TU. */}
          <section className="card p-4">
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">SK Hukuman Disiplin</h2>
            {pegawai.skHukumanDisiplin.length === 0 && (
              <p className="mt-2 text-sm text-muted">Tidak ada hukuman disiplin yang tercatat.</p>
            )}
            <div className="mt-2 space-y-2">
              {pegawai.skHukumanDisiplin.map((sk) => (
                <div key={sk.id} className="border-t border-line-2 pt-2 text-sm first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{sk.jenisHukuman}</span>
                    <span className="text-xs text-muted">
                      {sk.skBelumTerbit ? "SK belum terbit" : (sk.nomorSk ?? "Nomor SK belum diisi")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    Berlaku {sk.periodeMulaiBulan}/{sk.periodeMulaiTahun}
                    {sk.periodeSelesaiBulan && sk.periodeSelesaiTahun
                      ? ` s.d. ${sk.periodeSelesaiBulan}/${sk.periodeSelesaiTahun}`
                      : " sampai dicabut"}
                    {sk.kelasJabatanSelamaHukuman !== null && ` • kelas jabatan ${sk.kelasJabatanSelamaHukuman}`}
                  </p>
                  {sk.keterangan && <p className="mt-1 text-xs text-ink-2">{sk.keterangan}</p>}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* ==================================================================
          TAB: BANDING
          ================================================================== */}
      {tabAktif === "banding" && (
        <div className="mt-6 space-y-6">
          <section className="card p-4">
            <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Banding saya</h2>
            {pegawai.banding.length === 0 && (
              <p className="mt-2 text-sm text-muted">
                Belum pernah mengajukan banding. Pengajuan dilakukan dari tab Pendapatan, pada periode yang mau
                dibanding.
              </p>
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
      )}
    </main>
  );
}
