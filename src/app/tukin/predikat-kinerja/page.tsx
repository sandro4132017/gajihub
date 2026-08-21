import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import {
  canBukaHalamanPredikatKinerja,
  canUploadRekapPredikatKinerja,
  type AuthUser,
} from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { NAMA_BULAN } from "../../bulan";
import { SearchableSelect } from "../../SearchableSelect";
import { UploadRekapForm } from "./UploadRekapForm";
import { AksiBarisPredikat } from "./AksiBarisPredikat";
import { TambahPredikatForm } from "./TambahPredikatForm";
import { HapusPeriodeForm } from "./HapusPeriodeForm";
import { LABEL_PREDIKAT, adalahInputManual, kelasChipPredikat, labelSumber } from "./predikat";
import { PencarianDebounce } from "../../PencarianDebounce";
import { SumberAcuan } from "../../SumberAcuan";

export const dynamic = "force-dynamic";

/**
 * PREDIKAT KINERJA - upload rekap penilaian dari e-Kinerja BKN, sumber bobot
 * 70% Tukin (Permenaker 15/2024 Pasal 6, konversi lewat Kepsekjen 82/2025).
 *
 * SATU halaman dipakai KASUBAG_TU dan PPABP (pola yang sama dengan
 * /pegawai - bukan dua salinan): yang membedakan cuma cakupan datanya, dan
 * itu diurus fungsi izin. KASUBAG_TU dipaksa ke unitnya sendiri di level
 * QUERY, PPABP/ADMIN lintas satker.
 */

/** Batas baris yang ditampilkan per halaman - satu satker bisa ratusan pegawai. */
const MAKS_BARIS_TAMPIL = 200;

/**
 * Batas opsi di dropdown "tambah predikat". Satu unit ±80 pegawai, jadi
 * angka ini longgar - gunanya cuma menjaga halaman tetap ringan kalau
 * dibuka untuk satker besar yang seluruh predikatnya belum diupload.
 */
const MAKS_OPSI_TAMBAH = 300;

function ChipPredikat({ predikat }: { predikat: string }) {
  return <span className={`chip ${kelasChipPredikat(predikat)}`}>{LABEL_PREDIKAT[predikat] ?? predikat}</span>;
}

export default async function PredikatKinerjaPage({
  searchParams,
}: {
  searchParams: Promise<{ bulan?: string; tahun?: string; satker?: string; q?: string }>;
}) {
  const { bulan, tahun, satker, q } = await searchParams;

  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!authUser || !canBukaHalamanPredikatKinerja(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola predikat kinerja." />;
  }

  // KASUBAG_TU dipaksa ke unitnya sendiri di level QUERY (bukan cuma
  // disembunyikan di UI) - sama pola dengan /pegawai.
  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  if (authUser.role === "KASUBAG_TU" && !satkerWajib) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {/* Cabang ini yang paling butuh jalan keluar: halamannya tidak bisa
            menampilkan apa-apa, dan tanpa tautan ini satu-satunya cara pergi
            adalah tombol Back browser. */}
        <Link href="/tukin" className="text-sm font-semibold text-teal-deep underline">
          &larr; Kembali ke Dashboard Tukin
        </Link>
        <h1 className="mt-2 text-xl font-extrabold tracking-tight text-ink">Predikat Kinerja</h1>
        <div className="card mt-4 border-l-4 border-l-gold p-5">
          <p className="font-bold text-ink">Akun kamu belum punya unit kerja</p>
          <p className="mt-1 text-sm text-muted">
            Role akun kamu Kasubag TU, tapi kolom satuan kerja akunnya masih kosong - jadi tidak ada pegawai yang bisa
            kamu kelola predikatnya. Minta Admin mengisinya lewat <strong>Kelola Assignment Role</strong>.
          </p>
        </div>
      </main>
    );
  }

  const periodeTersedia = await prisma.predikatKinerja.groupBy({
    by: ["periodeTahun", "periodeBulan"],
    where: satkerWajib ? { pegawai: { satuanKerja: satkerWajib } } : {},
    _count: { _all: true },
    orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
  });

  const periodeDefault = periodeTersedia[0];
  const periodeBulan = bulan ? Number(bulan) : periodeDefault?.periodeBulan;
  const periodeTahun = tahun ? Number(tahun) : periodeDefault?.periodeTahun;
  const adaPeriode = Number.isInteger(periodeBulan) && Number.isInteger(periodeTahun);

  // Satuan kerja yang benar-benar berlaku: Kasubag TU dipaksa ke unitnya,
  // role lintas satker memakai apa yang dipilih di filter (boleh kosong).
  const satkerEfektif = satkerWajib ?? (satker?.trim() || null);

  const filterPegawai: Prisma.PegawaiWhereInput = {};
  if (satkerEfektif) filterPegawai.satuanKerja = satkerEfektif;
  if (q?.trim()) {
    filterPegawai.OR = [{ nama: { contains: q.trim(), mode: "insensitive" } }, { nip: { contains: q.trim() } }];
  }

  const where: Prisma.PredikatKinerjaWhereInput = adaPeriode
    ? {
        periodeBulan: periodeBulan!,
        periodeTahun: periodeTahun!,
        ...(Object.keys(filterPegawai).length > 0 ? { pegawai: filterPegawai } : {}),
      }
    : { id: "___tidak-ada___" };

  // Hitungan untuk hapus massal SENGAJA tidak memakai `where` di atas: `where`
  // ikut tersaring pencarian nama/NIP, sementara yang dihapus adalah SELURUH
  // baris satuan kerja + periode itu. Kalau angka tersaring yang dipakai,
  // tombolnya bisa menulis "hapus 1 predikat" padahal 47 yang terhapus.
  const [satuanKerjaRows, jumlahBaris, sebaran, barisList, jumlahSeUnitPeriode, sumberPenilaian] = await Promise.all([
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
    prisma.predikatKinerja.count({ where }),
    prisma.predikatKinerja.groupBy({ by: ["predikat"], where, _count: { _all: true } }),
    prisma.predikatKinerja.findMany({
      where,
      take: MAKS_BARIS_TAMPIL,
      orderBy: { pegawai: { nama: "asc" } },
      include: { pegawai: { select: { id: true, nip: true, nama: true, satuanKerja: true, kelasJabatan: true } } },
    }),
    adaPeriode && satkerEfektif
      ? prisma.predikatKinerja.count({
          where: { periodeBulan: periodeBulan!, periodeTahun: periodeTahun!, pegawai: { satuanKerja: satkerEfektif } },
        })
      : Promise.resolve(0),
    // Penilai mana saja yang filenya SUDAH masuk untuk unit + periode ini.
    //
    // Satu satuan kerja lazim dinilai beberapa penilai dengan file terpisah
    // (data nyata 7/2026 Biro Keuangan: "Kasubbag TU" 25 orang, "Kepala Biro"
    // 21, "Subbagian Tata Usaha" 1), dan yang mengupload bisa orang berbeda.
    // Tanpa daftar ini, angka "belum punya predikat" tidak bisa dibaca: 20
    // orang belum punya itu karena file penilai lain memang belum diupload,
    // atau karena orangnya yang belum dinilai? Dua sebab, dua tindak lanjut.
    //
    // Sengaja TIDAK memakai `where` di atas - `where` ikut tersaring pencarian
    // nama/NIP, sementara pertanyaannya soal SELURUH unit (alasan yang sama
    // dengan `jumlahSeUnitPeriode`). Dan butuh satuan kerja terpilih: tanpa
    // itu daftarnya jadi seluruh penilai se-kementerian.
    adaPeriode && satkerEfektif
      ? prisma.predikatKinerja.groupBy({
          by: ["unitPenilaian"],
          where: { periodeBulan: periodeBulan!, periodeTahun: periodeTahun!, pegawai: { satuanKerja: satkerEfektif } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  // --- Bahan form "tambah predikat satuan" ---
  // Cuma pegawai yang BELUM punya predikat di periode ini; kalau semua ikut
  // masuk daftar, orang gampang memilih yang sudah ada lalu ditolak action.
  // Butuh satuan kerja yang jelas - tanpa itu daftarnya seluruh kementerian.
  const perluPilihSatker = !satkerEfektif;
  // Hanya pegawai AKTIF: yang sudah pensiun/berhenti tidak akan pernah punya
  // predikat baru, jadi memasukkannya cuma menggelembungkan angka "belum punya
  // predikat" dan mengotori daftar pilihan form tambah.
  const filterBelumPunya: Prisma.PegawaiWhereInput | null =
    adaPeriode && satkerEfektif
      ? {
          ...filterPegawai,
          statusPegawai: "AKTIF",
          predikatKinerja: { none: { periodeBulan: periodeBulan!, periodeTahun: periodeTahun! } },
        }
      : null;

  const [totalBelumPunya, pegawaiBelumPunyaRows] = filterBelumPunya
    ? await Promise.all([
        prisma.pegawai.count({ where: filterBelumPunya }),
        prisma.pegawai.findMany({
          where: filterBelumPunya,
          take: MAKS_OPSI_TAMBAH,
          orderBy: { nama: "asc" },
          select: { id: true, nip: true, nama: true },
        }),
      ])
    : [0, []];

  // Izin dicek PER BARIS terhadap satuan kerja pegawainya - pola yang sama
  // dengan upload massal. Tombol yang tidak berwenang tidak dirender, dan
  // action-nya tetap mengecek ulang sendiri (jangan percaya UI).
  const izinPerSatker = new Map<string, boolean>();
  for (const b of barisList) {
    if (!izinPerSatker.has(b.pegawai.satuanKerja)) {
      izinPerSatker.set(b.pegawai.satuanKerja, canUploadRekapPredikatKinerja(authUser, b.pegawai.satuanKerja));
    }
  }

  const namaPeriode = adaPeriode ? `${NAMA_BULAN[periodeBulan! - 1] ?? periodeBulan} ${periodeTahun}` : "";
  const jumlahManual = barisList.filter((b) => adalahInputManual(b.inputMethod)).length;

  // Penilai yang sudah masuk, terbanyak duluan. Baris ber-`unitPenilaian` null
  // dipisah, TIDAK dibuang: itu predikat yang diketik manual lewat form
  // "tambah predikat satuan" (atau diupload sebelum kolom ini ada), dan
  // menyembunyikannya membuat jumlah di daftar ini tidak menjumlah ke total.
  const penilaiTercatat = sumberPenilaian
    .filter((s): s is typeof s & { unitPenilaian: string } => s.unitPenilaian !== null)
    .sort((a, b) => b._count._all - a._count._all);
  const jumlahTanpaPenilai = sumberPenilaian.find((s) => s.unitPenilaian === null)?._count._all ?? 0;

  // Periode & satker ikut dibawa balik supaya Dashboard Tukin terbuka di
  // periode yang BARU SAJA dilihat di sini - kalau tidak, halaman tujuan jatuh
  // ke periode defaultnya sendiri dan terasa seperti pindah konteks.
  const kembaliKeTukin =
    "/tukin" +
    (adaPeriode
      ? `?bulan=${periodeBulan}&tahun=${periodeTahun}` +
        (satkerEfektif && !satkerWajib ? `&satker=${encodeURIComponent(satkerEfektif)}` : "")
      : "");

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <Link
        href={kembaliKeTukin}
        className="inline-flex items-center gap-2 text-sm font-bold text-teal-deep transition hover:text-biru"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        <span className="underline underline-offset-2">Kembali</span>
      </Link>

      <h1 className="mt-3 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">
        Predikat Kinerja
        {/* Dasar hukumnya di ikon, bukan memakan baris deskripsi - pola yang
            sama dengan /tukin/presensi. Yang perlu dibaca tiap hari adalah
            apa yang dikelola halaman ini, bukan nomor pasalnya. */}
        <SumberAcuan
          acuan={[
            { aturan: "Permenaker 15/2024 Pasal 5 ayat (2) huruf a", tentang: "Capaian kinerja berbobot 70% dari Tunjangan Kinerja" },
            { aturan: "Permenaker 15/2024 Pasal 11", tentang: "Tunjangan Kinerja dibayarkan menurut capaian kinerja pegawai" },
            { aturan: "Kepsekjen 82/2025 (Lampiran)", tentang: "Konversi predikat ke persen: Sangat Baik & Baik 100%, Perlu Perbaikan 85%, Kurang & Sangat Kurang 60%" },
          ]}
          catatan="Sumber data: file Rekap Penilaian dari portal e-Kinerja BKN (upload manual - belum ada akses API)."
        />
      </h1>
      <p className="mt-0.5 text-sm font-bold text-ink">Komponen 70% Tunjangan Kinerja (Tukin)</p>
      <p className="mt-2 text-sm text-biru">
        Kelola predikat kinerja pegawai berdasarkan Rekap Penilaian e-Kinerja BKN.
      </p>
      {satkerWajib && (
        <p className="mt-1 text-sm text-muted">
          Kamu hanya melihat pegawai di <strong className="text-ink">{satkerWajib}</strong>.
        </p>
      )}
      <UploadRekapForm />

      {periodeTersedia.length === 0 ? (
        <div className="card mt-6 p-5">
          <p className="font-bold text-ink">Belum ada data predikat kinerja</p>
          <p className="mt-1 text-sm text-muted">
            Upload file Rekap Penilaian dulu di atas. Tanpa predikat, kalkulasi Tukin akan melewati pegawai yang
            bersangkutan dengan alasan &quot;predikat kinerja periode ini belum diupload&quot;.
          </p>
        </div>
      ) : (
        <>
          <form method="get" className="card mt-6 p-4">
            <p className="text-base font-bold text-navy">Filter</p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className="field-label">Bulan</label>
              <SearchableSelect
                name="bulan"
                className="w-40"
                options={NAMA_BULAN.map((nama, i) => ({ value: String(i + 1), label: nama }))}
                defaultValue={String(periodeBulan ?? "")}
              />
            </div>
            <div>
              <label className="field-label">Tahun</label>
              <input type="number" name="tahun" defaultValue={String(periodeTahun ?? "")} className="field-input w-24 py-1.5" />
            </div>
            {!satkerWajib && (
              <div>
                <label className="field-label">Satuan kerja</label>
                <SearchableSelect
                  name="satker"
                  className="min-w-[240px]"
                  options={satuanKerjaRows
                    .filter((r) => r.satuanKerja.trim() !== "")
                    .map((r) => ({ value: r.satuanKerja, label: r.satuanKerja }))}
                  defaultValue={satker ?? ""}
                  emptyLabel="Semua satuan kerja"
                />
              </div>
            )}
            <div className="min-w-[180px] flex-1">
              <label className="field-label">Cari nama atau NIP</label>
              <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
            </div>
              <button type="submit" className="btn btn-primary">
                Terapkan
              </button>
            </div>
          </form>

          {/*
            Daftar periode dibuat sebagai panel tersendiri, bukan satu baris
            teks: jumlah periode bertambah tiap bulan, dan pengelola perlu
            melihat sekilas periode mana yang sudah terisi & seberapa banyak.
          */}
          <div className="card mt-4 p-4">
            <p className="text-sm font-bold text-ink">Periode yang sudah ada datanya</p>
            <p className="mt-0.5 text-xs text-muted">
              Klik salah satu buat berpindah. Angka dalam kurung = jumlah pegawai yang punya predikat di periode itu
              {satkerWajib ? ` untuk ${satkerWajib}` : " (seluruh satuan kerja)"}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {periodeTersedia.map((p) => {
                const aktif = p.periodeBulan === periodeBulan && p.periodeTahun === periodeTahun;
                const tujuan = new URLSearchParams({
                  bulan: String(p.periodeBulan),
                  tahun: String(p.periodeTahun),
                });
                if (satker && !satkerWajib) tujuan.set("satker", satker);
                if (q?.trim()) tujuan.set("q", q.trim());
                return (
                  <Link
                    key={`${p.periodeTahun}-${p.periodeBulan}`}
                    href={`/tukin/predikat-kinerja?${tujuan.toString()}`}
                    className={`rounded-lg border px-3 py-1.5 text-sm ${
                      aktif
                        ? "border-teal-deep bg-teal-tint font-bold text-teal-deep"
                        : "border-line bg-surface-2 text-ink-2 hover:border-teal-deep"
                    }`}
                  >
                    {NAMA_BULAN[p.periodeBulan - 1] ?? p.periodeBulan} {p.periodeTahun}
                    <span className="ml-1 font-mono text-xs text-muted">({p._count._all})</span>
                  </Link>
                );
              })}
            </div>

            {/* Sebaran periode yang sedang dibuka. Satu baris, di kartu yang
                sama - ini keterangan TENTANG periode terpilih, bukan blok
                terpisah yang berdiri sendiri. */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-2 pt-3">
              <span className="text-xs font-bold uppercase tracking-wide text-muted">Sebaran {namaPeriode}</span>
              {sebaran.length === 0 && <span className="text-sm text-muted">belum ada data</span>}
              {sebaran.map((s) => (
                <span key={s.predikat} className="inline-flex items-center gap-1.5">
                  <ChipPredikat predikat={s.predikat} />
                  <span className="font-mono text-sm font-extrabold text-ink">{s._count._all}</span>
                </span>
              ))}
              {jumlahManual > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="chip chip-wait">Input manual</span>
                  <span className="font-mono text-sm font-extrabold text-ink">{jumlahManual}</span>
                </span>
              )}
              {/* Yang BELUM punya predikat sengaja ikut di sini: inilah yang
                  menentukan siapa dilewati kalkulasi Tukin. Ditampilkan
                  walau nol supaya "sudah lengkap" terbaca sebagai jawaban,
                  bukan sebagai panel yang lupa dirender. */}
              {perluPilihSatker ? (
                // Tanpa satuan kerja terpilih, angka ini akan menghitung
                // SELURUH kementerian dan tidak berarti apa-apa. Bentuk lama
                // menuliskannya sebagai "-" begitu saja - tanda hubung yang
                // tidak menjelaskan kenapa kosong dan apa yang harus dilakukan.
                <span className="text-sm text-muted">
                  Pilih satuan kerja di filter untuk melihat siapa yang belum punya predikat.
                </span>
              ) : (
                <span
                  className={`inline-flex items-center gap-1.5 ${
                    totalBelumPunya > 0 ? "text-gold-deep" : "text-muted"
                  }`}
                >
                  <span className="text-sm font-semibold">Belum punya predikat</span>
                  <span className="font-mono text-sm font-extrabold">{totalBelumPunya}</span>
                </span>
              )}
            </div>

            {/* Penilai yang filenya sudah masuk untuk unit + periode ini.
                Sebelumnya keterangan ini CUMA muncul di hasil upload, jadi
                orang kedua yang membuka halaman ini besoknya melihat "belum
                punya predikat 20" tanpa bisa tahu apakah file penilai lain
                sudah masuk atau belum - padahal datanya sudah tersimpan per
                baris (PredikatKinerja.unitPenilaian). */}
            {!perluPilihSatker && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-2 pt-3">
                <span className="text-xs font-bold uppercase tracking-wide text-muted">Sumber penilaian</span>
                {penilaiTercatat.length === 0 && jumlahTanpaPenilai === 0 && (
                  <span className="text-sm text-muted">belum ada file yang masuk untuk periode ini</span>
                )}
                {penilaiTercatat.map((s) => (
                  <span key={s.unitPenilaian} className="inline-flex items-center gap-1.5">
                    <span className="chip chip-ok">{s.unitPenilaian}</span>
                    <span className="font-mono text-sm font-extrabold text-ink">{s._count._all}</span>
                  </span>
                ))}
                {jumlahTanpaPenilai > 0 && (
                  <span className="inline-flex items-center gap-1.5" title="Predikat yang diketik manual, atau diupload sebelum sumber penilaian dicatat.">
                    <span className="chip chip-wait">Tanpa sumber tercatat</span>
                    <span className="font-mono text-sm font-extrabold text-ink">{jumlahTanpaPenilai}</span>
                  </span>
                )}
                {/* Yang menentukan lengkap/tidaknya adalah kolom "Belum punya
                    predikat" di atas, BUKAN jumlah penilai di sini - berapa
                    penilai yang seharusnya mengirim file berbeda tiap unit dan
                    tidak dipunyai sistem. */}
                {penilaiTercatat.length > 1 && (
                  <span className="text-xs text-muted">
                    {penilaiTercatat.length} file penilai berbeda - semuanya tersimpan, tidak saling menimpa.
                  </span>
                )}
              </div>
            )}
          </div>

          {/*
            SEBARAN digabung ke dalam kartu periode di atas, bukan kartu
            sendiri-sendiri. Sebelumnya ada TIGA blok bertumpuk yang
            menjawab pertanyaan yang sama ("ini data apa"), dan empat tile
            di tengahnya semuanya mengulang yang sudah terlihat: "Periode
            dibuka" = chip yang sedang tersorot, "Pegawai berpredikat" =
            angka dalam kurung di chip itu, "Unit kerja" = isi filter di
            atasnya. Yang benar-benar menambah keterangan cuma dua: sebaran
            predikat dan jumlah yang BELUM punya predikat.
          */}
          {adaPeriode && (
            <TambahPredikatForm
              periodeBulan={periodeBulan!}
              periodeTahun={periodeTahun!}
              namaPeriode={namaPeriode}
              pegawaiBelumPunya={pegawaiBelumPunyaRows.map((p) => ({
                value: p.id,
                label: p.nama,
                keterangan: p.nip,
              }))}
              totalBelumPunya={totalBelumPunya}
              perluPilihSatker={perluPilihSatker}
            />
          )}

          {/* Hapus massal cuma muncul kalau satuan kerjanya SUDAH dipilih -
              tanpa itu cakupannya jadi seluruh kementerian, dan salah klik
              di situ menghapus ribuan baris lintas unit. */}
          {adaPeriode && satkerEfektif && (
            <HapusPeriodeForm
              satuanKerja={satkerEfektif}
              periodeBulan={periodeBulan!}
              periodeTahun={periodeTahun!}
              namaPeriode={namaPeriode}
              jumlahBaris={jumlahSeUnitPeriode}
            />
          )}

          <div className="card mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-4 py-2.5">Pegawai</th>
                  <th className="px-4 py-2.5">Predikat</th>
                  <th className="px-4 py-2.5">Nilai kinerja</th>
                  <th className="px-4 py-2.5">Sumber</th>
                  <th className="px-4 py-2.5">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {barisList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-muted">
                      Tidak ada predikat kinerja untuk filter ini.
                    </td>
                  </tr>
                )}
                {barisList.map((b) => (
                  <tr key={b.id} className="border-b border-line-2 align-top">
                    <td className="col-nama px-4 py-2.5">
                      <Link href={`/pegawai?q=${encodeURIComponent(b.pegawai.nip)}`} className="font-semibold text-ink underline">
                        {b.pegawai.nama}
                      </Link>
                      <span className="block font-mono text-xs text-muted">{b.pegawai.nip}</span>
                      <span className="block text-xs text-muted">{b.pegawai.satuanKerja}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <ChipPredikat predikat={b.predikat} />
                    </td>
                    <td className="px-4 py-2.5 font-mono text-ink-2">{b.nilaiAngka}%</td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {b.sourceSystem}
                      <span className="block">
                        {labelSumber(b.inputMethod)} - {b.sourceSyncedAt.toLocaleDateString("id-ID")}
                      </span>
                      {adalahInputManual(b.inputMethod) && (
                        <span className="chip chip-wait mt-1 inline-block">bukan dari BKN</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <AksiBarisPredikat
                        id={b.id}
                        nama={b.pegawai.nama}
                        periode={`${NAMA_BULAN[b.periodeBulan - 1] ?? b.periodeBulan} ${b.periodeTahun}`}
                        predikatSekarang={b.predikat}
                        bolehUbah={izinPerSatker.get(b.pegawai.satuanKerja) ?? false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {jumlahBaris > barisList.length && (
            <p className="mt-2 text-xs text-muted">
              Menampilkan {barisList.length} dari {jumlahBaris} baris - persempit dengan filter atau pencarian nama/NIP.
            </p>
          )}

          <div className="card mt-6 border-l-4 border-l-gold p-4">
            <p className="text-sm font-bold text-ink">Predikat berubah? Tukin harus dihitung ulang</p>
            <p className="mt-1 text-sm text-muted">
              Kalkulasi Tukin memakai predikat yang berlaku SAAT dihitung. Kalau kamu meng-upload rekap perbaikan setelah
              Tukin periode itu terlanjur dihitung, hasil lamanya tidak ikut berubah sendiri - hitung ulang lewat{" "}
              <Link href="/kasubag/kalkulasi" className="font-semibold text-teal-deep underline">
                Kalkulasi Unit
              </Link>
              . Perlu diingat menghitung ulang akan mereset siklus approval yang sudah berjalan ke DRAFT.
            </p>
            <p className="mt-2 text-xs text-muted">
              Konversi predikat ke persen mengikuti Lampiran Kepsekjen 82 Tahun 2025: Sangat Baik/Baik 100%, Perlu
              Perbaikan 85%, Kurang/Sangat Kurang 60%.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
