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
import { LABEL_ROLE } from "../../auth/roleLabel";
import { AksesDitolak } from "../AksesDitolak";
import { NAMA_BULAN } from "../bulan";
import { PegawaiEditForm } from "./PegawaiEditForm";

export const dynamic = "force-dynamic";

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
  searchParams: Promise<{ q?: string; pegawaiId?: string }>;
}) {
  const { q, pegawaiId } = await searchParams;
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

  const hrefDaftar = q ? `/pegawai?q=${encodeURIComponent(q)}` : "/pegawai";

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
        <div className="min-w-[240px] flex-1">
          <label className="field-label">Cari nama atau NIP</label>
          <input type="text" name="q" defaultValue={q ?? ""} className="field-input" placeholder="Cari pegawai..." />
        </div>
        <button type="submit" className="btn btn-primary">
          Cari
        </button>
      </form>

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
        <HasilPencarian q={q} satkerWajib={satkerWajib} />
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
        Role: <strong>{roles.map((r) => LABEL_ROLE[r]).join(" + ")}</strong>
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

async function HasilPencarian({ q, satkerWajib }: { q?: string; satkerWajib: string | null }) {
  const where: Prisma.PegawaiWhereInput = {
    ...(satkerWajib ? { satuanKerja: satkerWajib } : {}),
    ...(q ? { OR: [{ nama: { contains: q, mode: "insensitive" } }, { nip: { contains: q } }] } : {}),
  };

  // Tanpa kata kunci: KASUBAG_TU langsung dapat roster unitnya (jumlahnya
  // wajar, ~80), sementara ADMIN/PPABP TIDAK - 5.069 baris tidak ada gunanya
  // ditampilkan, mereka diminta mencari dulu.
  if (!q && !satkerWajib) {
    return <p className="card mt-4 p-6 text-sm text-muted">Cari nama atau NIP pegawai dulu untuk mengubah datanya.</p>;
  }

  const hasil = await prisma.pegawai.findMany({ where, orderBy: { nama: "asc" }, take: 50 });

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
            href={`/pegawai?${q ? `q=${encodeURIComponent(q)}&` : ""}pegawaiId=${p.id}`}
            className="btn btn-ghost btn-sm flex-none"
          >
            Edit
          </Link>
        </div>
      ))}
      {hasil.length === 50 && (
        <p className="p-3 text-xs text-muted">Menampilkan 50 hasil teratas - persempit pencarian kalau perlu.</p>
      )}
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
              <tr className="border-b border-line text-left text-xs font-bold uppercase tracking-wide text-muted">
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
