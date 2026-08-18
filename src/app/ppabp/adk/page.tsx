import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { SearchableSelect } from "../../SearchableSelect";
import { canGenerateAdk, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";
import { periodePunyaTukin, resolvePeriode } from "../../periodeDefault";
import { kelompokkanPerBank } from "../../../business-logic/rekeningPegawai";
import { akhirPekan } from "../../../business-logic/adkHarian";
import { STATUS_BERHAK_UANG_MAKAN } from "./statusUangMakan";
import { dataUangMakanHarian } from "./dataUangMakanHarian";
import { GridAdkHarian } from "./GridAdkHarian";

export const dynamic = "force-dynamic";

export default async function ExportAdkPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string }>;
}) {
  const { bulan, tahun } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canGenerateAdk(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengekspor ADK." />;
  }

  // Halaman ini mengekspor kalkulasi Tukin, jadi periode defaultnya ikut
  // periode yang memang punya kalkulasi - bukan bulan berjalan, yang tombol
  // downloadnya pasti menghasilkan file kosong.
  const periode = resolvePeriode(bulan, tahun, await periodePunyaTukin());
  const periodeBulan = String(periode.bulan);
  const periodeTahun = String(periode.tahun);
  const query = `bulan=${periodeBulan}&tahun=${periodeTahun}`;

  // Bank yang BENAR-BENAR ada di data periode ini - tombol per bank
  // diturunkan dari sini, BUKAN dari daftar bank yang dihardcode. Kalau
  // banknya berubah/nambah, UI ikut sendiri dan tidak ada tombol mati.
  //
  // SAKTI SPP cuma bisa memproses SPP per bank, jadi pemisahan ini bukan
  // kenyamanan - tanpa itu filenya tidak terpakai.
  const tukinPeriode = await prisma.tukinCalculation.findMany({
    where: { periodeBulan: Number(periodeBulan), periodeTahun: Number(periodeTahun), status: "APPROVED" },
    select: { pegawaiId: true },
  });
  const rekeningTukin = await prisma.rekeningPegawai.findMany({
    where: { jenisPembayaran: "TUKIN", pegawaiId: { in: tukinPeriode.map((t) => t.pegawaiId) } },
    select: { pegawaiId: true, kodeBankSpan: true, namaBank: true },
  });
  const bankTukin = kelompokkanPerBank(rekeningTukin);
  const tanpaRekening = tukinPeriode.length - rekeningTukin.length;

  // Ringkasan isi ADK harian - ditampilkan SEBELUM diunduh, supaya file kosong
  // atau nyaris kosong ketahuan di halaman ini, bukan setelah dibuka di Excel.
  const bln = Number(periodeBulan);
  const thn = Number(periodeTahun);
  const awalPeriode = new Date(Date.UTC(thn, bln - 1, 1));
  const akhirPeriode = new Date(Date.UTC(thn, bln, 1));
  // Pratinjau isi ADK Uang Makan - dari fungsi yang SAMA dengan yang menyusun
  // berkasnya, jadi yang terlihat di layar persis yang terunduh.
  const pratinjauUm = await dataUangMakanHarian(bln, thn);

  const [umApproved, lemburApproved, hariUm, hariLembur] = await Promise.all([
    prisma.uangMakan.count({ where: { periodeBulan: bln, periodeTahun: thn, status: "APPROVED" } }),
    prisma.uangLembur.count({ where: { periodeBulan: bln, periodeTahun: thn, status: "APPROVED" } }),
    prisma.presensiHarian.count({
      where: {
        tanggal: { gte: awalPeriode, lt: akhirPeriode },
        statusKehadiran: { in: [...STATUS_BERHAK_UANG_MAKAN] },
      },
    }),
    prisma.presensiHarian.findMany({
      where: { tanggal: { gte: awalPeriode, lt: akhirPeriode }, jamLembur: { gt: 0 } },
      select: { tanggal: true },
    }),
  ]);
  const jamLemburHariKerja = hariLembur.filter((h) => !akhirPekan(h.tanggal.toISOString().slice(0, 10))).length;
  const ringkasUm = `${umApproved} pegawai APPROVED, ${hariUm.toLocaleString("id-ID")} hari hadir tercatat di periode ini.`;
  const ringkasLembur = `${lemburApproved} pegawai APPROVED, ${hariLembur.length} hari lembur tercatat (${jamLemburHariKerja} di hari kerja).`;
  const lemburSepi = lemburApproved > 0 && jamLemburHariKerja < 20;

  // Berapa yang SUDAH dihitung tapi BELUM disetujui. Tanpa angka ini, periode
  // yang belum melewati approval tidak bisa dibedakan dari periode yang memang
  // belum pernah dihitung - dua keadaan dengan jalan keluar yang berbeda.
  const [tukinDraft, umDraft, lemburDraft] = await Promise.all([
    prisma.tukinCalculation.count({ where: { periodeBulan: bln, periodeTahun: thn, status: { not: "APPROVED" } } }),
    prisma.uangMakan.count({ where: { periodeBulan: bln, periodeTahun: thn, status: { not: "APPROVED" } } }),
    prisma.uangLembur.count({ where: { periodeBulan: bln, periodeTahun: thn, status: { not: "APPROVED" } } }),
  ]);
  const totalApproved = tukinPeriode.length + umApproved + lemburApproved;
  const totalBelumApproved = tukinDraft + umDraft + lemburDraft;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Export ADK</h1>
      <p className="mt-1 text-sm text-muted">
        Kalkulasi yang sudah <strong>APPROVED</strong> untuk diunggah manual ke Web Gaji (belum ada koneksi API
        resmi). Tiap jenis tersedia dalam <strong>Excel</strong> (.xlsx) dan <strong>TXT</strong> - isinya identik,
        cuma bungkusnya beda. Bentuk filenya berbeda per jenis, mengikuti template asli masing-masing.
      </p>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="field-label">Bulan</label>
          <SearchableSelect
            name="bulan"
            className="w-40"
            options={NAMA_BULAN.map((nama, index) => ({ value: String(index + 1), label: nama }))}
            defaultValue={String(periodeBulan)}
          />
        </div>
        <div>
          <label className="field-label">Tahun</label>
          <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-24 py-1.5" />
        </div>
        <button type="submit" className="btn btn-primary">
          Terapkan periode
        </button>
      </form>

      {totalApproved === 0 && (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">
            Semua file untuk periode {NAMA_BULAN[Number(periodeBulan) - 1]} {periodeTahun} akan KOSONG
          </p>
          {totalBelumApproved === 0 ? (
            <p className="mt-1 text-sm text-muted">
              Periode ini <strong>belum punya kalkulasi sama sekali</strong>. Jalankan dulu Kalkulasi Unit di{" "}
              <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
                Kalkulasi
              </Link>
              , lalu lewati approval berjenjang, baru filenya ada isinya.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Kalkulasinya <strong>sudah ada</strong> ({tukinPeriode.length + tukinDraft} Tukin,{" "}
                {umApproved + umDraft} Uang Makan, {lemburApproved + lemburDraft} Uang Lembur) tapi{" "}
                <strong>belum satupun disetujui</strong>. ADK sengaja hanya memuat baris berstatus{" "}
                <strong>APPROVED</strong> - angka yang belum disetujui tidak boleh dikirim ke Web Gaji, dan itu
                bukan sesuatu yang bisa dilewati dari halaman ini.
              </p>
              <p className="mt-2 text-sm text-muted">
                Jalankan approval berjenjang dulu di{" "}
                <Link href={`/tukin?${query}`} className="font-semibold text-teal-deep underline">
                  Dashboard Tukin
                </Link>
                ,{" "}
                <Link href={`/uang-makan?${query}`} className="font-semibold text-teal-deep underline">
                  Uang Makan
                </Link>
                , dan{" "}
                <Link href={`/uang-lembur?${query}`} className="font-semibold text-teal-deep underline">
                  Uang Lembur
                </Link>
                .
              </p>
            </>
          )}
        </div>
      )}

      {/* Panel rekening cuma relevan kalau memang ADA tukin yang disetujui.
          Kalau tidak, "belum ada rekening" menyuruh orang mengurus rekening
          padahal yang kurang persetujuan - salah alamat, dan waktunya habis di
          tempat yang bukan penyebabnya. */}
      {tukinPeriode.length === 0 ? null : bankTukin.length === 0 ? (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">Belum ada rekening tukin untuk periode ini</p>
          <p className="mt-1 text-sm text-muted">
            Tanpa data rekening, kolom rekening di ADK akan kosong dan Web Gaji tidak bisa memproses pembayarannya -
            dan file tidak bisa dipisah per bank, padahal SAKTI SPP hanya memproses per bank. Upload dulu di{" "}
            <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
              Rekening Pegawai
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="card mt-4 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Bank penerima tukin periode ini</p>
          <ul className="mt-2 space-y-1 text-sm text-ink-2">
            {bankTukin.map((b) => (
              <li key={b.kodeBankSpan}>
                {b.namaBank} <span className="font-mono text-xs text-muted">({b.kodeBankSpan})</span>:{" "}
                <span className="font-semibold text-ink">{b.jumlah} pegawai</span>
              </li>
            ))}
          </ul>
          {tanpaRekening > 0 && (
            <p className="mt-2 rounded-lg bg-gold-tint px-3 py-2 text-sm text-ink-2">
              <span className="font-semibold">{tanpaRekening} pegawai</span> berstatus APPROVED tapi rekening tukinnya
              belum terdaftar - mereka TIDAK masuk file per bank manapun, dan kolom rekeningnya kosong di file
              &quot;semua bank&quot;. Lengkapi di{" "}
              <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
                Rekening Pegawai
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <div className="card mt-4 divide-y divide-line-2">
        <BarisAdk
          judul="ADK Tunjangan Kinerja - semua bank"
          keterangan="Format daftar bayar 22 kolom. Berisi semua bank sekaligus - untuk pengecekan internal, BUKAN untuk diproses di SAKTI."
          href={`/ppabp/adk/tukin?${query}`}
        />
        {bankTukin.map((b) => (
          <BarisAdk
            key={b.kodeBankSpan}
            judul={`ADK Tukin - ${b.namaBank}`}
            keterangan={`${b.jumlah} pegawai - kode bank SPAN ${b.kodeBankSpan}. Inilah yang dipakai untuk SPP di SAKTI.`}
            href={`/ppabp/adk/tukin?${query}&bank=${encodeURIComponent(b.kodeBankSpan)}`}
          />
        ))}
        <BarisAdk
          judul="ADK Uang Makan"
          keterangan={`Satu baris per pegawai per hari: NIP + tanggal. ${ringkasUm}`}
          href={`/ppabp/adk/uang-makan?${query}`}
        />
        <BarisAdk
          judul="ADK Uang Lembur"
          keterangan={`Satu baris per pegawai per hari: NIP + tanggal + jumlah jam. ${ringkasLembur}`}
          href={`/ppabp/adk/uang-lembur?${query}`}
        />
      </div>

      {/* Pratinjau isi berkas SEBELUM diunduh. Bentuk panjangnya (2.000+ baris
          NIP+tanggal) tidak bisa diperiksa manusia; grid ini bentuk yang sama
          dengan sheet "depan" di berkasnya. */}
      {pratinjauUm.pegawai.length > 0 && (
        <details className="card mt-4 p-4" open>
          <summary className="cursor-pointer text-sm font-bold text-ink">
            Pratinjau isi ADK Uang Makan - {pratinjauUm.totalBaris.toLocaleString("id-ID")} baris,{" "}
            {pratinjauUm.pegawai.length} pegawai
          </summary>
          <p className="mt-1 text-xs text-muted">
            Ini isi berkas yang akan diunduh, disusun oleh fungsi yang sama - bukan hitungan terpisah. Angka{" "}
            <strong>1</strong> = hari berhak uang makan (WFO/WFH/WFA di hari kerja).
          </p>

          {pratinjauUm.tanpaHari > 0 && (
            <p className="mt-2 rounded-lg bg-gold-tint px-2.5 py-1.5 text-xs font-medium text-gold-deep">
              {pratinjauUm.tanpaHari} pegawai sudah APPROVED tapi <strong>nol hari</strong> di periode ini - barisnya
              kosong di berkas. Cek presensinya sebelum dikirim.
            </p>
          )}

          {pratinjauUm.selisih.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300 bg-gold-tint p-2.5 text-xs text-ink-2 dark:border-amber-800">
              <p className="font-semibold">
                {pratinjauUm.selisih.length} pegawai: jumlah tanggal di berkas BEDA dari hari yang disetujui
              </p>
              <p className="mt-0.5">
                Yang dibayar Web Gaji adalah jumlah tanggal di berkas ini, bukan angka yang di-approve. Biasanya
                artinya presensinya berubah setelah uang makan terakhir dihitung - hitung ulang dulu kalau begitu.
              </p>
              <ul className="mt-1 space-y-0.5">
                {pratinjauUm.selisih.slice(0, 8).map((s) => (
                  <li key={s.nip}>
                    {s.nama}: berkas <strong>{s.diBerkas}</strong> hari, disetujui <strong>{s.disetujui}</strong> hari
                  </li>
                ))}
                {pratinjauUm.selisih.length > 8 && <li>...dan {pratinjauUm.selisih.length - 8} lainnya.</li>}
              </ul>
            </div>
          )}

          <GridAdkHarian
            pegawai={pratinjauUm.pegawai}
            periodeBulan={bln}
            periodeTahun={thn}
            denganJam={false}
          />
        </details>
      )}

      <div className="card mt-4 border-l-4 border-l-teal-deep p-4">
        <p className="text-sm font-bold text-ink">
          Uang Makan &amp; Uang Lembur formatnya BEDA dari ADK Tukin
        </p>
        <p className="mt-1 text-sm text-muted">
          Keduanya mengikuti template asli PPABP (<span className="font-mono text-xs">Template-ADK-UM</span> dan{" "}
          <span className="font-mono text-xs">Template-ADK-Lembur</span>): daftar per hari,{" "}
          <strong>tanpa rupiah, tanpa tarif, tanpa baris total, tanpa baris header</strong>. Web Gaji yang menghitung
          nominalnya sendiri dari grade pegawai - file ini cuma menyetorkan fakta harian. Karena tidak ada perintah
          bayar di dalamnya, keduanya juga <strong>tidak dipisah per bank</strong> seperti ADK Tukin. Versi Excel-nya
          berisi dua sheet: <span className="font-mono text-xs">hasil</span> (isi yang disetor, sama persis dengan
          TXT) dan <span className="font-mono text-xs">depan</span> (grid per tanggal buat diperiksa).
        </p>
      </div>

      {lemburSepi && (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">Isi ADK Uang Lembur kemungkinan besar jauh lebih sedikit</p>
          <p className="mt-1 text-sm text-muted">
            Gajihub menghitung lembur hanya dari baris berstatus <strong>&quot;Lembur&quot;</strong> di e-Presensi. Di
            lapangan, lembur <strong>hari kerja</strong> hampir tidak pernah ditandai begitu - pegawainya tercatat WFO
            lalu pulang malam. Periode ini cuma{" "}
            <span className="font-semibold text-ink">{jamLemburHariKerja} hari lembur di hari kerja</span> yang
            tercatat se-kementerian, sementara satu file ADK asli (Biro Keuangan, Juni 2026) memuat 109 baris.
            Sumber sahnya adalah <strong>surat perintah lembur</strong>, yang tidak ada di database manapun - jadi
            file ini belum bisa menggantikan pengisian manual sampai sumber itu masuk ke Gajihub.
          </p>
        </div>
      )}
    </main>
  );
}

/**
 * Satu baris jenis ADK dengan DUA tombol format. Keduanya menunjuk ke Route
 * Handler yang sama, cuma beda `?format=` - jadi isinya dijamin identik
 * (barisnya disusun sekali di src/business-logic/adk.ts).
 *
 * Tetap `<a href>` biasa, bukan tombol ber-JavaScript, supaya download tetap
 * jalan tanpa JS - konsisten dengan halaman lain di proyek ini.
 */
function BarisAdk({ judul, keterangan, href }: { judul: string; keterangan: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-bold text-ink">{judul}</p>
        <p className="text-xs text-muted">{keterangan}</p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <a href={`${href}&format=xlsx`} className="btn btn-primary btn-sm">
          Excel (.xlsx)
        </a>
        <a href={`${href}&format=txt`} className="btn btn-ghost btn-sm">
          TXT
        </a>
      </div>
    </div>
  );
}
