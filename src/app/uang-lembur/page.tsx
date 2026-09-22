import { prisma } from "../../lib/prisma";
import { FilterBar } from "../FilterBar";
import { BadgeStatusKirim, keadaanKirimBaris } from "../StatusKirimBaris";
import { getSessionAccount } from "../../auth/getSessionAccount";
import { canViewApproverDashboard } from "../../auth/permissions";
import { resolveSatkerEfektif, resolveSatuanKerjaListUntukFilter } from "../dashboardScope";
import { AksesDitolak } from "../AksesDitolak";
import {
  ALASAN_UANG_LEMBUR_DISEMBUNYIKAN,
  CATATAN_UANG_LEMBUR_BELUM_FINAL,
  TAMPILKAN_MENU_LEMBUR,
  TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN,
} from "../tampilUangLembur";
import { HALAMAN } from "../layoutHalaman";
import { SumberAcuan } from "../SumberAcuan";
import { lemburTeks } from "../presensiTampilan";
import { Paginasi, hitungPaginasi } from "../Paginasi";
import { NAMA_BULAN } from "../bulan";
import { periodePunyaUangLembur, resolvePeriode } from "../periodeDefault";
import Link from "next/link";

export const dynamic = "force-dynamic";

const formatRupiah = (nilai: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(nilai);

export default async function UangLemburPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; hal?: string; per?: string }>;
}) {
  const { bulan, tahun, satker, hal, per } = await searchParams;

  // Gerbang paling luar, SEBELUM satu query pun dijalankan.
  //
  // Diletakkan di sini, bukan sekadar melepas menunya dari sidebar: menu yang
  // hilang tidak menutup URL, dan orang yang pernah mem-bookmark halaman ini
  // akan tetap sampai ke angkanya. Yang dilihatnya sekarang penjelasan, bukan
  // halaman kosong yang terbaca seperti kerusakan.
  if (!TAMPILKAN_MENU_LEMBUR) {
    return (
      <main className={HALAMAN}>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">Uang Lembur</h1>
        <div className="card mt-4 max-w-2xl p-5">
          <span className="chip chip-wait">Sementara disembunyikan</span>
          <p className="mt-3 text-sm text-ink-2">{ALASAN_UANG_LEMBUR_DISEMBUNYIKAN}</p>
        </div>
      </main>
    );
  }

  // Guard sama dengan Dashboard Tukin (lihat src/app/tukin/page.tsx) -
  // KASUBAG_TU discope ke unit kerjanya sendiri, PEGAWAI diarahkan ke
  // dashboard self-service (/saya).
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
  // KASUBAG_TU dipaksa ke unitnya sendiri; dipisah dari satkerEfektif supaya
  // bisa disebut di kepala halaman - pola yang sama dengan /tukin/presensi.
  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  const satkerEfektif = resolveSatkerEfektif(authUser, satker);

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
  // periode", dan tabelnya jadi mencampur beberapa bulan dalam satu daftar:
  // satu pegawai muncul berkali-kali, hitungan "sekian baris" di atas tabel
  // menjawab pertanyaan yang tidak ditanya siapa pun, dan dua baris bernama
  // sama dengan nominal berbeda terbaca seperti data ganda. Masalah yang sama
  // sudah diperbaiki lebih dulu di Dashboard Tukin - lihat src/app/tukin/page.tsx.
  //
  // Bawaannya periode TERBARU yang sudah punya baris lembur DAN bulannya sudah
  // lewat, aturan yang sama dengan seluruh halaman berperiode lain.
  const { bulan: periodeBulan, tahun: periodeTahun } = resolvePeriode(
    bulan,
    tahun,
    await periodePunyaUangLembur()
  );

  const kalkulasiList = await prisma.uangLembur.findMany({
    where: {
      periodeBulan,
      periodeTahun,
      pegawai: satkerEfektif ? { satuanKerja: satkerEfektif } : undefined,
    },
    include: { pegawai: true },
    orderBy: { pegawai: { nama: "asc" } },
  });

  // Paginasi di URL, pola yang sama dengan /tukin/presensi & /kasubag/pegawai -
  // tetap jalan tanpa JavaScript dan link-nya bisa dibagikan.
  const paginasi = hitungPaginasi(kalkulasiList.length, hal, per);
  const halamanIni = kalkulasiList.slice(paginasi.mulai, paginasi.selesai);
  const paramPaginasi = new URLSearchParams();
  // Periode hasil resolusi, bukan query string mentahnya: tanpa ini tautan
  // halaman 2 kehilangan periodenya dan - karena bawaannya dihitung ulang tiap
  // permintaan - bisa mendarat di bulan lain dengan jumlah baris yang berbeda.
  paramPaginasi.set("bulan", String(periodeBulan));
  paramPaginasi.set("tahun", String(periodeTahun));
  if (satkerEfektif) paramPaginasi.set("satker", satkerEfektif);

  // Status baris dari PENGIRIMAN UNIT - pola yang sama persis dengan
  // src/app/tukin/page.tsx. Approval berjenjang dihapus 2026-09-02.
  const pengirimanPeriode = await prisma.pengirimanUnit.findMany({
    where: {
      OR: halamanIni.map((k) => ({
        satuanKerja: k.pegawai.satuanKerja,
        periodeBulan: k.periodeBulan,
        periodeTahun: k.periodeTahun,
      })),
    },
    select: { satuanKerja: true, periodeBulan: true, periodeTahun: true, status: true },
  });
  const petaKirim = new Map(
    pengirimanPeriode.map((p) => [`${p.satuanKerja}|${p.periodeBulan}|${p.periodeTahun}`, p.status])
  );

  return (
    <main className={HALAMAN}>
      <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Uang Lembur
        {/* Dasar hukumnya di ikon, bukan di deskripsi - sama dengan halaman
            Presensi. Yang di sini penting justru saat DIPERIKSA, dan lembur
            punya satu hal yang tidak dimiliki halaman lain: sebagian
            aturannya belum punya dokumen, dan itu disebut apa adanya. */}
        <SumberAcuan
          judulKeterangan="Tentang uang lembur"
          keterangan={[
            "Jam lembur dibulatkan ke bawah.",
            "Sisa menit yang tidak genap satu jam tidak dibayar.",
            "Lembur hari kerja: dihitung dari jam pulang dikurangi batas checkout, dan hanya untuk hari WFO.",
            "Lembur hari libur: dihitung dari jam masuk sampai jam pulang, istirahat tidak dipotong.",
            "Angka yang ditampilkan adalah jam lembur terhitung, bukan hak bayar.",
            "Data berasal dari e-Presensi dan koreksi manual.",
            ...(satkerWajib
              ? [`Data yang ditampilkan hanya pegawai ${satkerWajib}.`]
              : []),
          ]}
          acuan={[
            { aturan: "SBM 2026 item 23.1 (PMK 32/2025)", tentang: "Tarif uang lembur per jam: Gol I 18rb, II 24rb, III 30rb, IV 36rb" },
            { aturan: "SBM 2026 item 23.1", tentang: "Uang lembur hanya berdasarkan SURAT PERINTAH dari pejabat yang berwenang" },
            { aturan: "SBM 2026 item 23.2", tentang: "Uang makan lembur: minimal 2 jam berturut-turut, paling banyak 1 kali per hari" },
            { aturan: "Pasal 9 Permenaker 15/2024", tentang: "Jam kerja 07:30-16:00 (Jumat 16:30) - menentukan kapan lembur mulai dihitung" },
            { aturan: "BELUM ADA DOKUMENNYA", tentang: "Pengali jam pertama 1,5x, jam berikutnya 2x, dan hari libur 2x - keputusan internal, tidak diatur SBM" },
          ]}
          catatan="SBM 2026 tidak menetapkan batas jam lembur per hari, minggu, maupun bulan - sudah dicek ke seluruh isi PMK 32/2025. Yang membatasi surat perintah lembur, diverifikasi petugas di luar sistem ini."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">Di luar Tunjangan Kinerja &middot; dibayar tersendiri</p>
      <p className="mt-2 text-sm text-biru">
        Pantau jam lembur per pegawai berdasarkan e-Presensi dan koreksi manual.
      </p>

      {/* Kartunya TETAP ADA walau nominalnya sekarang tampil - cuma
          bunyinya yang berganti. Angka yang sudah terlihat justru lebih perlu
          keterangan daripada angka yang disembunyikan: yang disembunyikan
          tidak bisa dikutip, yang terlihat bisa - jadi alasan kenapa ia belum
          boleh dikutip harus berdiri di sebelahnya. */}
      <div className="card mt-4 border-l-4 border-l-gold p-4">
        {TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN ? (
          <>
            <p className="text-sm font-bold text-ink">Nominal belum final</p>
            <p className="mt-1 text-sm text-muted">{CATATAN_UANG_LEMBUR_BELUM_FINAL}</p>
          </>
        ) : (
          <>
            <p className="text-sm font-bold text-ink">Nominal rupiah belum ditampilkan</p>
            <p className="mt-1 text-sm text-muted">{ALASAN_UANG_LEMBUR_DISEMBUNYIKAN}</p>
          </>
        )}
      </div>

      {/* wajibPeriode: halaman ini selalu jatuh ke satu periode, jadi "Semua
          bulan" bukan pilihan yang lebih longgar melainkan pilihan yang bohong. */}
      <FilterBar
        wajibPeriode
        satuanKerjaList={satuanKerjaList}
        bulan={String(periodeBulan)}
        tahun={String(periodeTahun)}
        satker={satkerEfektif}
      />

      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Unitnya ikut disebut, dan kalau tidak ada yang dipilih
              disebut APA ADANYA sebagai seluruh satuan kerja - bukan
              dihilangkan. Judul "Lembur Juli 2026" polos terbaca seperti satu
              unit tertentu, padahal isinya 82 unit sekaligus. Nama unitnya
              utuh, tidak disingkat (lihat konvensi UI: dua direktorat bisa
              punya beberapa kata pertama yang sama persis). */}
          <h2 className="text-lg font-extrabold tracking-tight text-navy">
            Lembur {satkerEfektif ?? "Seluruh Satuan Kerja"}{" "}
            {NAMA_BULAN[periodeBulan - 1] ?? periodeBulan} {periodeTahun}
          </h2>
          <span className="text-xs text-muted">{kalkulasiList.length} pegawai</span>
        </div>

        <div className="card mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-3 py-2.5">Pegawai</th>
                  {/* TIDAK ADA kolom Periode: seluruh tabel sekarang satu
                      periode, jadi kolom itu mengulang nilai yang sama di tiap
                      baris. Periodenya disebut sekali di judul tabel. */}
                  {/* DIPISAH hari kerja vs hari libur karena keduanya
                      dihitung dengan cara yang BERBEDA, bukan sekadar dua
                      wadah jam yang sama:
                        - hari kerja : jam pulang dikurangi batas checkout
                          (hanya WFO, dan batasnya bergeser ikut jam datang);
                        - hari libur : jam masuk sampai jam pulang, istirahat
                          tidak dipotong.
                      Digabung jadi satu angka, dua kekeliruan yang berbeda
                      jenis tampil identik di layar. Total tetap ada di kolom
                      sebelahnya supaya penjumlahannya bisa diadu. */}
                  <th className="px-3 py-2.5">Lembur hari kerja</th>
                  <th className="px-3 py-2.5">Lembur hari libur</th>
                  <th className="px-3 py-2.5">Jam dibayar</th>
                  {TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN && <th className="px-3 py-2.5">Nominal</th>}
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {halamanIni.length === 0 && (
                  <tr>
                    <td
                      colSpan={TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN ? 6 : 5}
                      className="px-3 py-6 text-center text-muted"
                    >
                      Belum ada hasil kalkulasi untuk filter ini. Coba ubah periode atau satuan kerjanya.
                    </td>
                  </tr>
                )}
                {halamanIni.map((k) => {
                  const keadaanKirim = keadaanKirimBaris(
                    petaKirim.get(`${k.pegawai.satuanKerja}|${k.periodeBulan}|${k.periodeTahun}`)
                  );
                  return (
                    <tr key={k.id} className="border-b border-line-2">
                      <td className="col-nama px-3 py-2.5">
                        {/* Tertaut ke rincian presensinya, bukan halaman mati:
                            jam lembur di baris ini turunan dari ketukan hari
                            per hari, dan di situlah asalnya bisa diperiksa. */}
                        <Link
                          href={`/tukin/presensi/${k.pegawai.nip}?bulan=${k.periodeBulan}&tahun=${k.periodeTahun}&rinci=1`}
                          className="font-semibold text-teal-deep underline"
                        >
                          {k.pegawai.nama}
                        </Link>
                        <span className="block font-mono text-xs text-muted">{k.pegawai.nip}</span>
                        {k.catatanAnomali && (
                          <span className="mt-1 block max-w-md whitespace-normal rounded-lg bg-gold-tint px-2 py-1 text-[11px] font-medium text-gold-deep">
                            {k.catatanAnomali}
                          </span>
                        )}
                      </td>
                      {/* JAM DULU, BARU RUPIAH - rupiahnya turunan dari jam,
                          jadi jam satu-satunya angka yang bisa diadu balik ke
                          rekap presensi. Nominal sendirian tidak bisa dibantah:
                          tidak ada yang bisa ditunjuk keliru. */}
                      <td className="px-3 py-2.5 font-mono text-ink-2">{lemburTeks(k.jamLemburHariKerja)}</td>
                      <td className="px-3 py-2.5 font-mono text-ink-2">{lemburTeks(k.jamLemburHariLibur)}</td>
                      <td className="px-3 py-2.5 font-mono font-semibold text-ink">{lemburTeks(k.totalJamLembur)}</td>
                      {TAMPILKAN_NOMINAL_LEMBUR_PEMANTAUAN && (
                        <td className="px-3 py-2.5 font-mono font-semibold text-ink">
                          {formatRupiah(k.totalUangLembur)}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        <BadgeStatusKirim keadaan={keadaanKirim} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line-2 px-4 py-3 sm:px-6">
            <Paginasi
              basePath="/uang-lembur"
              params={paramPaginasi}
              info={paginasi}
              totalBaris={kalkulasiList.length}
              labelBaris="pegawai"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
