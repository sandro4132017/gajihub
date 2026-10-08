import Link from "next/link";
import { prisma } from "../../../lib/prisma";
import { getSessionAccount } from "../../../auth/getSessionAccount";
import { canUpdateSkPegawaiStrukturalFungsional, type AuthUser } from "../../../auth/permissions";
import { AksesDitolak } from "../../AksesDitolak";
import { UpdateSkForm } from "./UpdateSkForm";
import { PencarianDebounce } from "../../PencarianDebounce";
import { HALAMAN } from "../../layoutHalaman";
import { GrDocumentUser } from "react-icons/gr";
import { FiArrowLeft, FiSearch, FiCheckCircle, FiUserCheck, FiRotateCcw, FiArrowRight } from "react-icons/fi";

export const dynamic = "force-dynamic";

export default async function OsdmaUpdateSkPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; pegawaiId?: string; berhasil?: string }>;
}) {
  const { q, pegawaiId, berhasil } = await searchParams;
  const akun = await getSessionAccount();
  const authUser: AuthUser | null = akun && {
    nip: akun.nip,
    role: akun.role,
    satuanKerja: akun.satuanKerja,
    aktif: true,
  };

  if (!authUser || !canUpdateSkPegawaiStrukturalFungsional(authUser)) {
    return <AksesDitolak pesan="Role kamu tidak berwenang mengubah SK pegawai." />;
  }

  const pegawaiTerpilih = pegawaiId
    ? await prisma.pegawai.findUnique({ where: { id: pegawaiId } })
    : null;

  return (
    <main className={`${HALAMAN} space-y-6`}>
      {/* ====================================================================
          1. HEADER UTAMA
          ==================================================================== */}
      <div className="gj-masuk flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/osdma"
                className="flex size-8 items-center justify-center rounded-xl border border-line bg-surface text-muted hover:text-ink transition shadow-2xs"
                title="Kembali ke Dashboard OSDMA"
              >
                <FiArrowLeft className="size-4" />
              </Link>
              <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
                Update SK Struktural / Fungsional
              </h1>
              <span className="chip chip-navy font-semibold text-xs">
                Biro OSDMA
              </span>
            </div>
            <p className="mt-1 text-xs sm:text-sm text-muted">
              Pemutakhiran langsung data master jabatan, golongan, dan grade kelas jabatan untuk pegawai yang baru dilantik atau mutasi.
            </p>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. NOTIFIKASI BERHASIL
          ==================================================================== */}
      {berhasil && (
        <section className="flex items-center gap-3 rounded-2xl border border-green/30 bg-green-tint/80 p-4 text-xs sm:text-sm font-bold text-green shadow-xs">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-green/10 text-green">
            <FiCheckCircle className="size-5" />
          </span>
          <p>
            Data SK pegawai berhasil diperbarui dan disinkronkan ke sistem sumber kepegawaian.
          </p>
        </section>
      )}

      {/* ====================================================================
          3. KOTAK PENCARIAN PEGAWAI
          ==================================================================== */}
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-3">
          <FiSearch className="size-4 text-biru" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted">
            Cari Pegawai Sasaran Pemutakhiran SK
          </h2>
        </div>

        <form method="get" className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <PencarianDebounce
              defaultValue={q}
              placeholder="Ketik nama lengkap atau 18 digit NIP pegawai..."
            />
          </div>
          <button type="submit" className="btn btn-primary inline-flex items-center gap-2">
            <FiSearch className="size-4" />
            <span>Cari Pegawai</span>
          </button>
        </form>
      </section>

      {/* ====================================================================
          4. KONTEN UTAMA: PEGAWAI TERPILIH / HASIL PENCARIAN / PANDUAN
          ==================================================================== */}
      {pegawaiTerpilih ? (
        <div className="space-y-5">
          {/* Kartu Profil Pegawai Terpilih */}
          <div className="rounded-2xl border border-line bg-gradient-to-r from-surface to-surface-2/70 p-5 sm:p-6 shadow-[0_2px_12px_rgba(19,65,107,0.06)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-teal-tint text-biru font-black text-lg shadow-xs ring-1 ring-biru/20">
                  {pegawaiTerpilih.nama.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-ink">
                      {pegawaiTerpilih.nama}
                    </h3>
                    <span className="chip chip-ok text-xs font-semibold">
                      Pegawai Terpilih
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    NIP {pegawaiTerpilih.nip} &bull; {pegawaiTerpilih.satuanKerja}
                  </p>
                  <p className="mt-1 text-xs font-medium text-ink-2">
                    Jabatan saat ini: <strong className="text-ink">{pegawaiTerpilih.jabatan ?? "Belum terisi"}</strong>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-line/60">
                <div className="rounded-xl border border-line/70 bg-white/70 px-3 py-2 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Golongan Saat Ini</span>
                  <span className="font-bold text-xs text-ink">{pegawaiTerpilih.golongan ?? "-"}</span>
                </div>
                <div className="rounded-xl border border-line/70 bg-white/70 px-3 py-2 text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">Kelas Jabatan</span>
                  <span className="font-bold text-xs text-ink">Kelas {pegawaiTerpilih.kelasJabatan ?? "-"}</span>
                </div>
                <Link
                  href={q ? `/osdma/update-sk?q=${encodeURIComponent(q)}` : "/osdma/update-sk"}
                  className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                >
                  <FiRotateCcw className="size-3.5" />
                  <span>Ganti Pegawai</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Formulir Update SK */}
          <UpdateSkForm pegawai={pegawaiTerpilih} />
        </div>
      ) : q ? (
        <PegawaiHasilPencarian q={q} />
      ) : (
        /* Edukasi / Default State */
        <section className="rounded-2xl border border-dashed border-line bg-surface-2/40 p-8 text-center shadow-xs">
          <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-teal-tint text-biru">
            <GrDocumentUser className="size-6" />
          </div>
          <h3 className="mt-3 text-sm font-black text-ink">
            Pilih Pegawai untuk Memulai Pemutakhiran SK
          </h3>
          <p className="mt-1 text-xs text-muted max-w-md mx-auto leading-relaxed">
            Gunakan kotak pencarian di atas untuk menemukan pegawai berdasarkan nama atau NIP, lalu perbarui data jabatan struktural/fungsional, golongan baru, atau kelas jabatan.
          </p>
        </section>
      )}
    </main>
  );
}

async function PegawaiHasilPencarian({ q }: { q: string }) {
  const hasil = await prisma.pegawai.findMany({
    where: {
      OR: [
        { nama: { contains: q, mode: "insensitive" } },
        { nip: { contains: q } },
      ],
    },
    orderBy: { nama: "asc" },
    take: 20,
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-ink flex items-center gap-2">
          <span className="size-2 rounded-full bg-biru" />
          Hasil Pencarian ({hasil.length})
        </h2>
        {hasil.length === 20 && (
          <span className="text-xs text-muted">Menampilkan 20 hasil teratas</span>
        )}
      </div>

      {hasil.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-xs">
          <p className="text-sm font-bold text-ink">Tidak ada pegawai yang cocok</p>
          <p className="mt-1 text-xs text-muted">
            Pastikan ejaan nama atau nomor NIP yang Anda masukkan sudah benar.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {hasil.map((p) => (
            <div
              key={p.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xs transition hover:border-biru/40 hover:bg-surface-2/30"
            >
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted font-black text-sm">
                  {p.nama.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-ink">{p.nama}</span>
                    <span className="text-xs font-mono text-muted">NIP {p.nip}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {p.satuanKerja} &bull; <span className="font-semibold text-ink-2">{p.jabatan ?? "Jabatan belum terisi"}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                <Link
                  href={`/osdma/update-sk?q=${encodeURIComponent(q)}&pegawaiId=${p.id}`}
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                >
                  <FiUserCheck className="size-3.5" />
                  <span>Pilih Pegawai</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
