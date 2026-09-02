import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { getSessionAccount } from "../../auth/getSessionAccount";
import {
  canKelolaDataPegawai,
  canEditDataPegawai,
  canPindahSatuanKerjaPegawai,
  canBukaHalamanPredikatKinerja,
  type AuthUser,
} from "../../auth/permissions";
import { daftarRoleTersedia } from "../../auth/roleAktif";
import { labelRole } from "../../auth/roleLabel";
import { AksesDitolak } from "../AksesDitolak";
import { NAMA_BULAN } from "../bulan";
import { PegawaiEditForm } from "./PegawaiEditForm";
import { PencarianDebounce } from "../PencarianDebounce";
import { Paginasi, hitungPaginasi } from "../Paginasi";
import {
  JENIS_PEGAWAI_ADK,
  bacaJenisPegawai,
  wherePegawaiJenis,
  wherePegawaiTanpaJenis,
} from "../ppabp/adk/jenisPegawaiAdk";
import { SearchableSelect } from "../SearchableSelect";

export const dynamic = "force-dynamic";

/**
 * Kode kategori "belum diketahui" - pegawai yang tidak punya identitas Web
 * Gaji, jadi PNS/P3K-nya tidak bisa dipastikan.
 *
 * ADA SEBAGAI PILIHAN, bukan cuma sebagai keadaan. Merekalah yang tersingkir
 * dari berkas ADK begitu penyaring jenis dipakai di /ppabp/adk - 329 orang
 * pada data 2026-09-02, 121 di antaranya masih AKTIF. Tanpa cara menyaringnya
 * di sini, satu-satunya jalan menemukan mereka adalah menyisir 5.302 nama.
 * Dengan pilihan ini, halaman perbaikan data punya daftar kerjanya sendiri.
 */
const KATEGORI_BELUM_DIKETAHUI = "TANPA";

/** Potongan `where` untuk penyaring kategori. Kosong = semua. */
function whereKategori(kategori: string | undefined) {
  if (kategori === KATEGORI_BELUM_DIKETAHUI) return wherePegawaiTanpaJenis();
  return wherePegawaiJenis(bacaJenisPegawai(kategori ?? null));
}

const LABEL_PREDIKAT: Record<string, string> = {
  SANGAT_BAIK: "Sangat Baik",
  BAIK: "Baik",
  PERLU_PERBAIKAN: "Perlu Perbaikan",
  KURANG: "Kurang",
  SANGAT_KURANG: "Sangat Kurang",
};

/**
 * DATA PEGAWAI - perbaikan data pokok pegawai buat ADMIN / PPABP /
 * KASUBAG_TU (lihat blok "DATA POKOK PEGAWAI" di src/auth/permissions.ts).
 *
 * Satu halaman dipakai bertiga (BUKAN tiga salinan di /admin, /ppabp,
 * /kasubag) - yang membedakan cuma cakupan datanya, dan itu sudah diurus
 * fungsi izin: KASUBAG_TU dipaksa ke unitnya sendiri, PPABP/ADMIN lintas
 * satker.
 */
export default async function DataPegawaiPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    pegawaiId?: string;
    hal?: string;
    per?: string;
    satker?: string;
    kategori?: string;
  }>;
}) {
  const { q, pegawaiId, hal, per, satker, kategori } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null =
    akun && { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };

  if (!authUser || !canKelolaDataPegawai(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengelola data pegawai." />;
  }

  // KASUBAG_TU cuma boleh menyentuh unitnya sendiri - dipaksa di level QUERY
  // (bukan cuma disembunyikan di UI), sama pola dengan resolveSatkerEfektif.
  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;

  // Kasus yang persis jadi keluhan: akun Kasubag TU tanpa satuan kerja tidak
  // bisa lihat apa-apa. Dulu halaman-halaman unit cuma tampil kosong tanpa
  // penjelasan - sekarang dikasih tahu penyebab & jalan keluarnya.
  if (authUser.role === "KASUBAG_TU" && !satkerWajib) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <h1 className="text-xl font-extrabold tracking-tight text-ink">Data Pegawai</h1>
        <div className="card mt-4 border-l-4 border-l-gold p-5">
          <p className="font-bold text-ink">Akun kamu belum punya unit kerja</p>
          <p className="mt-1 text-sm text-muted">
            Role akun kamu Kasubag TU, tapi kolom satuan kerja akunnya masih kosong - itu sebabnya semua halaman unit
            (dashboard, pegawai, kalkulasi) tidak menampilkan data apa pun. Ini bukan data yang hilang, cuma akunnya
            belum diarahkan ke unit mana.
          </p>
          <p className="mt-2 text-sm text-muted">
            Minta Admin mengisinya lewat <strong>Kelola Assignment Role</strong> (menu Admin), atau PPABP mengusulkan
            perubahan rolenya ulang dengan unit yang benar.
          </p>
        </div>
      </main>
    );
  }

  const [satuanKerjaRows, golonganRows, statusRows] = await Promise.all([
    prisma.pegawai.findMany({ distinct: ["satuanKerja"], select: { satuanKerja: true }, orderBy: { satuanKerja: "asc" } }),
    prisma.pegawai.findMany({ distinct: ["golongan"], select: { golongan: true }, orderBy: { golongan: "asc" } }),
    prisma.pegawai.findMany({ distinct: ["statusPegawai"], select: { statusPegawai: true } }),
  ]);
  const satuanKerjaList = satuanKerjaRows.map((r) => r.satuanKerja);
  const golonganList = golonganRows.map((r) => r.golongan).filter((g): g is string => Boolean(g));
  const statusList = statusRows.map((r) => r.statusPegawai);

  const pegawaiTerpilih = pegawaiId ? await prisma.pegawai.findUnique({ where: { id: pegawaiId } }) : null;
  // Guard per-baris: id pegawai dari query string TIDAK dipercaya begitu saja.
  const bolehEditTerpilih = pegawaiTerpilih ? canEditDataPegawai(authUser, pegawaiTerpilih.satuanKerja) : false;
  const akunTerkait = pegawaiTerpilih
    ? await prisma.user.findUnique({ where: { nip: pegawaiTerpilih.nip } })
    : null;

  // Riwayat predikat kinerja (bobot 70% Tukin) - ditampilkan di halaman yang
  // sama supaya pertanyaan "kenapa tukin dia segitu" bisa dijawab tanpa
  // pindah halaman. READ-ONLY di sini: satu-satunya cara mengubahnya adalah
  // upload rekap resmi e-Kinerja di /predikat-kinerja.
  const riwayatPredikat = pegawaiTerpilih
    ? await prisma.predikatKinerja.findMany({
        where: { pegawaiId: pegawaiTerpilih.id },
        orderBy: [{ periodeTahun: "desc" }, { periodeBulan: "desc" }],
        take: 24,
      })
    : [];

  // KASUBAG_TU tidak boleh memilih unit - unitnya sudah dipaksa di level
  // query lewat `satkerWajib`. Menampilkan penyaring yang tidak berpengaruh
  // apa-apa lebih buruk daripada tidak menampilkannya: yang mencoba
  // memakainya akan mengira halamannya rusak.
  const satkerPilih = satkerWajib ? "" : (satker ?? "");
  const kategoriPilih = kategori ?? "";

  const paramDaftar = new URLSearchParams();
  if (q) paramDaftar.set("q", q);
  if (satkerPilih) paramDaftar.set("satker", satkerPilih);
  if (kategoriPilih) paramDaftar.set("kategori", kategoriPilih);
  if (hal) paramDaftar.set("hal", hal);
  if (per) paramDaftar.set("per", per);
  const hrefDaftar = paramDaftar.size > 0 ? `/pegawai?${paramDaftar.toString()}` : "/pegawai";

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Data Pegawai</h1>
      <p className="mt-1 text-sm text-muted">
        Perbaiki data pokok pegawai (nama, jabatan, golongan, kelas jabatan, status) dan tetapkan satuan kerjanya.
        Satuan kerja menentukan pegawai ini muncul di dashboard unit yang mana - kalau salah/kosong, datanya seolah
        &quot;hilang&quot; dari semua rekap.
        {satkerWajib && (
          <>
            {" "}
            Kamu hanya melihat pegawai di <strong>{satkerWajib}</strong>.
          </>
        )}
      </p>

      <form method="get" className="card mt-4 flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px] flex-1">
          <label className="field-label">Cari nama atau NIP</label>
          <PencarianDebounce defaultValue={q} placeholder="Cari pegawai..." />
        </div>
        {!satkerWajib && (
          <div>
            <label className="field-label">Satuan kerja</label>
            <SearchableSelect
              name="satker"
              className="w-64"
              options={[
                { value: "", label: "Semua satuan kerja" },
                ...satuanKerjaList.map((nama) => ({ value: nama, label: nama })),
              ]}
              defaultValue={satkerPilih}
            />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="filter-kategori">
            Kategori pegawai
          </label>
          <select
            id="filter-kategori"
            name="kategori"
            defaultValue={kategoriPilih}
            className="field-input w-48 py-1.5"
          >
            <option value="">Semua kategori</option>
            {JENIS_PEGAWAI_ADK.map((j) => (
              <option key={j.kode} value={j.kode}>
                {j.kode === "PNS" ? "PNS / CPNS" : "P3K (PPPK)"}
              </option>
            ))}
            <option value={KATEGORI_BELUM_DIKETAHUI}>Belum diketahui</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">
          Terapkan
        </button>
      </form>

      {/* Penjelasan pilihan "Belum diketahui" ditaruh di sini, bukan sebagai
          keterangan di bawah dropdown yang selalu tampil: ia cuma relevan
          begitu pilihannya dipakai, dan justru saat itulah orang bertanya
          "kenapa mereka tidak punya kategori?". */}
      {kategoriPilih === KATEGORI_BELUM_DIKETAHUI && (
        <p className="mt-2 rounded-lg bg-gold-tint px-3 py-2 text-xs text-ink-2">
          Pegawai yang belum tercakup berkas <strong>Basis Data Gaji</strong>, jadi PNS/P3K-nya tidak bisa
          dipastikan. Mereka <strong>tersingkir dari berkas ADK</strong> begitu penyaring jenis dipakai. Kategorinya
          terisi sendiri setelah berkas basis data gaji yang memuat mereka diunggah - bukan lewat halaman ini.
        </p>
      )}

      {pegawaiTerpilih ? (
        !bolehEditTerpilih ? (
          <div className="card mt-4 p-5">
            <p className="text-sm font-semibold text-red">
              Pegawai ini di luar kewenangan kamu ({pegawaiTerpilih.satuanKerja}).
            </p>
            <Link href={hrefDaftar} className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
              Kembali ke pencarian
            </Link>
          </div>
        ) : (
          <>
            <div className="card mt-4 p-4">
              <p className="font-bold text-ink">{pegawaiTerpilih.nama}</p>
              <p className="text-sm text-muted">
                NIP {pegawaiTerpilih.nip} - {pegawaiTerpilih.satuanKerja}
              </p>
              <Link href={hrefDaftar} className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
                Ganti pegawai
              </Link>
            </div>

            <AkunTerkait akun={akunTerkait} satuanKerjaPegawai={pegawaiTerpilih.satuanKerja} bolehKelolaAkun={authUser.role === "ADMIN"} />

            <PegawaiEditForm
              pegawai={pegawaiTerpilih}
              satuanKerjaList={satuanKerjaList}
              golonganList={golonganList}
              statusList={statusList}
              bolehPindahSatker={canPindahSatuanKerjaPegawai(authUser, pegawaiTerpilih.satuanKerja)}
            />

            <RiwayatPredikatKinerja
              riwayat={riwayatPredikat}
              bolehUpload={canBukaHalamanPredikatKinerja(authUser)}
            />
          </>
        )
      ) : (
        <HasilPencarian
          q={q}
          satkerWajib={satkerWajib}
          satkerPilih={satkerPilih}
          kategori={kategoriPilih}
          hal={hal}
          per={per}
        />
      )}
    </main>
  );
}

/**
 * Panel akun otorisasi milik pegawai ini. Ditampilkan supaya penyebab
 * keluhan "role sudah diganti tapi tidak bisa lihat apa-apa" kelihatan dari
 * halaman yang sama - `User.satuanKerja` (unit AKUN) itu kolom yang BEDA
 * dari `Pegawai.satuanKerja` (unit ORANGNYA), dan cuma yang pertama yang
 * dipakai buat scoping Kasubag TU.
 */
function AkunTerkait({
  akun,
  satuanKerjaPegawai,
  bolehKelolaAkun,
}: {
  akun: { nama: string; role: string; rolesTambahan: string[]; satuanKerja: string | null; aktif: boolean } | null;
  satuanKerjaPegawai: string;
  bolehKelolaAkun: boolean;
}) {
  if (!akun) {
    return (
      <p className="mt-4 text-xs text-muted">Pegawai ini belum punya akun login di Gajihub.</p>
    );
  }

  const roles = daftarRoleTersedia({
    role: akun.role as never,
    rolesTambahan: akun.rolesTambahan as never,
  });
  const perluUnit = roles.includes("KASUBAG_TU");
  const unitAkunKosong = perluUnit && !akun.satuanKerja;
  const unitAkunBeda = perluUnit && Boolean(akun.satuanKerja) && akun.satuanKerja !== satuanKerjaPegawai;

  return (
    <div className={`card mt-4 p-4 ${unitAkunKosong ? "border-l-4 border-l-gold" : ""}`}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Akun login pegawai ini</p>
      <p className="mt-1 text-sm text-ink">
        Role: <strong>{roles.map((r) => labelRole(r, akun.satuanKerja)).join(" + ")}</strong>
        {" - "}
        unit akun: <strong>{akun.satuanKerja ?? "(kosong)"}</strong>
        {!akun.aktif && " - AKUN NONAKTIF"}
      </p>
      {unitAkunKosong && (
        <p className="mt-1.5 text-xs font-semibold text-gold-deep">
          Akun ini ber-role Kasubag TU tapi unit akunnya kosong, jadi dia tidak bisa melihat unit manapun.
          {bolehKelolaAkun ? " Isi lewat Kelola Assignment Role." : " Minta Admin mengisinya lewat Kelola Assignment Role."}
        </p>
      )}
      {unitAkunBeda && (
        <p className="mt-1.5 text-xs text-muted">
          Catatan: unit akun ({akun.satuanKerja}) beda dengan satuan kerja pegawainya ({satuanKerjaPegawai}) - ini wajar
          kalau dia memang Kasubag TU unit lain.
        </p>
      )}
      {bolehKelolaAkun && (
        <Link href="/admin/role-assignment" className="mt-2 inline-block text-xs font-semibold text-teal-deep underline">
          Kelola role &amp; unit akun
        </Link>
      )}
    </div>
  );
}

async function HasilPencarian({
  q,
  satkerWajib,
  satkerPilih,
  kategori,
  hal,
  per,
}: {
  q?: string;
  satkerWajib: string | null;
  satkerPilih: string;
  kategori: string;
  hal?: string;
  per?: string;
}) {
  const where: Prisma.PegawaiWhereInput = {
    // `satkerWajib` MENANG atas pilihan user - itu batas kewenangan
    // KASUBAG_TU, bukan preferensi tampilan, dan `satker` di query string
    // tidak boleh bisa menembusnya.
    ...(satkerWajib ? { satuanKerja: satkerWajib } : satkerPilih ? { satuanKerja: satkerPilih } : {}),
    ...(q ? { OR: [{ nama: { contains: q, mode: "insensitive" } }, { nip: { contains: q } }] } : {}),
    ...whereKategori(kategori),
  };

  // Tanpa penyaring apa pun: KASUBAG_TU langsung dapat roster unitnya
  // (jumlahnya wajar), sementara ADMIN/PPABP TIDAK - 5.302 baris tidak ada
  // gunanya ditampilkan sekaligus.
  //
  // PENYARING SATUAN KERJA & KATEGORI IKUT MEMBUKA DAFTARNYA, bukan cuma kata
  // kunci. Dulu satu-satunya jalan masuk adalah mengetik nama - dan itu
  // mensyaratkan sudah tahu siapa yang dicari. Pertanyaan yang sebenarnya
  // dibawa PPABP ke halaman ini justru kebalikannya: "siapa saja di unit X",
  // "siapa yang kategorinya belum diketahui".
  const adaPenyaring = Boolean(q || satkerWajib || satkerPilih || kategori);
  if (!adaPenyaring) {
    return (
      <p className="card mt-4 p-6 text-sm text-muted">
        Pilih satuan kerja, kategori pegawai, atau ketik nama/NIP dulu untuk menampilkan daftarnya.
      </p>
    );
  }

  // PAGINASI, bukan `take: 50`.
  //
  // Potongan 50 baris itu diam-diam menyembunyikan orang. KASUBAG_TU masuk ke
  // sini tanpa kata kunci dan langsung mendapat roster unitnya - dan 54 dari
  // 84 unit berisi lebih dari 50 pegawai (terbesar 227, Balai Bekasi). Yang
  // dilihatnya cuma 50 nama pertama urut abjad; sisanya cuma bisa ditemukan
  // kalau dia kebetulan menebak namanya. Keterangan "persempit pencarian"
  // memang ada, tapi kecil, dan tidak memberi tahu ADA BERAPA yang tidak
  // tampil.
  //
  // Bawaannya 50 baris supaya tidak ada yang merasa halamannya menyusut.
  const totalBaris = await prisma.pegawai.count({ where });
  const paginasi = hitungPaginasi(totalBaris, hal, per ?? "50");
  const hasil = await prisma.pegawai.findMany({
    where,
    orderBy: { nama: "asc" },
    skip: paginasi.mulai,
    take: paginasi.perHalaman,
  });
  const paramPaginasi = new URLSearchParams();
  if (q) paramPaginasi.set("q", q);
  if (satkerPilih) paramPaginasi.set("satker", satkerPilih);
  if (kategori) paramPaginasi.set("kategori", kategori);

  return (
    <div className="card mt-4 divide-y divide-line-2">
      {hasil.length === 0 && <p className="p-6 text-sm text-muted">Tidak ada pegawai yang cocok.</p>}
      {hasil.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-3 p-4">
          {/*
            Hasil pencarian SENGAJA tidak menyaring statusPegawai: ini halaman
            perbaikan data, dan pegawai yang sudah pensiun justru termasuk yang
            datanya mungkin perlu dibetulkan. Yang perlu ada cuma penandanya,
            supaya tidak ada yang mengira orangnya masih aktif.
          */}
          <div className="min-w-0">
            <p className="font-semibold text-ink">
              {p.nama}
              {p.statusPegawai !== "AKTIF" && (
                <span className="chip chip-wait ml-2 align-middle">{p.statusPegawai}</span>
              )}
            </p>
            <p className="text-xs text-muted">
              NIP {p.nip} - {p.satuanKerja} - {p.jabatan ?? "-"}
            </p>
          </div>
          <Link
            href={`/pegawai?${(() => {
              const u = new URLSearchParams(paramPaginasi);
              u.set("hal", String(paginasi.halaman));
              u.set("per", String(paginasi.perHalaman));
              u.set("pegawaiId", p.id);
              return u.toString();
            })()}`}
            className="btn btn-ghost btn-sm flex-none"
          >
            Edit
          </Link>
        </div>
      ))}
      <Paginasi
        basePath="/pegawai"
        params={paramPaginasi}
        info={paginasi}
        totalBaris={totalBaris}
        labelBaris="pegawai"
      />
    </div>
  );
}

/**
 * Riwayat predikat kinerja pegawai - dasar bobot 70% Tunjangan Kinerja.
 * READ-ONLY: tidak ada form ubah di sini, karena satu-satunya sumber yang
 * sah adalah file Rekap Penilaian e-Kinerja BKN yang di-upload di
 * /predikat-kinerja (lihat canEditPresensiKinerjaLangsung di
 * src/auth/permissions.ts yang tetap `false` buat semua role).
 */
function RiwayatPredikatKinerja({
  riwayat,
  bolehUpload,
}: {
  riwayat: { id: string; periodeBulan: number; periodeTahun: number; predikat: string; nilaiAngka: number; sourceSystem: string; inputMethod: string; sourceSyncedAt: Date }[];
  bolehUpload: boolean;
}) {
  return (
    <div className="card mt-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted">Riwayat predikat kinerja</p>
        {bolehUpload && (
          <Link href="/tukin/predikat-kinerja" className="text-xs font-semibold text-teal-deep underline">
            Upload rekap e-Kinerja
          </Link>
        )}
      </div>

      {riwayat.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Belum ada predikat kinerja yang tercatat. Selama kosong, kalkulasi Tukin akan melewati pegawai ini.
        </p>
      ) : (
        <>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-xs font-bold uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-3">Periode</th>
                <th className="py-1.5 pr-3">Predikat</th>
                <th className="py-1.5 pr-3">Nilai kinerja</th>
                <th className="py-1.5">Sumber</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id} className="border-b border-line-2">
                  <td className="py-1.5 pr-3 text-ink-2">
                    {NAMA_BULAN[r.periodeBulan - 1] ?? r.periodeBulan} {r.periodeTahun}
                  </td>
                  <td className="py-1.5 pr-3 font-semibold text-ink">{LABEL_PREDIKAT[r.predikat] ?? r.predikat}</td>
                  <td className="py-1.5 pr-3 font-mono text-ink-2">{r.nilaiAngka}%</td>
                  <td className="py-1.5 text-xs text-muted">
                    {r.sourceSystem} ({r.inputMethod === "MANUAL_UPLOAD" ? "upload manual" : "API"}) -{" "}
                    {r.sourceSyncedAt.toLocaleDateString("id-ID")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Nilai kinerja = konversi predikat sesuai Lampiran Kepsekjen 82 Tahun 2025 (Sangat Baik/Baik 100%, Perlu
            Perbaikan 85%, Kurang/Sangat Kurang 60%), dipakai sebagai komponen 70% Tunjangan Kinerja.
          </p>
        </>
      )}
    </div>
  );
}
