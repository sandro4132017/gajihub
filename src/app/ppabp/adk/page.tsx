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
import { PratinjauAdkUangMakan } from "./PratinjauAdkUangMakan";
import { TAMPILKAN_ADK_LEMBUR, TAMPILKAN_NOMINAL_LEMBUR } from "../../tampilUangLembur";
import { PapanProgres } from "../../kasubag/kirim/PapanProgres";
import { rangkumProgres } from "../../../business-logic/pengirimanUnit";
import { canKembalikanRekapUnit } from "../../../auth/permissions";
import { satkerTerkirim, sempitkanKeSatker, whereIkutAdk } from "./satkerTerkirim";
import {
  JENIS_PEGAWAI_ADK,
  bacaJenisPegawai,
  labelJenisPegawai,
  wherePegawaiTanpaJenis,
} from "./jenisPegawaiAdk";

export const dynamic = "force-dynamic";

/**
 * Jenis berkas ADK yang bisa diunduh dari halaman ini.
 *
 * `perBank` bukan sekadar penanda tampilan: hanya ADK Tukin yang memuat
 * perintah bayar (rekening + nilai uang), dan hanya perintah bayar yang perlu
 * dipecah per bank karena SAKTI SPP memprosesnya per bank. Uang Makan & Uang
 * Lembur menyetorkan fakta harian tanpa rupiah - memecahnya per bank tidak
 * menghasilkan apa-apa selain berkas yang salah bentuk.
 */
type JenisBerkasAdk = "tukin" | "uang-makan" | "uang-lembur";

const BERKAS_ADK: readonly { kode: JenisBerkasAdk; label: string; perBank: boolean }[] = [
  { kode: "tukin", label: "Tunjangan Kinerja", perBank: true },
  { kode: "uang-makan", label: "Uang Makan", perBank: false },
  { kode: "uang-lembur", label: "Uang Lembur", perBank: false },
] as const;

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

  // --- TIGA PENYARING BERKAS ----------------------------------------------
  //
  // Dulu halaman ini menampilkan SEMUA kemungkinan berkas sekaligus sebagai
  // daftar tombol: satu untuk Tukin semua bank, satu per bank, satu untuk
  // Uang Makan. Dengan bertambahnya pemisahan PNS/P3K daftar itu jadi
  // perkalian - 2 jenis pegawai x (1 + jumlah bank) x jenis ADK - dan yang
  // dicari orang tenggelam di antara tombol yang tidak dia butuhkan.
  //
  // Sekarang: pilih, lalu unduh SATU berkas. Penyaringnya lewat query string
  // dan formnya `method="get"` biasa - halaman ini tetap bekerja tanpa
  // JavaScript, sama seperti tombol unduhnya yang tetap `<a href>`.
  const jenisPegawai = bacaJenisPegawai(jenis ?? null);
  const adkDipilih: JenisBerkasAdk =
    adk === "uang-makan" || (adk === "uang-lembur" && TAMPILKAN_ADK_LEMBUR) ? adk : "tukin";
  // Bank hanya berlaku untuk Tukin. Uang Makan & Uang Lembur tidak memuat
  // perintah bayar sama sekali, jadi tidak ada yang bisa dipisah per bank -
  // lihat keterangan di bawah halaman. Nilai yang tertinggal di URL dari
  // pilihan sebelumnya sengaja diabaikan, bukan dipakai diam-diam.
  const bankDipilih = adkDipilih === "tukin" ? (bank ?? "") : "";

  // Bank yang BENAR-BENAR ada di data periode ini - tombol per bank
  // diturunkan dari sini, BUKAN dari daftar bank yang dihardcode. Kalau
  // banknya berubah/nambah, UI ikut sendiri dan tidak ada tombol mati.
  //
  // SAKTI SPP cuma bisa memproses SPP per bank, jadi pemisahan ini bukan
  // kenyamanan - tanpa itu filenya tidak terpakai.
  // Populasi yang IKUT ke berkas - gerbangnya pengiriman unit, bukan lagi
  // status APPROVED per baris. Dipakai bersama oleh pemisahan bank di bawah
  // DAN oleh angka ringkasan, supaya keterangan di layar tidak bisa bercerita
  // beda dari isi berkas yang terunduh.
  const satkerBoleh = await satkerTerkirim(prisma, Number(periodeBulan), Number(periodeTahun));

  // PENYARING SATUAN KERJA. `satkerBoleh` tetap dipegang apa adanya untuk
  // angka "sudah dihitung tapi belum dikirim" di bawah - yang itu memang
  // bicara tentang SELURUH unit, bukan tentang unit yang sedang dilihat.
  // Yang menyempit cuma isi berkasnya.
  const { dipakai: satkerDipakai, terpilih: satkerTerpilih } = sempitkanKeSatker(satkerBoleh, satker);

  const tukinPeriode = await prisma.tukinCalculation.findMany({
    where: whereIkutAdk(Number(periodeBulan), Number(periodeTahun), satkerDipakai, jenisPegawai),
    select: { pegawaiId: true, pegawai: { select: { nip: true, nama: true } } },
  });
  const rekeningTukin = await prisma.rekeningPegawai.findMany({
    where: { jenisPembayaran: "TUKIN", pegawaiId: { in: tukinPeriode.map((t) => t.pegawaiId) } },
    select: { pegawaiId: true, kodeBankSpan: true, namaBank: true },
  });
  const bankTukin = kelompokkanPerBank(rekeningTukin);

  // SIAPA yang belum punya rekening tukin, bukan cuma BERAPA.
  //
  // Versi sebelumnya cuma menghitung selisih baris, dan angka telanjang
  // "1 pegawai" tidak bisa ditindaklanjuti: yang membacanya harus membuka
  // Rekening Pegawai lalu mencocokkan 47 nama satu per satu untuk menemukan
  // yang mana. Namanya ada di data yang sudah diambil - tidak menampilkannya
  // cuma memindahkan pekerjaan ke orangnya.
  const punyaRekening = new Set(rekeningTukin.map((r) => r.pegawaiId));
  const tanpaRekening = tukinPeriode.filter((t) => !punyaRekening.has(t.pegawaiId)).map((t) => t.pegawai);

  // Ringkasan isi ADK harian - ditampilkan SEBELUM diunduh, supaya file kosong
  // atau nyaris kosong ketahuan di halaman ini, bukan setelah dibuka di Excel.
  const bln = Number(periodeBulan);
  const thn = Number(periodeTahun);
  const awalPeriode = new Date(Date.UTC(thn, bln - 1, 1));
  const akhirPeriode = new Date(Date.UTC(thn, bln, 1));
  // Pratinjau isi ADK Uang Makan - dari fungsi yang SAMA dengan yang menyusun
  // berkasnya, jadi yang terlihat di layar persis yang terunduh.
  const pratinjauUm = await dataUangMakanHarian(bln, thn, satkerTerpilih || null, jenisPegawai);

  // CATATAN PERBAIKAN: dua angka di bawah dulu memakai POPULASI YANG BERBEDA
  // dan disandingkan dalam satu kalimat - jumlah pegawai disaring, jumlah hari
  // tidak. Hasilnya kalimat seperti "7 pegawai, 97.008 hari hadir", yang
  // membuat orang mengira berkasnya memuat 97 ribu baris. Sekarang keduanya
  // disaring dengan cara yang sama.
  const [umIkut, lemburIkut, hariUm, hariLembur] = await Promise.all([
    prisma.uangMakan.count({ where: whereIkutAdk(bln, thn, satkerDipakai, jenisPegawai) }),
    prisma.uangLembur.count({ where: whereIkutAdk(bln, thn, satkerDipakai, jenisPegawai) }),
    prisma.presensiHarian.count({
      where: {
        tanggal: { gte: awalPeriode, lt: akhirPeriode },
        statusKehadiran: { in: [...STATUS_BERHAK_UANG_MAKAN] },
        pegawai: { satuanKerja: { in: satkerDipakai } },
      },
    }),
    prisma.presensiHarian.findMany({
      where: {
        tanggal: { gte: awalPeriode, lt: akhirPeriode },
        jamLembur: { gt: 0 },
        pegawai: { satuanKerja: { in: satkerDipakai } },
      },
      select: { tanggal: true },
    }),
  ]);
  const jamLemburHariKerja = hariLembur.filter((h) => !akhirPekan(h.tanggal.toISOString().slice(0, 10))).length;
  const ringkasUm = `${umIkut} pegawai dari unit yang sudah mengirim, ${hariUm.toLocaleString("id-ID")} hari hadir mereka di periode ini.`;
  const ringkasLembur = `${lemburIkut} pegawai dari unit yang sudah mengirim, ${hariLembur.length} hari lembur (${jamLemburHariKerja} di hari kerja).`;
  const lemburSepi = lemburIkut > 0 && jamLemburHariKerja < 20;

  // Berapa yang SUDAH dihitung tapi unitnya BELUM mengirim. Tanpa angka ini,
  // periode yang tinggal menunggu unit menekan Kirim tidak bisa dibedakan dari
  // periode yang memang belum pernah dihitung - dua keadaan dengan jalan
  // keluar yang sama sekali berbeda.
  const belumKirim = { periodeBulan: bln, periodeTahun: thn, pegawai: { satuanKerja: { notIn: satkerBoleh } } };
  const [tukinDraft, umDraft, lemburDraft] = await Promise.all([
    prisma.tukinCalculation.count({ where: belumKirim }),
    prisma.uangMakan.count({ where: belumKirim }),
    prisma.uangLembur.count({ where: belumKirim }),
  ]);
  const totalApproved = tukinPeriode.length + umIkut + lemburIkut;
  const totalBelumApproved = tukinDraft + umDraft + lemburDraft;

  // --- Berapa yang TERSINGKIR oleh penyaring jenis -------------------------
  //
  // Pegawai yang belum tercakup berkas basis data gaji tidak punya jenis
  // kepegawaian yang bisa dipercaya, jadi begitu penyaring dipakai mereka
  // keluar dari berkas - lihat alasan lengkapnya di ./jenisPegawaiAdk.ts.
  //
  // NAMANYA yang ditampilkan, bukan cuma jumlahnya. Orang yang memilih
  // "ADK PNS" tidak punya cara lain mengetahui berkasnya kehilangan siapa;
  // angka telanjang cuma memindahkan pekerjaan mencocokkan nama kepadanya,
  // dan yang tersisa adalah menemukannya bulan depan lewat pegawai yang
  // menelepon karena tidak dibayar.
  //
  // Cuma dijalankan untuk jenis ADK YANG SEDANG DIPILIH, dan cuma kalau
  // penyaringnya memang dipakai - tanpa penyaring tidak ada yang tersingkir.
  const whereTanpaJenis = {
    periodeBulan: bln,
    periodeTahun: thn,
    pegawai: { satuanKerja: { in: satkerDipakai }, ...wherePegawaiTanpaJenis() },
  };
  const pilihPegawai = { pegawai: { select: { nip: true, nama: true } } } as const;
  const tanpaJenisBerkas = !jenisPegawai
    ? []
    : adkDipilih === "tukin"
      ? (await prisma.tukinCalculation.findMany({ where: whereTanpaJenis, select: pilihPegawai })).map(
          (r) => r.pegawai
        )
      : adkDipilih === "uang-makan"
        ? (await prisma.uangMakan.findMany({ where: whereTanpaJenis, select: pilihPegawai })).map(
            (r) => r.pegawai
          )
        : (await prisma.uangLembur.findMany({ where: whereTanpaJenis, select: pilihPegawai })).map(
            (r) => r.pegawai
          );

  // --- Berkas yang sedang dipilih ------------------------------------------
  const berkasTersedia = BERKAS_ADK.filter((b) => b.kode !== "uang-lembur" || TAMPILKAN_ADK_LEMBUR);
  const berkas = BERKAS_ADK.find((b) => b.kode === adkDipilih)!;
  const bankTerpilih = bankTukin.find((b) => b.kodeBankSpan === bankDipilih) ?? null;

  const jumlahBerkas =
    adkDipilih === "tukin"
      ? bankTerpilih
        ? bankTerpilih.jumlah
        : tukinPeriode.length
      : adkDipilih === "uang-makan"
        ? umIkut
        : lemburIkut;
  const keteranganBerkas =
    adkDipilih === "tukin"
      ? bankTerpilih
        ? `Format daftar bayar 21 kolom - kode bank SPAN ${bankTerpilih.kodeBankSpan}. Inilah yang dipakai untuk SPP di SAKTI.`
        : "Format daftar bayar 21 kolom, semua bank sekaligus - untuk pengecekan internal, BUKAN untuk diproses di SAKTI."
      : adkDipilih === "uang-makan"
        ? `Satu baris per pegawai per hari: NIP + tanggal. ${ringkasUm}`
        : `Satu baris per pegawai per hari: NIP + tanggal + jumlah jam. ${ringkasLembur}`;

  // Tautan unduh disusun dari penyaring yang sedang aktif. Parameter yang
  // tidak dipakai TIDAK ikut ditulis - URL yang memuat `jenis=` kosong akan
  // terbaca sebagai penyaring yang tidak menyaring apa-apa, dan itu bentuk
  // yang paling gampang salah dibaca kalau suatu saat ditempel ke tiket.
  const hrefBerkas = (format: "xlsx" | "txt") => {
    const p = new URLSearchParams({ bulan: periodeBulan, tahun: periodeTahun, format });
    if (satkerTerpilih) p.set("satker", satkerTerpilih);
    if (jenisPegawai) p.set("jenis", jenisPegawai);
    if (bankDipilih) p.set("bank", bankDipilih);
    return `/ppabp/adk/${adkDipilih}?${p.toString()}`;
  };

  // --- Papan progres pengiriman unit ---------------------------------------
  //
  // Daftar unitnya dari PEGAWAI, bukan dari baris pengiriman: unit yang belum
  // mengirim sama sekali tidak punya baris pengiriman, dan justru merekalah
  // yang perlu dilihat PPABP. Lihat catatan di rangkumProgres().
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
    new Map(barisPengiriman.map((b) => [b.satuanKerja, b]))
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Export ADK</h1>
      {/* "Belum ada koneksi API resmi ke Web Gaji" sengaja TIDAK ditulis di
          layar. Itu alasan teknis kenapa unggahannya manual, dan yang membuka
          halaman ini cuma perlu tahu instruksi akhirnya - alasannya tercatat
          di CLAUDE.md, tempatnya memang di sana. */}
      <p className="mt-1 text-sm text-muted">
        Menampilkan rekap unit yang telah <strong>dikirim &amp; dikunci</strong> oleh Kasubag TU untuk diunggah
        manual ke Web Gaji. Berkas tersedia dalam format <strong>Excel</strong> (.xlsx) dan <strong>TXT</strong>{" "}
        dengan isi yang identik, menyesuaikan template masing-masing jenis ADK.
      </p>

      <form method="get" className="card mt-4 p-4">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Filter ADK</p>
        {/* LEBARNYA DIHITUNG, bukan dikira-kira. Enam penyaring + tombol
            harus muat di satu baris pada kartu selebar max-w-6xl dikurangi
            sidebar dan padding - sekitar 1080px ruang isi:
              satker 208 + bulan 112 + tahun 80 + jenis ADK 160
              + jenis pegawai 144 + bank 160 + tombol ~106 + 6 jarak 60
              = 1030.
            Tetap `flex-wrap`: di layar yang lebih sempit barisnya membungkus
            sendiri, dan itu memang yang diinginkan - dipaksa satu baris di
            sana yang terjadi bukan rapi, tapi kolom yang saling gencet. */}
        <div className="mt-3 flex flex-wrap items-end gap-2.5">
          {/* PILIHANNYA CUMA UNIT YANG SUDAH MENGIRIM, bukan seluruh satuan
              kerja. Unit yang belum mengirim tidak punya satu baris pun di
              berkas periode ini, jadi memilihnya cuma menghasilkan berkas
              kosong tanpa keterangan. Pertanyaan "unit mana yang belum
              mengirim" sudah dijawab papan progres di bawah. */}
          <div>
            <label className="field-label" htmlFor="filter-satker">
              Satuan kerja
            </label>
            <SearchableSelect
              name="satker"
              className="w-52"
              options={[
                { value: "", label: "Semua satuan kerja" },
                ...satkerBoleh
                  .slice()
                  .sort((a, b) => a.localeCompare(b, "id-ID"))
                  .map((nama) => ({ value: nama, label: nama })),
              ]}
              defaultValue={satkerTerpilih}
            />
          </div>
          <div>
            <label className="field-label">Bulan</label>
            <SearchableSelect
              name="bulan"
              className="w-28"
              options={NAMA_BULAN.map((nama, index) => ({ value: String(index + 1), label: nama }))}
              defaultValue={String(periodeBulan)}
            />
          </div>
          <div>
            <label className="field-label">Tahun</label>
            <input type="number" name="tahun" defaultValue={periodeTahun} className="field-input w-20 py-1.5" />
          </div>
          <div>
            <label className="field-label" htmlFor="filter-adk">
              Jenis ADK
            </label>
            <select id="filter-adk" name="adk" defaultValue={adkDipilih} className="field-input w-40 py-1.5">
              {berkasTersedia.map((b) => (
                <option key={b.kode} value={b.kode}>
                  {b.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="filter-jenis">
              Jenis pegawai
            </label>
            <select
              id="filter-jenis"
              name="jenis"
              defaultValue={jenisPegawai ?? ""}
              className="field-input w-36 py-1.5"
            >
              <option value="">Semua pegawai</option>
              {JENIS_PEGAWAI_ADK.map((j) => (
                <option key={j.kode} value={j.kode}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>
          {/* Penyaring bank cuma muncul untuk berkas yang memang bisa dipisah
              per bank. Menampilkannya dalam keadaan mati untuk Uang Makan
              justru mengundang pertanyaan "kenapa tidak bisa?" tiap kali,
              sementara jawabannya sudah tertulis di bawah. */}
          {berkas.perBank && (
            <div>
              <label className="field-label" htmlFor="filter-bank">
                Bank
              </label>
              <select
                id="filter-bank"
                name="bank"
                defaultValue={bankDipilih}
                className="field-input w-40 py-1.5"
              >
                <option value="">Semua bank</option>
                {/* Cukup nama banknya. Jumlah pegawainya sudah disebut di
                    kartu berkas setelah pilihan diterapkan - menyebutnya dua
                    kali membuat daftar pilihan panjang tanpa menambah
                    keputusan yang bisa diambil dari situ. */}
                {bankTukin.map((b) => (
                  <option key={b.kodeBankSpan} value={b.kodeBankSpan}>
                    {b.namaBank}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn btn-primary">
            Terapkan
          </button>
        </div>
        {!berkas.perBank && (
          <p className="mt-2 text-xs text-muted">
            ADK {berkas.label} <strong>tidak dipisah per bank</strong> - berkasnya tidak memuat perintah bayar,
            nominalnya dihitung Web Gaji.
          </p>
        )}
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
              , lalu Kasubag TU menekan <strong>Kirim &amp; kunci</strong>, baru filenya ada isinya.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted">
                Kalkulasinya <strong>sudah ada</strong> ({tukinPeriode.length + tukinDraft} Tukin,{" "}
                {umIkut + umDraft} Uang Makan) tapi <strong>belum ada unit yang mengirimnya</strong>. ADK sengaja
                hanya memuat unit yang rekapnya sudah dikirim &amp; dikunci Kasubag TU - angka yang unitnya belum
                memeriksa tidak boleh sampai ke Web Gaji, dan itu bukan sesuatu yang bisa dilewati dari halaman
                ini.
              </p>
              <p className="mt-2 text-sm text-muted">
                Kasubag TU tiap unit yang menekan <strong>Kirim &amp; kunci</strong> di halaman Kalkulasi
                Unit - papan progres di bawah memperlihatkan unit mana yang belum. Angkanya bisa diperiksa
                dulu di{" "}
                <Link href={`/tukin?${query}`} className="font-semibold text-teal-deep underline">
                  Dashboard Tukin
                </Link>
                ,{" "}
                <Link href={`/uang-makan?${query}`} className="font-semibold text-teal-deep underline">
                  Uang Makan
                </Link>
                {TAMPILKAN_NOMINAL_LEMBUR ? (
                  <>
                    , dan{" "}
                    <Link href={`/uang-lembur?${query}`} className="font-semibold text-teal-deep underline">
                      Uang Lembur
                    </Link>
                  </>
                ) : null}
                .
              </p>
            </>
          )}
        </div>
      )}

      {/* Panel rekening cuma relevan kalau memang ADA unit yang sudah
          mengirim. Kalau tidak, "belum ada rekening" menyuruh orang mengurus
          rekening padahal yang kurang kiriman unit - salah alamat, dan
          waktunya habis di tempat yang bukan penyebabnya. */}
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
          {tanpaRekening.length > 0 && (
            <div className="mt-2 rounded-lg border border-gold bg-gold-tint px-3 py-2.5 text-sm text-ink-2">
              <p className="font-bold text-gold-deep">
                {tanpaRekening.length} pegawai belum memiliki rekening Tukin
              </p>
              {/* Nama DULU, penjelasan belakangan. Yang membaca ini butuh tahu
                  siapa yang harus diurus; kalimat akibatnya baru berguna
                  sesudah dia tahu namanya. Dipotong 8 - lebih dari itu
                  daftarnya jadi dinding nama dan yang perlu dibuka memang
                  halaman Rekening Pegawai, bukan kotak ini. */}
              <ul className="mt-1.5 space-y-0.5">
                {tanpaRekening.slice(0, 8).map((p) => (
                  <li key={p.nip}>
                    <span className="font-semibold text-ink">{p.nama}</span>{" "}
                    <span className="font-mono text-xs text-muted">({p.nip})</span>
                  </li>
                ))}
                {tanpaRekening.length > 8 && (
                  <li className="text-muted">...dan {tanpaRekening.length - 8} lainnya.</li>
                )}
              </ul>
              <p className="mt-2">
                Jika berkas diunduh saat ini,{" "}
                <strong>pegawai di atas tidak akan menerima pembayaran pada periode ini</strong>. Datanya tidak
                masuk ke berkas per bank yang diproses SAKTI, dan di berkas &quot;semua bank&quot; kolom
                rekeningnya kosong sehingga Web Gaji tidak memiliki tujuan transfer.
              </p>
              <p className="mt-1.5">
                <strong>Tindakan:</strong> lengkapi datanya di menu{" "}
                <Link href="/ppabp/rekening" className="font-semibold text-teal-deep underline">
                  Rekening Pegawai
                </Link>
                , lalu unduh ulang. Kalkulasi Tukin tidak perlu diulang - rekening dibaca saat berkas disusun.
              </p>
            </div>
          )}
        </div>
      )}

      <PapanProgres
        progres={progres}
        periodeBulan={bln}
        periodeTahun={thn}
        bolehKembalikan={canKembalikanRekapUnit(authUser)}
        // Tanpa `batasTampil` - memakai bawaan 3 baris. Aman walau kolom
        // "Tindakan" di sini berisi satu-satunya tombol yang bisa membuka
        // kiriman terkunci: urutannya menaikkan baris TERKIRIM - satu-satunya
        // yang punya tombol itu - ke atas begitu `bolehKembalikan` menyala,
        // dan sisanya tetap terjangkau lewat "Lihat semua". Lihat catatan
        // PRIORITAS di PapanProgres.
      />

      {/* SATU kartu untuk SATU berkas - hasil dari penyaring di atas.
          Menggantikan daftar tombol yang dulu memuat semua kemungkinan
          sekaligus; lihat catatan TIGA PENYARING di atas. */}
      <div className="card mt-4 border-l-4 border-l-navy p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink">
              ADK {berkas.label}
              {satkerTerpilih && <> - {satkerTerpilih}</>}
              {jenisPegawai && <> - {labelJenisPegawai(jenisPegawai)}</>}
              {bankTerpilih && <> - {bankTerpilih.namaBank}</>}
            </p>
            <p className="mt-0.5 text-xs text-muted">{keteranganBerkas}</p>
            <p className="mt-1.5 text-sm text-ink-2">
              <strong className="text-ink">{jumlahBerkas} pegawai</strong> masuk ke berkas ini, periode{" "}
              {NAMA_BULAN[bln - 1]} {thn}
              {satkerTerpilih ? "" : ", dari seluruh unit yang sudah mengirim"}.
            </p>
          </div>
          <div className="flex flex-none items-center gap-2">
            <a href={hrefBerkas("xlsx")} className="btn btn-primary btn-sm">
              Excel (.xlsx)
            </a>
            <a href={hrefBerkas("txt")} className="btn btn-ghost btn-sm">
              TXT
            </a>
          </div>
        </div>

        {/* Yang tersingkir oleh penyaring jenis. Ditaruh di kartu berkasnya,
            bukan di dekat penyaringnya: yang perlu tahu adalah orang yang
            sedang menatap tombol unduh. */}
        {tanpaJenisBerkas.length > 0 && (
          <div className="mt-3 rounded-lg border border-gold bg-gold-tint px-3 py-2.5 text-xs text-ink-2">
            <p className="text-sm font-bold text-gold-deep">
              {tanpaJenisBerkas.length} pegawai tidak ikut ke berkas ini
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {tanpaJenisBerkas.slice(0, 8).map((p) => (
                <li key={p.nip}>
                  <span className="font-semibold text-ink">{p.nama}</span>{" "}
                  <span className="font-mono text-[11px] text-muted">({p.nip})</span>
                </li>
              ))}
              {tanpaJenisBerkas.length > 8 && (
                <li className="text-muted">...dan {tanpaJenisBerkas.length - 8} lainnya.</li>
              )}
            </ul>
            <p className="mt-2">
              Jenis kepegawaiannya belum diketahui - pegawai di atas belum tercakup berkas basis data gaji.
              Gajihub tidak menetapkan jenisnya dari golongan, karena cara itu terbukti keliru pada sebagian
              pegawai dan akan menempatkan mereka di berkas yang salah.
            </p>
            <p className="mt-1.5">
              <strong>Tindakan:</strong> lengkapi datanya di menu{" "}
              <Link href="/ppabp/basis-data-gaji" className="font-semibold text-teal-deep underline">
                Basis Data Gaji
              </Link>
              , atau pilih &quot;Semua pegawai&quot; pada filter agar mereka tetap disertakan.
            </p>
          </div>
        )}

        {jumlahBerkas === 0 && (
          <p className="mt-3 rounded-lg bg-gold-tint px-3 py-2 text-xs font-medium text-gold-deep">
            Berkas ini akan <strong>kosong</strong> dengan pilihan sekarang.
          </p>
        )}
      </div>

      {/* Pratinjau isi berkas SEBELUM diunduh - bentuk panjangnya (2.000+
          baris NIP+tanggal) tidak bisa diperiksa manusia.

          TERTUTUP di halaman ini, terbuka di /uang-makan. Rumah pemeriksaannya
          memang di menu Uang Makan; di sini orang datang untuk mengunduh, dan
          grid 31 kolom yang terbuka sendiri cuma mendorong tombol unduhnya
          keluar layar.

          Yang kosong tidak diterangkan di sini - spanduk "semua file akan
          KOSONG" di atas sudah menjelaskannya lebih dulu dan lebih lengkap.
          Di /uang-makan tidak ada spanduk itu, jadi di sana kekosongannya
          yang bicara. */}
      {pratinjauUm.pegawai.length > 0 && (
        <PratinjauAdkUangMakan data={pratinjauUm} periodeBulan={bln} periodeTahun={thn} />
      )}

      <div className="card mt-4 border-l-4 border-l-teal-deep p-4">
        <p className="text-sm font-bold text-ink">
          Format ADK Uang Makan &amp; Uang Lembur BEDA dari ADK Tukin
        </p>
        {/* Butir, bukan paragraf: yang membuka halaman ini sedang mencari satu
            jawaban ("kenapa tidak ada rupiahnya?"), bukan membaca penjelasan
            dari awal. Aturannya ditebalkan di depan, alasannya menyusul
            sebagai kalimat pendukung. */}
        <ul className="mt-2 space-y-1.5 text-sm text-muted">
          <li>
            <strong className="text-ink-2">Format mentah PPABP.</strong> File hanya berisi fakta kehadiran
            harian - <strong>tanpa nominal rupiah, tarif, baris total, maupun header</strong>. Keduanya
            mengikuti template asli PPABP (<span className="font-mono text-xs">Template-ADK-UM</span> dan{" "}
            <span className="font-mono text-xs">Template-ADK-Lembur</span>).
          </li>
          <li>
            <strong className="text-ink-2">Tidak dipisah per bank.</strong> File ini tidak memuat perintah
            bayar, jadi tidak perlu dipecah seperti ADK Tukin. Nominalnya dihitung sendiri oleh Web Gaji dari
            grade pegawai.
          </li>
          <li>
            <strong className="text-ink-2">Struktur Excel: 2 sheet.</strong>{" "}
            <span className="font-mono text-xs">hasil</span> = isi yang disetor, persis sama dengan versi TXT.{" "}
            <span className="font-mono text-xs">depan</span> = grid per tanggal untuk pengecekan visual.
          </li>
        </ul>
      </div>

      {lemburSepi && (
        <div className="card mt-4 border-l-4 border-l-gold p-4">
          <p className="text-sm font-bold text-ink">
            Perhatian: data ADK Uang Lembur mungkin belum lengkap
          </p>
          {/* Ditutup dengan TINDAKAN, bukan penjelasan. Yang membaca ini
              sedang memutuskan apakah berkasnya bisa langsung dipakai, dan
              jawabannya - belum - harus terbaca tanpa menelusuri alasannya
              dulu. */}
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li>
              <strong className="text-ink-2">Yang bisa ditarik sekarang.</strong> Gajihub hanya membaca baris
              berstatus <strong>&quot;Lembur&quot;</strong> di e-Presensi. Periode ini tercatat{" "}
              <span className="font-semibold text-ink">{jamLemburHariKerja} hari lembur di hari kerja</span>{" "}
              se-kementerian.
            </li>
            <li>
              <strong className="text-ink-2">Kenapa begitu.</strong> Lembur hari kerja sering tercatat sebagai
              WFO biasa di lapangan, dan basis data surat perintah lembur belum terintegrasi ke Gajihub.
            </li>
            <li>
              <strong className="text-ink-2">Tindakan.</strong> Berkas ini{" "}
              <strong>belum bisa menggantikan pengisian manual</strong>. Data lembur tetap perlu dilengkapi
              berdasarkan surat perintah lembur fisik.
            </li>
          </ul>
        </div>
      )}
    </main>
  );
}
