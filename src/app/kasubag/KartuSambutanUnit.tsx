import Link from "next/link";
import {
  RiAlertLine,
  RiAwardLine,
  RiCalendarCheckLine,
  RiCheckDoubleLine,
  RiCheckLine,
  RiMoneyDollarCircleLine,
  RiTimeLine,
} from "react-icons/ri";
import { FaClock, FaUtensils } from "react-icons/fa6";
import type { IconType } from "react-icons";
import type { KartuKomponen, KodeKomponen, KodeLangkah, LangkahPeriode } from "../../business-logic/langkahTutupBulan";
import type { KeadaanPeriode } from "../../business-logic/pengirimanUnit";
import { KartuBercahaya } from "../KartuKpi";
import { sapaanNama } from "../sapaan";
import { LABEL_TOMBOL_LANGKAH, tautanLangkah } from "./tautanLangkah";

// ============================================================================
// KARTU SAMBUTAN DASHBOARD KASUBAG TU.
//
// Menjawab tiga pertanyaan berurutan: "sampai mana" (kalimat + bar), "apa
// berikutnya" (SATU tombol), "bagaimana tiap komponennya" (tiga kartu).
//
// TOMBOL UTAMA ADALAH SATU-SATUNYA BLOK BERKOTAK di kartu ini. Tautan lain
// (Pegawai unit) sengaja berupa teks bergaris bawah - kalau dua-duanya
// berkotak, mata tidak tahu mana yang diminta.
//
// TIDAK ADA TOMBOL KIRIM DI SINI. Gerbang kirim (centang tabel, pernyataan,
// cek kesiapan) hidup di /kasubag/kalkulasi#kirim; tombol Kirim di dashboard
// akan jadi jalan pintas yang melewati semuanya. "Kirim rekap" cuma menunjuk
// ke sana.
//
// BAR PROGRES BIRU/TEAL, BUKAN HIJAU/KUNING/MERAH: tiga warna itu di aplikasi
// ini berarti status kirim (terkirim / tertahan / dikembalikan), dan bar yang
// menyala hijau di tengah jalan terbaca "sudah beres".
// ============================================================================

const CHIP_KIRIM: Record<
  KeadaanPeriode,
  { teks: string; kelas: string; Ikon: typeof RiCheckLine }
> = {
  TERKIRIM: { teks: "Terkirim & terkunci", kelas: "text-green", Ikon: RiCheckLine },
  DIKEMBALIKAN: { teks: "Dikembalikan PPABP", kelas: "text-red", Ikon: RiAlertLine },
  BELUM_KIRIM: { teks: "Belum dikirim ke PPABP", kelas: "text-gold-deep", Ikon: RiTimeLine },
  BELUM_DIHITUNG: { teks: "Belum dihitung", kelas: "text-muted", Ikon: RiTimeLine },
};

function ChipKirim({ keadaan, kecil = false }: { keadaan: KeadaanPeriode; kecil?: boolean }) {
  const { teks, kelas, Ikon } = CHIP_KIRIM[keadaan];
  // Teks + ikon + warna: status tidak pernah hanya warna.
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-white font-semibold ${kelas} ${
        kecil ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-0.5 text-xs"
      }`}
    >
      <Ikon aria-hidden="true" className="size-3.5 shrink-0" />
      {teks}
    </span>
  );
}

/**
 * Kartu komponen BERJALAN (permintaan user 2026-10-27): lima komponen dalam
 * urutan presensi -> kinerja -> Tukin -> uang makan -> uang lembur, yang
 * SELESAI disembunyikan sehingga yang belum beres maju ke depan. Hanya TIGA
 * terdepan yang tampil, tanpa gulir; kartu berikutnya baru muncul setelah
 * salah satu di depannya selesai.
 *
 * Kartu putih bercahaya (warna tetap - keputusan user) + ikon raksasa
 * terpotong di sudut sebagai pengganti ilustrasi kartu modul rujukan Filko.
 * Warna kartu mengikuti KOMPONEN-nya, bukan posisinya: Tukin tetap kuning
 * walau ia maju ke kartu pertama.
 */
const GAYA_KARTU: Record<KodeKomponen, { nuansa: 1 | 2 | 3 | 4; Ikon: IconType }> = {
  PRESENSI: { nuansa: 1, Ikon: RiCalendarCheckLine },
  KINERJA: { nuansa: 2, Ikon: RiAwardLine },
  TUKIN: { nuansa: 4, Ikon: RiMoneyDollarCircleLine },
  UANG_MAKAN: { nuansa: 3, Ikon: FaUtensils },
  UANG_LEMBUR: { nuansa: 1, Ikon: FaClock },
};

/** Kartu yang tampil sudah pasti BELUM selesai; statusnya tinggal "mulai" vs "kurang". */
function statusKartu(k: KartuKomponen): string {
  const dihitung = k.kode === "TUKIN" || k.kode === "UANG_MAKAN" || k.kode === "UANG_LEMBUR";
  if (k.x === 0) return dihitung ? "Belum dihitung" : "Belum ada data";
  // Sebab rincinya (basi, golongan) ada di catatan stepper di bawah.
  return "Belum lengkap";
}

export function KartuSambutanUnit({
  nama,
  satuanKerja,
  periodeLabel,
  ringkas,
  keadaanKirim,
  qPeriode,
  totalPegawaiAktif,
  kartu,
  sisaLangkah,
}: {
  nama: string;
  satuanKerja: string;
  /** Mis. "Juli 2026". */
  periodeLabel: string;
  ringkas: { selesai: number; total: number; aktif: LangkahPeriode | null };
  keadaanKirim: KeadaanPeriode;
  qPeriode: string;
  totalPegawaiAktif: number;
  /** Dari `daftarKartuKomponen` - urutan sudah final, yang selesai disaring di sini. */
  kartu: KartuKomponen[];
  /** Langkah yang belum selesai, berurutan - untuk kalimat & daftar "tinggal ...". */
  sisaLangkah: { kode: KodeLangkah; judul: string }[];
}) {
  const belumSelesai = kartu.filter((k) => !k.selesai);
  // Tiga terdepan dari antrean; sisanya menunggu giliran.
  const tampil = belumSelesai.slice(0, 3);
  const terkirim = keadaanKirim === "TERKIRIM";
  const persen = ringkas.total > 0 ? Math.round((ringkas.selesai / ringkas.total) * 100) : 0;

  // Tombol SELALU menunjuk langkah aktif, juga saat rekap dikembalikan PPABP:
  // pekerjaan berikutnya sesudah pengembalian bisa periksa tabel (centangnya
  // direset) atau hitung ulang - bukan membaca catatan, yang sudah tampil di
  // langkah Kirim.
  const tombol = ringkas.aktif
    ? { label: LABEL_TOMBOL_LANGKAH[ringkas.aktif.kode], href: tautanLangkah(ringkas.aktif.kode, qPeriode) }
    : null;

  // "Komponen lengkap" BUKAN "semua beres": sesudah data lengkap masih ada
  // pekerjaan manusia (periksa tabel, kirim). Kalimatnya menyebut sisanya,
  // supaya tidak terbaca seperti tidak ada lagi yang harus dikerjakan.
  const kecil = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const judulSisa = sisaLangkah.map((l) => l.judul);
  const kalimatSisa =
    judulSisa.length === 0
      ? ""
      : judulSisa.length === 1
        ? ` Tinggal ${kecil(judulSisa[0])}.`
        : ` Tinggal ${judulSisa.slice(0, -1).map(kecil).join(", ")}, lalu ${kecil(judulSisa[judulSisa.length - 1])}.`;

  return (
    <section
      aria-label="Ringkasan tutup bulan"
      className="gj-masuk grid grid-cols-1 gap-6 rounded-2xl bg-navy p-6 text-white shadow-sm lg:grid-cols-12 lg:p-8"
    >
      <div className="flex flex-col justify-between gap-5 lg:col-span-5">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <ChipKirim keadaan={keadaanKirim} />
          </div>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
            Halo, {sapaanNama(nama)}{" "}
            {/* Emoji aria-hidden: pembaca layar melafalkannya di tengah kalimat
                sapaan tanpa menambah arti. */}
            <span aria-hidden="true">👋</span>
          </h1>
          {/* Nama unit dan periode di BARIS TERPISAH (permintaan user
              2026-10-27): nama unit sering panjang, dan periode yang ikut
              terlipat di tengahnya sulit ditemukan sekilas. */}
          <p className="mt-1 text-sm font-semibold text-white">{satuanKerja}</p>
          <p className="text-sm text-white/80">Periode {periodeLabel}</p>

          {terkirim ? (
            <p className="mt-4 text-base font-semibold">
              Rekap {periodeLabel} sudah dikirim dan terkunci.
            </p>
          ) : ringkas.total === 0 ? (
            <p className="mt-4 text-base font-semibold">
              Belum ada langkah yang bisa dihitung untuk {periodeLabel}: tidak ada pegawai aktif
              yang ikut periode ini (unit kosong atau seluruh pegawainya dikecualikan).
            </p>
          ) : (
            <p className="mt-4 text-base font-semibold">
              <span className="font-mono text-2xl font-black">{ringkas.selesai}</span> dari{" "}
              {/* Tanpa nama bulan - periodenya sudah tertulis di baris
                  "Periode ..." tepat di atas (permintaan user 2026-10-27). */}
              <span className="font-mono">{ringkas.total}</span> langkah selesai
            </p>
          )}

          {ringkas.total > 0 && (
            <div
              role="progressbar"
              aria-label={`Langkah tutup bulan ${periodeLabel}`}
              aria-valuemin={0}
              aria-valuemax={ringkas.total}
              aria-valuenow={ringkas.selesai}
              className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/20"
            >
              <div className="h-full rounded-full bg-seri-4" style={{ width: `${persen}%` }} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          {tombol && (
            <Link
              href={tombol.href}
              className="inline-flex items-center rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-navy shadow-sm transition hover:bg-teal-tint"
            >
              {tombol.label}
            </Link>
          )}
          <Link
            href={`/kasubag/pegawai?satker=${encodeURIComponent(satuanKerja)}`}
            className="text-sm font-semibold text-white underline underline-offset-4 hover:text-white/80"
          >
            Pegawai unit ({totalPegawaiAktif})
          </Link>
        </div>
      </div>

      {/* Kolom kanan, deret <ul>, dan tiap <li> SEMUANYA h-full: tanpa itu
          kartu menyusut ke tinggi isinya, alih-alih setinggi kolom sapaan. */}
      <div className="flex min-w-0 flex-col lg:col-span-7">
        {belumSelesai.length === 0 ? (
          // Semua komponen beres: satu pernyataan, bukan deret kartu kosong.
          // Ikon raksasa terpotong di sudut = pengganti ilustrasi, sama dengan
          // kartu komponen (hiasan, aria-hidden).
          <div className="relative flex h-full min-h-40 items-center gap-3 overflow-hidden rounded-2xl bg-white/10 p-5">
            <RiCheckDoubleLine
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-10 -right-8 size-48 text-white/10"
            />
            <RiCheckLine aria-hidden="true" className="relative size-6 shrink-0" />
            <p className="relative text-sm font-semibold">
              Data semua komponen sudah lengkap.{kalimatSisa}
            </p>
          </div>
        ) : (
          <>
            {/* HANYA TIGA KARTU, TANPA GULIR (keputusan user 2026-10-27).
                Kartu keempat dan kelima tidak tampil sama sekali sampai kartu
                di depannya selesai - antreannya yang bergeser, bukan orangnya
                yang menggeser. */}
            <ul
              aria-label="Komponen berikutnya yang belum selesai"
              className={`grid h-full flex-1 grid-cols-1 gap-3.5 ${
                tampil.length === 3 ? "sm:grid-cols-3" : tampil.length === 2 ? "sm:grid-cols-2" : ""
              }`}
            >
              {tampil.map((k, i) => {
                const { nuansa, Ikon } = GAYA_KARTU[k.kode];
                return (
                  <li key={k.kode} className="h-full">
                    <KartuBercahaya
                      nuansa={nuansa}
                      tundaMs={120 + i * 55}
                      // overflow-hidden memotong ikon raksasa di sudut kartu.
                      kelas="min-h-40 overflow-hidden"
                    >
                      {/* Ikon raksasa terpotong di sudut = pengganti ilustrasi,
                          berwarna aksen kartunya. Hiasan murni (aria-hidden). */}
                      <Ikon
                        aria-hidden="true"
                        className="pointer-events-none absolute -bottom-6 -right-6 size-32 opacity-20"
                        style={{ color: `var(--cahaya-${nuansa}-ikon-warna)` }}
                      />
                      {/* Tiga baris: nama, angka, status singkat. */}
                      <div className="relative text-ink">
                        <h2 className="text-sm font-bold text-ink-2">{k.nama}</h2>
                        <p className="mt-1 text-sm">
                          <span className="font-mono text-2xl font-black">{k.x}</span>
                          {k.y !== null && <span className="font-mono text-ink-2">/{k.y}</span>} pegawai
                        </p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-gold-deep">
                          <RiTimeLine aria-hidden="true" className="size-3.5 shrink-0" />
                          {statusKartu(k)}
                        </p>
                      </div>
                    </KartuBercahaya>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
