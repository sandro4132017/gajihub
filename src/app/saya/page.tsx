import Link from "next/link";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewDataSendiri } from "../../auth/permissions";
import { hitungTotalPenghasilanSlip } from "../../business-logic/gajiInduk";
import { AksesDitolak } from "../AksesDitolak";
import { RincianPotonganKehadiran } from "../RincianPotonganKehadiran";
import { RincianUangMakan } from "../RincianUangMakan";
import { RincianPendapatan } from "./RincianPendapatan";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../business-logic/tarifTukinPokok";
import { dikecualikanPotonganKehadiran } from "../../business-logic/pejabatPimpinanTinggi";
import { BadgePejabatEselon } from "../BadgePejabatEselon";
import { BandingForm, type SasaranBanding } from "./BandingForm";
import { BandingTracker } from "./BandingTracker";
import { labelReferensiBanding } from "../../business-logic/bandingData";
import { NAMA_BULAN } from "../bulan";
import { SearchableSelect } from "../SearchableSelect";
import { labelStatus } from "../presensiTampilan";
import { keteranganTidakPresensiHari, rincianJamKerjaHari } from "../../business-logic/rincianJamKerjaHarian";
import { muatHariLiburPeriode } from "../../lib/hariLibur";
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
import { FiUser } from "react-icons/fi";
import { RiCalendarCheckLine, RiScalesLine } from "react-icons/ri";
import { BsBarChartFill } from "react-icons/bs";
import { GrMoney } from "react-icons/gr";
import { IoDocumentTextOutline } from "react-icons/io5";
import { SlUser, SlUserFemale } from "react-icons/sl";

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

function getTabIcon(tab: string) {
  switch (tab) {
    case "profil":
      return <FiUser className="size-4 shrink-0" />;
    case "kehadiran":
      return <RiCalendarCheckLine className="size-4 shrink-0" />;
    case "kinerja":
      return <BsBarChartFill className="size-4 shrink-0" />;
    case "pendapatan":
      return <GrMoney className="size-4 shrink-0" />;
    case "dokumen":
      return <IoDocumentTextOutline className="size-4 shrink-0" />;
    case "banding":
      return <RiScalesLine className="size-4 shrink-0" />;
    default:
      return null;
  }
}

function KalkulasiSection({ judul, rows }: { judul: string; rows: KalkulasiRow[] }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink">
          <span className="size-2 rounded-full bg-biru" />
          Riwayat Perhitungan {judul}
        </h2>
        <span className="text-xs font-semibold text-muted">{rows.length} periode</span>
      </div>
      {rows.length === 0 && <p className="mt-3 text-xs text-muted italic">Belum ada riwayat data.</p>}
      <div className="mt-2 divide-y divide-line">
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
            <div>
              <span className="font-bold text-ink sm:text-sm">
                Periode {row.periodeBulan}/{row.periodeTahun}
              </span>
              <p className="mt-0.5 text-[11px] text-muted">
                Status:{" "}
                {row.status === "APPROVED" ? (
                  <span className="font-bold text-green">✓ Disetujui (histori pembayaran)</span>
                ) : (
                  <span className="font-bold text-gold-deep">{row.status} (estimasi)</span>
                )}
              </p>
            </div>
            <span className="font-mono text-sm sm:text-base font-extrabold text-navy">
              {formatRupiah(row.nilai)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function StatTile({
  label,
  nilai,
  highlight,
  catatan,
}: {
  label: string;
  nilai: number;
  highlight?: boolean;
  catatan?: string;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-xs transition ${
        highlight
          ? "border-teal bg-gradient-to-br from-teal-tint via-surface to-white shadow-sm ring-1 ring-teal/20"
          : "border-line bg-surface hover:border-biru/30"
      }`}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{label}</p>
      <p
        className={`mt-1 font-mono text-lg sm:text-xl font-extrabold ${
          highlight ? "text-navy" : "text-ink"
        }`}
      >
        {formatRupiah(nilai)}
      </p>
      {catatan && <p className="mt-0.5 text-[10px] text-muted">{catatan}</p>}
    </div>
  );
}

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
    <div className="rounded-xl border border-line bg-surface-2/40 p-3 sm:p-3.5 transition hover:bg-surface-2/70">
      <dt
        className={`text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-muted${
          keterangan ? " cursor-help underline decoration-dotted underline-offset-2" : ""
        }`}
        title={keterangan}
      >
        {label}
      </dt>
      <dd className="mt-1 text-xs sm:text-sm font-bold text-ink truncate sm:whitespace-normal">{children}</dd>
    </div>
  );
}



export default async function DataSayaPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; periode?: string; bulan?: string; tahun?: string }>;
}) {
  const { tab, periode, bulan: paramBulan, tahun: paramTahun } = await searchParams;
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

  // Deteksi jenis kelamin: dari kolom database jenisKelamin (L/P dari SIAP),
  // atau fallback standar BKN dari digit ke-15 NIP 18-digit (1=L/Pria, 2=P/Wanita).
  const jkDb = pegawai.jenisKelamin?.trim().toUpperCase();
  const nipDigits = pegawai.nip.replace(/\D/g, "");
  const digit15 = nipDigits.length >= 15 ? nipDigits[14] : null;
  const jenisKelamin: "L" | "P" | null =
    jkDb === "L" || jkDb === "P"
      ? (jkDb as "L" | "P")
      : digit15 === "1"
        ? "L"
        : digit15 === "2"
          ? "P"
          : null;

  // Daftar yang BISA dibanding, disusun dari baris yang benar-benar dimiliki
  // pegawai ini - bukan daftar jenis yang tetap. Menawarkan "Kehadiran Juli"
  // pada orang yang rekap Julinya belum ditarik cuma menghasilkan penolakan
  // dari server setelah formulirnya terlanjur diisi.
  //
  // Yang bandingnya masih berjalan tetap DITAMPILKAN, cuma tidak bisa dipilih:
  // menghilangkannya membuat orang mengira sasarannya tidak ada.
  const bandingBerjalan = new Set(
    pegawai.banding
      .filter((b) => b.status === "DIAJUKAN" || b.status === "MENUNGGU_APPROVAL_FINAL")
      .map((b) => `${b.referensiTipe}|${b.referensiId}`)
  );
  const sasaran = (nilai: string, label: string): SasaranBanding => ({
    nilai,
    label,
    sedangBerjalan: bandingBerjalan.has(nilai),
  });
  const sasaranBanding: SasaranBanding[] = [
    sasaran(`DATA_PEGAWAI|${pegawai.id}`, "Data pegawai (jabatan, golongan, kelas jabatan, rekening)"),
    ...pegawai.rekapPresensi.map((r) =>
      sasaran(`PRESENSI|${r.id}`, `Kehadiran - periode ${r.periodeBulan}/${r.periodeTahun}`)
    ),
    ...pegawai.predikatKinerja.map((p) =>
      sasaran(`PREDIKAT_KINERJA|${p.id}`, `Predikat kinerja - periode ${p.periodeBulan}/${p.periodeTahun}`)
    ),
    ...pegawai.tukinCalc.map((t) =>
      sasaran(`TUKIN|${t.id}`, `Tunjangan Kinerja - periode ${t.periodeBulan}/${t.periodeTahun}`)
    ),
    ...pegawai.uangMakan.map((u) =>
      sasaran(`UANG_MAKAN|${u.id}`, `Uang Makan - periode ${u.periodeBulan}/${u.periodeTahun}`)
    ),
    // Mengikuti saklar yang sama dengan menu & nominalnya: selama uang lembur
    // belum ditampilkan, membandingnya juga tidak ada gunanya.
    ...(TAMPILKAN_NOMINAL_LEMBUR
      ? pegawai.uangLembur.map((u) =>
          sasaran(`UANG_LEMBUR|${u.id}`, `Uang Lembur - periode ${u.periodeBulan}/${u.periodeTahun}`)
        )
      : []),
  ];

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

  // Jika user memfilter via dropdown terpisah bulan & tahun:
  const kunciTerpilih = (() => {
    if (paramTahun && paramBulan) {
      return `${paramTahun}-${String(Number(paramBulan)).padStart(2, "0")}`;
    }
    if (paramTahun) {
      const matchTahun = periodeKehadiranTersedia.find((p) => p.tahun === Number(paramTahun));
      if (matchTahun) return kunciPeriode(matchTahun);
    }
    if (paramBulan) {
      const matchBulan = periodeKehadiranTersedia.find((p) => p.bulan === Number(paramBulan));
      if (matchBulan) return kunciPeriode(matchBulan);
    }
    return periode;
  })();

  const periodeKehadiran = pilihPeriode(kunciTerpilih, periodeKehadiranTersedia);

  const tahunTersediaKehadiran = Array.from(
    new Set(periodeKehadiranTersedia.map((p) => p.tahun))
  ).sort((a, b) => b - a);

  const daftarTahunKehadiran =
    tahunTersediaKehadiran.length > 0 ? tahunTersediaKehadiran : [new Date().getFullYear()];

  const opsiBulanKehadiran = NAMA_BULAN.map((nama, idx) => ({
    value: String(idx + 1),
    label: nama,
  }));
  const opsiTahunKehadiran = daftarTahunKehadiran.map((thn) => ({
    value: String(thn),
    label: String(thn),
  }));

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
  const awalKehadiran = periodeKehadiran
    ? new Date(Date.UTC(periodeKehadiran.tahun, periodeKehadiran.bulan - 1, 1))
    : null;
  const akhirKehadiran = periodeKehadiran
    ? new Date(Date.UTC(periodeKehadiran.tahun, periodeKehadiran.bulan, 1))
    : null;

  const [harianKehadiran, kendalaKehadiran, koreksiKehadiran, hariLiburKehadiran] =
    tabAktif === "kehadiran" && periodeKehadiran && awalKehadiran && akhirKehadiran
      ? await Promise.all([
          prisma.presensiHarian.findMany({
            where: {
              pegawaiId: pegawai.id,
              tanggal: { gte: awalKehadiran, lt: akhirKehadiran },
            },
            orderBy: { tanggal: "asc" },
          }),
          prisma.kendalaEpresensi.findMany({
            where: {
              tanggal: { gte: awalKehadiran, lt: akhirKehadiran },
              OR: [{ satuanKerja: null }, { satuanKerja: pegawai.satuanKerja ?? undefined }],
            },
            select: { tanggal: true },
          }),
          prisma.koreksiPresensiHarian.findMany({
            where: {
              pegawaiId: pegawai.id,
              tanggal: { gte: awalKehadiran, lt: akhirKehadiran },
            },
          }),
          muatHariLiburPeriode(periodeKehadiran.bulan, periodeKehadiran.tahun),
        ])
      : [[], [], [], new Map<string, string>()];

  const sebaranMap = new Map<string, number>();
  for (const h of harianKehadiran) {
    sebaranMap.set(h.statusKehadiran, (sebaranMap.get(h.statusKehadiran) ?? 0) + 1);
  }
  const sebaranTerurut = [...sebaranMap.entries()]
    .map(([statusKehadiran, count]) => ({ statusKehadiran, _count: { _all: count } }))
    .sort((a, b) => b._count._all - a._count._all);

  const tanggalKendalaSaya = new Set(kendalaKehadiran.map((k) => k.tanggal.toISOString().slice(0, 10)));
  const petaKoreksiSaya = new Map(koreksiKehadiran.map((k) => [k.tanggal.toISOString().slice(0, 10), k]));
  const menitDariWaktu = (w: Date | null) => (w === null ? null : w.getUTCHours() * 60 + w.getUTCMinutes());

  const keteranganTidakPresensiSaya: string[] = [];
  for (const h of harianKehadiran) {
    const iso = h.tanggal.toISOString().slice(0, 10);
    const koreksiHari = petaKoreksiSaya.get(iso);
    const keteranganLibur = hariLiburKehadiran.get(iso) ?? null;
    const rincian = rincianJamKerjaHari({
      tanggalIso: iso,
      indeksHari: h.tanggal.getUTCDay(),
      hariLibur: keteranganLibur !== null,
      jamMasukMenit: menitDariWaktu(koreksiHari?.jamMasuk ?? h.jamMasuk),
      jamKeluarMenit: menitDariWaktu(koreksiHari?.jamKeluar ?? h.jamKeluar),
      masukDikoreksi: koreksiHari?.jamMasuk != null,
      keluarDikoreksi: koreksiHari?.jamKeluar != null,
    });
    const tgl = keteranganTidakPresensiHari({
      tanggal: h.tanggal,
      wajibPresensi: ["WFO", "HADIR", "TERLAMBAT", "WFH", "WFA", "TIDAK_PRESENSI"].includes(h.statusKehadiran),
      hariLibur: rincian.hariLibur,
      jamMasukMenit: rincian.jamMasukMenit,
      jamKeluarMenit: rincian.jamKeluarMenit,
      dikecualikanKendala: tanggalKendalaSaya.has(iso),
      dikoreksiManual: petaKoreksiSaya.has(iso),
      tapTidakWajar: rincian.tapTidakWajar,
    });
    if (tgl) keteranganTidakPresensiSaya.push(tgl);
  }

  // Riwayat verifikasi/approval untuk tab Banding
  const bandingIds = pegawai.banding.map((b) => b.id);
  const approvalLogsBanding =
    tabAktif === "banding" && bandingIds.length > 0
      ? await prisma.approvalLog.findMany({
          where: {
            referensiTipe: "BANDING",
            referensiId: { in: bandingIds },
          },
          orderBy: { timestampAksi: "asc" },
        })
      : [];

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
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. HEADER UTAMA
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Data Saya
              </h1>
              <span className="chip chip-ok font-semibold text-xs">
                {pegawai.statusPegawai}
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Portal mandiri data kepegawaian, kehadiran, kinerja, pendapatan, dan pengajuan banding Anda.
            </p>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. KEPALA IDENTITAS (HERO PROFILE CARD) - tetap terlihat di SEMUA tab.
          ==================================================================== */}
      <section className="overflow-hidden rounded-2xl border border-line bg-gradient-to-r from-surface to-surface-2/70 p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div
              className={`flex size-14 shrink-0 items-center justify-center rounded-2xl shadow-xs ${
                jenisKelamin === "L"
                  ? "bg-gradient-to-br from-teal-tint via-surface to-biru/20 text-biru ring-1 ring-biru/30"
                  : jenisKelamin === "P"
                    ? "bg-gradient-to-br from-rose-50 via-surface to-rose-100 text-rose-600 ring-1 ring-rose-300"
                    : "bg-gradient-to-br from-teal-tint via-surface to-biru/10 text-biru ring-1 ring-biru/20"
              }`}
              title={
                jenisKelamin === "L"
                  ? "Pegawai Pria (Laki-laki)"
                  : jenisKelamin === "P"
                    ? "Pegawai Wanita (Perempuan)"
                    : pegawai.nama
              }
            >
              {jenisKelamin === "L" ? (
                <SlUser className="size-8 shrink-0 text-biru" />
              ) : jenisKelamin === "P" ? (
                <SlUserFemale className="size-8 shrink-0 text-rose-600" />
              ) : (
                <span className="font-black text-xl text-biru">{pegawai.nama.slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-black tracking-tight text-ink">
                  {pegawai.nama}
                </h2>
                <BadgePejabatEselon kelasJabatan={pegawai.kelasJabatan} />
              </div>
              <p className="mt-1 text-xs sm:text-sm font-medium text-ink-2">
                {pegawai.jabatan ?? "Jabatan belum terisi"}
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                <svg className="size-3.5 shrink-0 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                {pegawai.unitKerja} &bull; <span className="font-semibold text-ink-2">{pegawai.satuanKerja}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. TAB NAVIGATION - Rata Penuh (Full Width Grid)
          ==================================================================== */}
      <nav
        className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 p-1.5 rounded-2xl border border-line bg-surface-2/70 select-none"
        aria-label="Bagian data saya"
      >
        {TAB_SAYA.map((t) => {
          const aktif = t.key === tabAktif;
          const jumlah = jumlahPerTab[t.key];
          return (
            <Link
              key={t.key}
              href={`/saya?tab=${t.key}`}
              aria-current={aktif ? "page" : undefined}
              className={`flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-xs font-bold transition-all text-center ${
                aktif
                  ? "bg-white text-navy shadow-sm ring-1 ring-line/80 font-extrabold"
                  : "text-muted hover:bg-surface/80 hover:text-ink"
              }`}
            >
              {getTabIcon(t.key)}
              <span className="truncate">{t.label}</span>
              {jumlah !== undefined && jumlah > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
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
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </span>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Data Kepegawaian</h2>
              </div>
              <span className="chip chip-navy text-[11px] font-semibold">Sumber SIAP</span>
            </div>

            <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Butir label="Nama">{pegawai.nama}</Butir>
              <Butir label="NIP">
                <span className="font-mono">{pegawai.nip}</span>
              </Butir>
              <Butir label="Jenis Kelamin">
                {jenisKelamin === "L" ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                    <SlUser className="size-3.5 text-biru" /> Laki-laki (Pria)
                  </span>
                ) : jenisKelamin === "P" ? (
                  <span className="inline-flex items-center gap-1.5 font-bold text-ink">
                    <SlUserFemale className="size-3.5 text-rose-500" /> Perempuan (Wanita)
                  </span>
                ) : (
                  "-"
                )}
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

            <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted flex items-center gap-1.5">
              <svg className="size-3.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Data bersumber dari SIAP dan terakhir diperbarui pada {formatTanggal(pegawai.sourceSyncedAt)}.
            </p>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex items-center gap-2.5 border-b border-line pb-4">
              <span className="flex size-8 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Rekening Pembayaran</h2>
                <p className="text-[11px] text-muted">Rekening tujuan transfer per jenis pembayaran aktif</p>
              </div>
            </div>

            {pegawai.rekening.length === 0 && (
              <p className="mt-4 text-sm text-muted italic">Belum ada rekening yang terdaftar untuk kamu.</p>
            )}

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {pegawai.rekening.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-surface-2/50 p-4 transition hover:border-biru/40 hover:bg-surface-2 shadow-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-2.5">
                    <span className="chip chip-navy font-bold text-xs">{r.jenisPembayaran}</span>
                    <span className="text-xs font-bold text-ink">{r.namaBank}</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Nomor Rekening</p>
                      <p className="font-mono text-sm sm:text-base font-extrabold text-navy mt-0.5">{r.nomorRekening}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Nama Rekening</p>
                      <p className="text-xs font-semibold text-ink mt-0.5">{r.namaRekening ?? "-"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Status PTKP (PPh Pasal 21)</h2>
                  <p className="text-[11px] text-muted">
                    Status per <strong className="text-ink-2">{formatTanggal(acuanPtkp)}</strong>, dari data SIAP.
                  </p>
                </div>
              </div>
              <span className="chip chip-wait text-xs font-bold">Berdasarkan Data SIAP</span>
            </div>

            {!ptkp && (
              <p className="mt-4 text-sm text-muted">
                Belum bisa ditentukan karena status kawin kamu belum terisi di SIAP. Perbaikannya lewat Kasubag TU
                unit kamu, bukan di sini.
              </p>
            )}

            {ptkp && (
              <>
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
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

            <div className="mt-5 border-t border-line pt-4">
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
            </div>

            <div className="mt-5 border-t border-line pt-4">
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

            <div className="mt-5 border-t border-line pt-4">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
        <div className="space-y-6">
          {periodeKehadiran && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs">
              <form method="get" className="flex flex-wrap items-center gap-3 [&_input]:mt-0">
                <input type="hidden" name="tab" value="kehadiran" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">Filter Presensi:</span>
                
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted">Bulan:</span>
                  <SearchableSelect
                    name="bulan"
                    className="w-36"
                    options={opsiBulanKehadiran}
                    defaultValue={String(periodeKehadiran.bulan)}
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-muted">Tahun:</span>
                  <SearchableSelect
                    name="tahun"
                    className="w-28"
                    options={opsiTahunKehadiran}
                    defaultValue={String(periodeKehadiran.tahun)}
                  />
                </div>

                <button type="submit" className="btn btn-primary btn-sm">
                  Tampilkan
                </button>
              </form>
              <Link
                href={`/saya/presensi/${periodeKehadiran.bulan}/${periodeKehadiran.tahun}`}
                className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
              >
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                </svg>
                Presensi Lengkap
              </Link>
            </div>
          )}

          {rekapKehadiran && (
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </span>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Rekap Kehadiran</h2>
                </div>
                <span className="chip chip-navy text-xs font-semibold">
                  {NAMA_BULAN[rekapKehadiran.periodeBulan - 1]} {rekapKehadiran.periodeTahun}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Hari Kerja</p>
                  <p className="font-mono text-xl font-extrabold text-ink mt-0.5">
                    {rekapKehadiran.jumlahHariKerja} <span className="text-xs font-normal text-muted">hari</span>
                  </p>
                </div>
                <div className="rounded-xl border border-teal-tint bg-teal-tint/40 p-3.5 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-biru">Hari Hadir</p>
                  <p className="font-mono text-xl font-extrabold text-navy mt-0.5">
                    {rekapKehadiran.jumlahHariHadir} <span className="text-xs font-normal text-muted">hari</span>
                  </p>
                </div>
                <div className="rounded-xl border border-line bg-surface-2/50 p-3.5 col-span-2 sm:col-span-1 shadow-xs">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Tingkat Kehadiran</p>
                  <p className="font-mono text-xl font-extrabold text-green mt-0.5">
                    {rekapKehadiran.jumlahHariKerja > 0
                      ? Math.round((rekapKehadiran.jumlahHariHadir / rekapKehadiran.jumlahHariKerja) * 100)
                      : 0}
                    %
                  </p>
                </div>
              </div>

              {sebaranTerurut.length > 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted">Sebaran Status Hari</p>
                  <ul className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {sebaranTerurut.map((sb) => (
                      <li
                        key={sb.statusKehadiran}
                        className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-ink-2">{labelStatus(sb.statusKehadiran)}</span>
                        <span className="font-mono font-bold text-ink">{sb._count._all} hari</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {sebaranTerurut.length === 0 && (
                <div className="mt-5 border-t border-line pt-4">
                  <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Butir label="WFO">{rekapKehadiran.jumlahHariWfo}</Butir>
                    <Butir label="WFH / WFA">{rekapKehadiran.jumlahHariWfhWfa}</Butir>
                    <Butir label="Diklat">{rekapKehadiran.jumlahHariDiklat}</Butir>
                    <Butir label="Dinas luar">{rekapKehadiran.jumlahHariDinasLuar}</Butir>
                    <Butir label="Tugas belajar">{rekapKehadiran.jumlahHariTugasBelajar}</Butir>
                    <Butir label="Cuti">{rekapKehadiran.jumlahHariCuti}</Butir>
                  </dl>
                  <p className="mt-3 text-xs text-muted">
                    Periode ini tidak punya rincian harian - rekapnya diisi lewat template Excel, bukan tarikan
                    e-Presensi.
                  </p>
                </div>
              )}

              <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
                Hari hadir tidak sama dengan hari yang dibayar uang makan - diklat dan dinas luar tetap bekerja
                tapi konsumsinya ditanggung penyelenggara. Rinciannya di tab Pendapatan.
              </p>
            </section>
          )}

          {rekapKehadiran && (
            <RincianPotonganKehadiran
              rekap={rekapKehadiran}
              bobotKehadiranPenuh={bobotKehadiranPenuhSaya}
              nilaiTersimpan={tukinKehadiran?.komponenKehadiran ?? null}
              dikecualikan={dikecualikanPotonganKehadiran(pegawai.kelasJabatan)}
              keteranganTidakPresensi={keteranganTidakPresensiSaya}
            />
          )}

          {!periodeKehadiran && (
            <section className="rounded-2xl border border-dashed border-line bg-surface-2 p-8 text-center">
              <p className="text-sm font-semibold text-muted">
                Belum ada rekap presensi untuk kamu. Rekap dibuat waktu unit kamu menarik presensi periode berjalan
                dari e-Presensi.
              </p>
            </section>
          )}
        </div>
      )}

      {/* ==================================================================
          TAB: KINERJA
          ================================================================== */}
      {tabAktif === "kinerja" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </span>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Predikat Kinerja</h2>
              </div>
              <span className="chip chip-navy text-xs font-semibold">Sumber: e-Kinerja BKN</span>
            </div>

            {pegawai.predikatKinerja.length === 0 && (
              <p className="mt-4 text-sm text-muted italic">Belum ada data predikat kinerja tercatat.</p>
            )}

            {pegawai.predikatKinerja.length > 0 && (
              <div className="mt-4 divide-y divide-line">
                {pegawai.predikatKinerja.map((pk) => (
                  <div key={pk.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs sm:text-sm">
                    <span className="font-bold text-ink">
                      Periode {pk.periodeBulan}/{pk.periodeTahun}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="chip chip-ok font-bold text-xs">{pk.predikat}</span>
                      <span className="font-mono font-extrabold text-navy text-xs sm:text-sm">{pk.nilaiAngka}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <p className="mt-4 border-t border-line pt-3 text-[11px] text-muted">
              Predikat kinerja menentukan komponen 70% Tunjangan Kinerja (Pasal 5). Perubahannya dilakukan di
              e-Kinerja BKN, lalu diunggah ulang oleh unit Anda. Jika predikat tidak sesuai, ajukan lewat tab Banding.
            </p>
          </section>
        </div>
      )}

      {/* ==================================================================
          TAB: PENDAPATAN
          ================================================================== */}
      {tabAktif === "pendapatan" && (
        <div className="space-y-6">
          {periodeTerbaru && (
            <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </span>
                  <div>
                    <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">
                      Ringkasan Pendapatan
                    </h2>
                    <p className="text-[11px] text-muted">Periode {periodeTerbaru.periodeBulan}/{periodeTerbaru.periodeTahun}</p>
                  </div>
                </div>
                <Link
                  href={`/saya/slip-gaji/${periodeTerbaru.periodeBulan}/${periodeTerbaru.periodeTahun}`}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                >
                  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Lihat Slip Gaji
                </Link>
              </div>

              <div
                className={`mt-4 grid grid-cols-2 gap-3 ${
                  TAMPILKAN_NOMINAL_LEMBUR ? "sm:grid-cols-5" : "sm:grid-cols-4"
                }`}
              >
                <StatTile label="Gaji Bersih" nilai={gajiTerbaru?.gajiBersih ?? 0} />
                <StatTile label="Tukin" nilai={tukinTerbaru?.tukinBersih ?? 0} />
                <StatTile label="Uang Makan" nilai={umTerbaru?.totalUangMakan ?? 0} />
                {TAMPILKAN_NOMINAL_LEMBUR && (
                  <StatTile label="Uang Lembur" nilai={lemburTerbaru?.totalUangLembur ?? 0} />
                )}
                <StatTile label="Total Diterima" nilai={totalTerbaru} highlight />
              </div>

              {!gajiTerbaru && (
                <p className="mt-3 text-xs text-muted">
                  Gaji bersih masih kosong karena data gaji induk periode ini belum diunggah PPABP.
                </p>
              )}
              {gajiTerbaru && gajiTerbaru.honorarium > 0 && (
                <p className="mt-3 text-xs text-muted">Total sudah termasuk honorarium periode ini.</p>
              )}
            </section>
          )}

          {!periodeTerbaru && (
            <p className="text-sm text-muted italic">Belum ada periode pendapatan yang tercatat untuk Anda.</p>
          )}

          {periodeTerbaru && (
            <RincianPendapatan
              gaji={gajiTerbaru ?? null}
              tukinBersih={tukinTerbaru?.tukinBersih ?? 0}
              uangMakan={umTerbaru?.totalUangMakan ?? 0}
              uangLembur={TAMPILKAN_NOMINAL_LEMBUR ? lemburTerbaru?.totalUangLembur ?? 0 : null}
              total={totalTerbaru}
            />
          )}

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
          />
          <KalkulasiSection
            judul="Uang Makan"
            rows={pegawai.uangMakan.map((r) => ({ ...r, nilai: r.totalUangMakan }))}
          />
          {TAMPILKAN_NOMINAL_LEMBUR && (
            <KalkulasiSection
              judul="Uang Lembur"
              rows={pegawai.uangLembur.map((r) => ({ ...r, nilai: r.totalUangLembur }))}
            />
          )}
        </div>
      )}

      {/* ==================================================================
          TAB: DOKUMEN
          ================================================================== */}
      {tabAktif === "dokumen" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </span>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Slip Gaji</h2>
              </div>
              <span className="text-xs text-muted">{daftarPeriode.length} periode tersedia</span>
            </div>

            {daftarPeriode.length === 0 && <p className="mt-4 text-xs text-muted italic">Belum ada periode yang bisa dicetak.</p>}

            <div className="mt-3 divide-y divide-line">
              {daftarPeriode.map((p) => (
                <div key={`${p.tahun}-${p.bulan}`} className="flex items-center justify-between py-2.5 text-xs sm:text-sm">
                  <span className="font-semibold text-ink">
                    Periode {p.bulan}/{p.tahun}
                  </span>
                  <Link
                    href={`/saya/slip-gaji/${p.bulan}/${p.tahun}`}
                    className="inline-flex items-center gap-1 font-bold text-biru hover:underline text-xs"
                  >
                    Lihat / Cetak
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex items-center gap-2.5 border-b border-line pb-4">
              <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Bukti Potong Pajak</h2>
                <p className="text-[11px] text-muted">Hasil sinkronisasi Web Gaji oleh Satker / PPABP</p>
              </div>
            </div>

            {pegawai.buktiPotongPajak.length === 0 && (
              <p className="mt-4 text-xs text-muted italic">Belum ada bukti potong pajak yang diunggah untuk Anda.</p>
            )}

            <div className="mt-3 divide-y divide-line">
              {pegawai.buktiPotongPajak.map((b) => (
                <div key={b.id} className="flex items-center justify-between py-2.5 text-xs sm:text-sm">
                  <div>
                    <span className="font-bold text-ink">Tahun Pajak {b.tahunPajak}</span>
                    {b.nomorBuktiPotong && (
                      <span className="ml-2 font-mono text-xs text-muted">No: {b.nomorBuktiPotong}</span>
                    )}
                  </div>
                  <a
                    href={b.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-bold text-biru hover:underline text-xs"
                  >
                    Unduh Dokumen
                    <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </a>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex items-center gap-2.5 border-b border-line pb-4">
              <span className="flex size-8 items-center justify-center rounded-lg bg-teal-tint text-biru">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">SK Kenaikan Gaji Berkala (KGB)</h2>
                <p className="text-[11px] text-muted">Riwayat penyesuaian gaji berkala pegawai</p>
              </div>
            </div>

            {pegawai.skKgb.length === 0 && <p className="mt-4 text-xs text-muted italic">Belum ada SK KGB yang tercatat.</p>}

            <div className="mt-3 divide-y divide-line">
              {pegawai.skKgb.map((sk) => (
                <div key={sk.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-ink">{sk.nomorSk}</p>
                    <p className="text-xs text-muted mt-0.5">
                      {sk.golonganLama} &rarr; <strong className="text-ink">{sk.golonganBaru}</strong> &bull; TMT {formatTanggal(sk.tmtKgb)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="chip chip-draft text-xs">{sk.status}</span>
                    {sk.fileUrl && (
                      <a
                        href={sk.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-outline btn-sm inline-flex items-center gap-1 text-xs"
                      >
                        Unduh
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex items-center gap-2.5 border-b border-line pb-4">
              <span className="flex size-8 items-center justify-center rounded-lg bg-red-tint text-red">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </span>
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">SK Hukuman Disiplin</h2>
                <p className="text-[11px] text-muted">Dasar hukum penyesuaian potongan tunjangan kinerja (Pasal 14)</p>
              </div>
            </div>

            {pegawai.skHukumanDisiplin.length === 0 && (
              <p className="mt-4 text-xs text-muted italic">Tidak ada catatan hukuman disiplin.</p>
            )}

            <div className="mt-3 divide-y divide-line">
              {pegawai.skHukumanDisiplin.map((sk) => (
                <div key={sk.id} className="py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-ink sm:text-sm">{sk.jenisHukuman}</span>
                    <span className="chip chip-draft text-xs">
                      {sk.skBelumTerbit ? "SK belum terbit" : (sk.nomorSk ?? "Nomor SK belum diisi")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Berlaku {sk.periodeMulaiBulan}/{sk.periodeMulaiTahun}
                    {sk.periodeSelesaiBulan && sk.periodeSelesaiTahun
                      ? ` s.d. ${sk.periodeSelesaiBulan}/${sk.periodeSelesaiTahun}`
                      : " sampai dicabut"}
                    {sk.kelasJabatanSelamaHukuman !== null && ` • Kelas Jabatan ${sk.kelasJabatanSelamaHukuman}`}
                  </p>
                  {sk.keterangan && <p className="mt-1 text-xs italic text-ink-2">&ldquo;{sk.keterangan}&rdquo;</p>}
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
        <div className="space-y-6">
          <details
            className="rounded-2xl border border-line bg-surface shadow-[0_2px_12px_rgba(19,65,107,0.06)] overflow-hidden group"
            open={pegawai.banding.length === 0}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 bg-gradient-to-r from-surface to-surface-2/60 p-4 sm:p-5 select-none transition hover:bg-surface-2/80 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2.5">
                <span className="flex size-8 items-center justify-center rounded-lg bg-gold-tint text-gold-deep">
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </span>
                <div>
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink">Formulir Pengajuan Banding</h2>
                  <p className="text-[11px] text-muted">Ajukan koreksi jika terdapat data presensi, predikat, atau nominal yang tidak sesuai</p>
                </div>
              </div>
              <span className="btn btn-gold btn-sm group-open:hidden">Buka Formulir</span>
              <span className="hidden text-xs font-bold text-muted group-open:inline">Tutup Formulir ✕</span>
            </summary>
            <div className="p-5 sm:p-6 border-t border-line">
              <BandingForm sasaran={sasaranBanding} />
            </div>
          </details>

          <div className="mt-8">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
                  <span className="size-2 rounded-full bg-biru" />
                  Pelacakan Status Banding ({pegawai.banding.length})
                </h2>
                <p className="text-xs text-muted mt-0.5">Alur pemeriksaan berjenjang transparan dari Satker hingga Biro OSDMA</p>
              </div>
            </div>
            <BandingTracker bandings={pegawai.banding} approvalLogs={approvalLogsBanding} />
          </div>
        </div>
      )}
    </main>
  );
}
