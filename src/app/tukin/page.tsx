import { prisma } from "../../lib/prisma";
import { FilterBar } from "../FilterBar";
import { periodePunyaTukin, resolvePeriode } from "../periodeDefault";
import { BadgeStatusKirim, keadaanKirimBaris } from "../StatusKirimBaris";
import { getSessionAccount } from "../../auth/getSessionAccount";
import {
  canViewApproverDashboard,
  canAjukanKalkulasiTukinMassalUnit,
  canLihatKalkulasiSebelumDikirim,
} from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import { StatusBadge } from "../StatusBadge";
import { SumberDataTukin } from "./SumberDataTukin";
import { BadgePejabatEselon } from "../BadgePejabatEselon";
import { RingkasanPerUnit, type BarisRingkasanUnit } from "./RingkasanPerUnit";
import { TabelRincianUnit, type BarisRincianTukin } from "./TabelRincianUnit";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../business-logic/tarifTukinPokok";
import { kelasJabatanEfektif } from "../../business-logic/kelasJabatanEfektif";
import { SumberAcuan } from "../SumberAcuan";
import { HALAMAN } from "../layoutHalaman";
import { NAMA_BULAN } from "../bulan";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function TukinPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string }>;
}) {
  const { bulan, tahun, satker } = await searchParams;

  // Guard eksplisit: PEGAWAI diarahkan ke dashboard self-service sendiri
  // (/saya), bukan halaman approver ini - lihat canViewApproverDashboard +
  // role matrix di CLAUDE.md. TODO(confirm): ADMIN SEKARANG BOLEH lihat
  // halaman ini (privilege penuh, lihat enum Role di schema.prisma) - ini
  // BUKAN desain final untuk production.
  const akun = await getSessionAccount();
  const authUser = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canViewApproverDashboard(authUser)) {
    return authUser?.role === "PEGAWAI" ? (
      <AksesDitolak
        pesan="Halaman ini untuk approver, bukan pegawai."
        hrefAlternatif="/saya"
        labelAlternatif="Lihat data saya"
      />
    ) : (
      <AksesDitolak pesan="Role kamu tidak berwenang melihat data kalkulasi payroll." />
    );
  }

  // KASUBAG_TU cuma boleh lihat rekap unit kerjanya sendiri (role matrix) -
  // paksa filter ke unitnya, abaikan ?satker= dari query kalau ada.
  const satkerEfektif = resolveSatkerEfektif(authUser, satker);

  // Kasubag TU mengerjakan rinciannya di halaman Kalkulasi, bukan di sini -
  // lihat alasannya di dekat `tampilkanRingkasan` di bawah.
  const adalahKasubagUnit = authUser.role === "KASUBAG_TU";

  const satuanKerjaRows = await prisma.pegawai.findMany({
    distinct: ["satuanKerja"],
    select: { satuanKerja: true },
    orderBy: { satuanKerja: "asc" },
  });
  const satuanKerjaList = resolveSatuanKerjaListUntukFilter(
    authUser,
    satuanKerjaRows.map((r) => r.satuanKerja)
  );

  // SATU PERIODE, SELALU. Sebelumnya bulan/tahun yang kosong berarti "semua
  // periode", dan halaman ini adalah satu-satunya yang begitu - akibatnya satu
  // pegawai muncul sekali per periode di tabel rincian, baris TOTAL
  // menjumlahkan beberapa bulan sekaligus, dan angka yang dibaca orang sebagai
  // "yang dibayar bulan ini" sebenarnya gabungan dua bulan.
  //
  // Bawaannya periode TERBARU yang sudah punya kalkulasi DAN bulannya sudah
  // lewat - aturan yang sama dengan seluruh halaman berperiode lain, lihat
  // periodeDefault.ts.
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaTukin()
  );

  const kalkulasiList = await prisma.tukinCalculation.findMany({
    where: {
      periodeBulan,
      periodeTahun,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }, { pegawai: { nama: "asc" } }],
  });

  // Status baris sekarang datang dari PENGIRIMAN UNIT, bukan dari
  // ApprovalLog per baris. Approval berjenjang dihapus 2026-09-02 - yang
  // menggantikannya satu keputusan Kasubag TU per unit per periode, dan
  // keputusan itulah yang juga menentukan isi berkas ADK.
  //
  // Diambil per PERIODE YANG DITAMPILKAN, bukan per baris: satu query untuk
  // seluruh halaman, dan hasilnya tidak berubah dari baris ke baris dalam
  // satu unit.
  const pengirimanPeriode = await prisma.pengirimanUnit.findMany({
    where: {
      OR: kalkulasiList.map((k) => ({
        satuanKerja: k.pegawai.satuanKerja,
        periodeBulan: k.periodeBulan,
        periodeTahun: k.periodeTahun,
      })),
    },
    select: {
      satuanKerja: true,
      periodeBulan: true,
      periodeTahun: true,
      status: true,
      dikirimPada: true,
      dikirimOleh: { select: { nama: true } },
    },
  });
  const petaKirim = new Map(
    pengirimanPeriode.map((p) => [`${p.satuanKerja}|${p.periodeBulan}|${p.periodeTahun}`, p.status])
  );
  const petaPengirim = new Map(
    pengirimanPeriode.map((p) => [`${p.satuanKerja}|${p.periodeBulan}|${p.periodeTahun}`, p])
  );

  // PPABP hanya melihat hasil yang SUDAH DIKIRIM unitnya (keputusan user
  // 2026-09-06). Baris yang belum dikirim masih boleh berubah kapan saja oleh
  // Kasubag TU-nya, jadi menampilkannya di sini mengundang pemeriksaan - dan
  // tindak lanjut - atas angka yang belum final.
  //
  // Disaring SETELAH query, bukan di dalam `where`: status kirim disimpan per
  // UNIT+periode di tabel lain, bukan per baris kalkulasi, jadi tidak bisa
  // disatukan dalam satu kondisi Prisma tanpa relasi yang memang tidak ada.
  //
  // Unit yang belum mengirim TIDAK hilang dari pandangan PPABP: papan progres
  // pengiriman menampilkannya sebagai unit yang DITUNGGU, dan itu memang
  // tempat yang benar untuk melihatnya.
  const kalkulasiTampil = kalkulasiList.filter((k) => {
    if (canLihatKalkulasiSebelumDikirim(authUser, k.pegawai.satuanKerja)) return true;
    return petaKirim.get(`${k.pegawai.satuanKerja}|${k.periodeBulan}|${k.periodeTahun}`) === "TERKIRIM";
  });

  // --- Rincian satu unit (tabel 39 kolom) ---
  //
  // Ditarik HANYA waktu satu satuan kerja dibuka DAN tabelnya memang akan
  // dipakai. Tanpa penjaga ini, membuka /tukin tanpa filter berarti menarik
  // presensi + predikat + identitas untuk lima ribu pegawai sekaligus, cuma
  // untuk dibuang lagi karena yang tampil ringkasan per unit.
  //
  // Kasubag TU ikut dilewati: dia selalu punya satuan kerja efektif, tapi yang
  // ditampilkan padanya ringkasan - query di bawah hasilnya tidak akan
  // dirender sama sekali.
  const barisRincian: BarisRincianTukin[] = [];
  if (satkerEfektif && !adalahKasubagUnit && kalkulasiTampil.length > 0) {
    const idPegawai = kalkulasiTampil.map((k) => k.pegawaiId);
    const kunciPeriode = kalkulasiTampil.map((k) => ({
      pegawaiId: k.pegawaiId,
      periodeBulan: k.periodeBulan,
      periodeTahun: k.periodeTahun,
    }));

    const [predikatList, skHukdis] = await Promise.all([
      prisma.predikatKinerja.findMany({
        where: { OR: kunciPeriode },
        select: { pegawaiId: true, periodeBulan: true, periodeTahun: true, predikat: true },
      }),
      // Kelas jabatan EFEKTIF - pegawai yang sedang menjalani penurunan
      // jabatan (PP 94/2021) dibayar dengan tarif kelas yang turun. Dihitung
      // dengan cara yang SAMA PERSIS dengan route ADK; kalau berbeda, tabel
      // pemeriksaan ini justru bertentangan dengan berkas yang diperiksanya.
      prisma.skHukumanDisiplin.findMany({
        where: { pegawaiId: { in: idPegawai }, status: "DISETUJUI", kelasJabatanSelamaHukuman: { not: null } },
      }),
    ]);

    const kunci = (p: string, b: number, t: number) => `${p}|${b}|${t}`;
    const petaPredikat = new Map(predikatList.map((r) => [kunci(r.pegawaiId, r.periodeBulan, r.periodeTahun), r]));
    const petaSk = new Map<string, typeof skHukdis>();
    for (const sk of skHukdis) petaSk.set(sk.pegawaiId, [...(petaSk.get(sk.pegawaiId) ?? []), sk]);

    for (const k of kalkulasiTampil) {
      const efektif = kelasJabatanEfektif(
        k.pegawai.kelasJabatan,
        petaSk.get(k.pegawaiId) ?? [],
        k.periodeBulan,
        k.periodeTahun
      );
      barisRincian.push({
        id: k.id,
        nip: k.pegawai.nip,
        nama: k.pegawai.nama,
        kelasJabatan: efektif.kelas,
        nominalTukin: efektif.kelas === null ? null : (TUKIN_POKOK_PER_KELAS_JABATAN[efektif.kelas] ?? null),
        predikat: petaPredikat.get(kunci(k.pegawaiId, k.periodeBulan, k.periodeTahun))?.predikat ?? null,
        dibayarkan: k.tukinBersih,
        catatanAnomali: k.catatanAnomali,
      });
    }
  }

  // --- Ringkasan per satuan kerja ---
  //
  // Dipakai waktu belum ada satker yang dipilih, DAN untuk Kasubag TU yang
  // satkernya selalu dipaksa ke unitnya sendiri - dia pun melihat ringkasan,
  // bukan tabel rincian.
  //
  // Syaratnya HARUS sama dengan `tampilkanRingkasan` di bawah. Waktu keduanya
  // berbeda, Kasubag TU jatuh ke cabang terakhir dan halamannya merender satu
  // kartu PER PEGAWAI - 47 kartu berisi nama, NIP, dan badge status yang
  // semuanya berbunyi sama.
  //
  // Diturunkan dari `kalkulasiTampil` - daftar yang SUDAH disaring hak
  // aksesnya - supaya ringkasan dan rincian tidak mungkin bercerita berbeda.
  // Kalau dihitung ulang lewat query terpisah, penyaringan hak akses harus
  // ditulis dua kali dan cepat atau lambat keduanya menyimpang.
  const ringkasanUnit: BarisRingkasanUnit[] = [];
  if (!satkerEfektif || adalahKasubagUnit) {
    const per = new Map<string, BarisRingkasanUnit>();
    for (const k of kalkulasiTampil) {
      const kunci = `${k.pegawai.satuanKerja}|${k.periodeBulan}|${k.periodeTahun}`;
      const kirim = petaPengirim.get(kunci);
      const baris =
        per.get(k.pegawai.satuanKerja) ??
        {
          satuanKerja: k.pegawai.satuanKerja,
          jumlahPegawai: 0,
          jumlahCatatan: 0,
          totalBersih: 0,
          statusKirim: kirim?.status,
          dikirimPada: kirim?.dikirimPada ?? null,
          dikirimOleh: kirim?.dikirimOleh?.nama ?? null,
        };
      baris.jumlahPegawai += 1;
      baris.totalBersih += k.tukinBersih;
      if (k.catatanAnomali) baris.jumlahCatatan += 1;
      per.set(k.pegawai.satuanKerja, baris);
    }
    // Paling baru dikirim di atas - tabel ini antrean kerja, bukan arsip.
    // Unit tanpa tanggal kirim ditaruh paling belakang.
    ringkasanUnit.push(
      ...[...per.values()].sort(
        (a, b) => (b.dikirimPada?.getTime() ?? 0) - (a.dikirimPada?.getTime() ?? 0)
      )
    );
  }

  // --- Status kedua komponen pembentuk Tukin untuk periode yang difilter ---
  // Ditaruh di halaman yang sama supaya jelas kenapa seorang pegawai belum
  // punya kalkulasi: presensinya belum ada, predikatnya belum ada, atau
  // dua-duanya. Sebelumnya kedua sumber ini ada di menu yang terpisah-pisah.
  const periodeAktif = { periodeBulan, periodeTahun };
  const filterPegawaiSatker = satkerEfektif ? { pegawai: { satuanKerja: satkerEfektif } } : {};

  const [jumlahPegawai, jumlahPresensi, jumlahPredikat] = await Promise.all([
        // Penyebut "X / Y pegawai" pada panel sumber data: hanya yang AKTIF,
        // supaya cakupannya tidak terlihat lebih buruk dari kenyataan gara-gara
        // pensiunan yang memang tidak akan pernah punya presensi/predikat baru.
        prisma.pegawai.count({
          where: { statusPegawai: "AKTIF", ...(satkerEfektif ? { satuanKerja: satkerEfektif } : {}) },
        }),
        prisma.rekapPresensiPeriode.count({ where: { ...periodeAktif, ...filterPegawaiSatker } }),
    prisma.predikatKinerja.count({ where: { ...periodeAktif, ...filterPegawaiSatker } }),
  ]);

  // Ringkasan menggantikan daftar kartu, BUKAN disembunyikan dengan CSS -
  // kartu yang dirender lalu di-`hidden` tetap dibuat semuanya, dan justru
  // beban itulah yang mau dihilangkan.
  //
  // KASUBAG TU IKUT DAPAT RINGKASAN, bukan tabel rincian (keputusan user
  // 2026-09-09). Rincian per pegawai unitnya sudah ada di halaman Kalkulasi -
  // di situlah dia mengerjakannya, lengkap dengan tombol hitung ulang dan
  // rincian potongan per pasal. Menampilkan tabel yang sama di sini berarti
  // dua tempat menjawab pertanyaan yang sama, dan yang satu tidak bisa
  // ditindaklanjuti. Yang dia butuhkan di halaman ini cuma keadaan unitnya:
  // sudah dihitung berapa orang, totalnya berapa, sudah terkirim atau belum.
  //
  // PPABP & Admin TETAP dapat tabel rincian - mereka tidak punya akses ke
  // halaman Kalkulasi sama sekali, jadi di sinilah satu-satunya tempat mereka
  // bisa memeriksa angkanya per pegawai.
  const tampilkanRingkasan = ringkasanUnit.length > 0 && (!satkerEfektif || adalahKasubagUnit);

  return (
    <main className={HALAMAN}>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Dashboard Tukin
        <SumberAcuan
          judul="Dasar aturan"
          acuan={[
            { aturan: "Pasal 5 ayat (2)", tentang: "Bobot 70% capaian kinerja + 30% kehadiran" },
            { aturan: "Pasal 18", tentang: "Tukin = tarif kelas jabatan x (bobot kinerja + bobot kehadiran)" },
            { aturan: "Lampiran Permenaker 15/2024", tentang: "Tukin pokok per kelas jabatan - kolom Nominal Tukin" },
            // Kolom Potongan di tabel ini menjumlahkan TIGA arah sekaligus, jadi
            // ketiga dasarnya harus ikut disebut - lihat potonganTotal() di
            // TabelRincianUnit.tsx.
            { aturan: "Pasal 13", tentang: "Potongan kehadiran - ikut terhitung di kolom Potongan" },
            { aturan: "Pasal 14", tentang: "Persentase yang dibayarkan selama cuti - ikut terhitung di kolom Potongan" },
          ]}
          catatan="Semuanya Permenaker 15/2024. Angka di halaman ini nilai TERSIMPAN, dibekukan saat kalkulasi dijalankan - bukan dihitung ulang tiap halaman dibuka."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">Kehadiran 30% + Capaian Kinerja 70%</p>
      <p className="mt-2 text-sm text-biru">
        Satu tempat untuk kedua komponen pembentuk Tunjangan Kinerja beserta hasil kalkulasinya per satuan kerja.
      </p>

      {/* Yang ditampilkan filter HARUS periode yang benar-benar dipakai query -
          kalau filter kosong sementara tabelnya sudah tersaring, orang membaca
          angka satu bulan sebagai angka seluruh periode. */}
      <FilterBar
        wajibPeriode
        satuanKerjaList={satuanKerjaList}
        bulan={String(periodeBulan)}
        tahun={String(periodeTahun)}
        satker={satkerEfektif}
      />

      <SumberDataTukin
        periodeAktif={periodeAktif}
        jumlahPegawai={jumlahPegawai}
        jumlahPresensi={jumlahPresensi}
        jumlahPredikat={jumlahPredikat}
        bolehHitung={canAjukanKalkulasiTukinMassalUnit(authUser, satkerEfektif ?? "")}
        satkerEfektif={satkerEfektif}
      />

      {tampilkanRingkasan ? (
        <RingkasanPerUnit
          baris={ringkasanUnit}
          qsPeriode={`?bulan=${periodeBulan}&tahun=${periodeTahun}`}
          hrefRincianTetap={
            adalahKasubagUnit
              ? `/kasubag/kalkulasi?bulan=${periodeBulan}&tahun=${periodeTahun}&satker=${encodeURIComponent(
                  satkerEfektif ?? ""
                )}`
              : undefined
          }
        />
      ) : barisRincian.length > 0 ? (
        <TabelRincianUnit
          baris={barisRincian}
          satuanKerja={satkerEfektif ?? ""}
          periode={`${NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} ${periodeTahun}`}
        />
      ) : (
        <div className="mt-8 space-y-4">
        {kalkulasiTampil.length === 0 && (
          <p className="card p-6 text-sm text-muted">
            Belum ada hasil kalkulasi untuk filter ini. Coba ubah periode atau satuan kerjanya.
          </p>
        )}

        {kalkulasiTampil.map((kalkulasi) => {
          const keadaanKirim = keadaanKirimBaris(
            petaKirim.get(
              `${kalkulasi.pegawai.satuanKerja}|${kalkulasi.periodeBulan}|${kalkulasi.periodeTahun}`
            )
          );

          return (
            <div key={kalkulasi.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* <div>, BUKAN <p>: badge-nya memakai <details>, dan itu
                      flow content - browser akan menutup paksa <p> sebelum
                      elemen itu, sehingga DOM hasil parsing beda dari pohon
                      React (hydration mismatch). Lihat BadgePejabatEselon. */}
                  <div className="font-bold text-ink">
                    {kalkulasi.pegawai.nama}
                    <BadgePejabatEselon kelasJabatan={kalkulasi.pegawai.kelasJabatan} />
                  </div>
                  <p className="text-sm text-muted">
                    NIP {kalkulasi.pegawai.nip} - Periode {kalkulasi.periodeBulan}/{kalkulasi.periodeTahun}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-mono font-bold text-ink">{formatRupiah(kalkulasi.tukinBersih)}</p>
                  <BadgeStatusKirim keadaan={keadaanKirim} />
                </div>
              </div>

              {kalkulasi.catatanAnomali && (
                <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
                  Catatan validasi: {kalkulasi.catatanAnomali}
                </p>
              )}

            </div>
          );
        })}
        </div>
      )}
    </main>
  );
}
