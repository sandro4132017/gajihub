import Link from "next/link";
import type { KomposisiPegawai } from "../business-logic/komposisiPegawai";
import { potonganGolonganPie } from "../business-logic/komposisiPegawai";
import { KartuGrafik, angkaId as angka, type PotonganSeri } from "./KitGrafik";
import { IkonBercahaya, KartuBercahaya, type NuansaKpi } from "./KartuKpi";
import { DonatInteraktif } from "./DonatInteraktif";

// Chrome kartunya diambil dari KitGrafik - SATU sumber untuk seluruh kartu
// dashboard.
//
// ============================================================================
// TIGA PIE KOMPOSISI PEGAWAI (permintaan user 2026-10-22: "pns/pppk pakai pie
// chart, golongan pakai pie chart, jumlah gender pakai pie chart").
//
// Warna dipilih per ENTITAS dan sudah diuji - lihat catatan warna seri di
// globals.css.
//
// TANPA LEGENDA PERMANEN (permintaan user 2026-10-22: "cukup ketika hover
// muncul keterangan, jadi gak makan tempat card"). Angkanya pindah ke
// keterangan yang muncul saat grafik disorot, diketuk, atau difokus - lihat
// DonatInteraktif.tsx. Yang DIKORBANKAN dan perlu diketahui: dua warna di
// sini kontrasnya di bawah 3:1, dan uji palet mensyaratkan label yang
// TERLIHAT untuk itu. Keterangan saat-disorot memenuhinya hanya separuh -
// angkanya ada, tapi tidak tampil sampai dicari.
//
// Ketiganya TIDAK mengikuti filter periode - roster bukan besaran periodik -
// dan tiap kartu menyebutnya lewat meta "Terkini".
// ============================================================================

/** Warna tiap potongan pie golongan, menurut KODE - bukan menurut urutan. */
const WARNA_GOLONGAN: Record<string, { isi: string; garis: string }> = {
  "pns-I": { isi: "bg-ramp-1", garis: "stroke-ramp-1" },
  "pns-II": { isi: "bg-ramp-2", garis: "stroke-ramp-2" },
  "pns-III": { isi: "bg-ramp-3", garis: "stroke-ramp-3" },
  "pns-IV": { isi: "bg-ramp-4", garis: "stroke-ramp-4" },
  pppk: { isi: "bg-seri-4", garis: "stroke-seri-4" },
  "tidak-terbaca": { isi: "bg-seri-3", garis: "stroke-seri-3" },
};

/**
 * Chrome kartu pie - SAMA dengan kartu "Total Pegawai Aktif" di sebelahnya
 * (permintaan user 2026-10-22): cahaya pastel, ikon bulat di kiri atas, label
 * tebal, tanpa subjudul.
 *
 * "Keadaan terkini, tidak mengikuti filter periode" yang dulu jadi meta kartu
 * pindah ke kaki keterangan saat-disorot - tidak memakan tempat, dan tetap
 * tertulis di tempat orang membaca angkanya.
 *
 * `hover:z-30 focus-within:z-30`: keterangan menjulur ke bawah kartu, dan
 * tanpa penaik ini ia tertimpa kartu baris berikutnya.
 */
function KartuPie({
  judul,
  nuansa,
  ikon,
  tundaMs,
  children,
}: {
  judul: string;
  nuansa: NuansaKpi;
  ikon: React.ReactNode;
  tundaMs: number;
  children: React.ReactNode;
}) {
  return (
    <KartuBercahaya nuansa={nuansa} tundaMs={tundaMs} kelas="hover:z-30 focus-within:z-30">
      <div className="relative">
        <IkonBercahaya nuansa={nuansa}>{ikon}</IkonBercahaya>
        <div className="mt-3">{children}</div>
        <h2 className="mt-3 text-sm font-bold text-ink-2">{judul}</h2>
      </div>
    </KartuBercahaya>
  );
}

const CATATAN_TERKINI = "Keadaan terkini - tidak mengikuti filter periode.";

const IKON = {
  pegawai: (
    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  instansi: (
    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
    </svg>
  ),
  jenis: (
    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  golongan: (
    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 20h4V10H3v10zm7 0h4V4h-4v16zm7 0h4v-7h-4v7z" />
    </svg>
  ),
  kelamin: (
    <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14v7m-3-3h6" />
    </svg>
  ),
};

export function KartuPieJenisKepegawaian({ komposisi: k, tundaMs }: { komposisi: KomposisiPegawai; tundaMs: number }) {
  return (
    // Potongannya "PNS" & "PPPK", BUKAN "ASN" & "PPPK": menurut UU ASN,
    // PPPK juga ASN - potongan berlabel "ASN" menyiratkan PPPK bukan
    // bagian darinya.
    <KartuPie judul="Pegawai Aktif" nuansa={1} ikon={IKON.pegawai} tundaMs={tundaMs}>
      <DonatInteraktif
        total={k.total}
        labelTengah="pegawai aktif"
        potongan={[
          { kode: "pns", label: "PNS", jumlah: k.pns, kelasIsi: "bg-seri-1", kelasGaris: "stroke-seri-1", keterangan: "termasuk CPNS" },
          { kode: "p3k", label: "PPPK", jumlah: k.p3k, kelasIsi: "bg-seri-4", kelasGaris: "stroke-seri-4" },
          {
            kode: "tanpa",
            label: "Belum diketahui",
            jumlah: k.tanpaIdentitasWebGaji,
            kelasIsi: "bg-seri-3",
            kelasGaris: "stroke-seri-3",
            keterangan: "belum ada identitas Web Gaji",
          },
        ]}
        // Sumbernya tetap DISEBUT: pie golongan di sebelahnya memakai dasar
        // lain dan angkanya memang tidak persis sama.
        catatan={`Menurut identitas Web Gaji - dasar yang sama dengan pemisahan berkas ADK. ${CATATAN_TERKINI}`}
      />
    </KartuPie>
  );
}

export function KartuPieInstansi({ komposisi: k, tundaMs }: { komposisi: KomposisiPegawai; tundaMs: number }) {
  return (
    <KartuPie judul="Instansi" nuansa={2} ikon={IKON.instansi} tundaMs={tundaMs}>
      <DonatInteraktif
        total={k.total}
        labelTengah="pegawai aktif"
        tengah="terbesar"
        potongan={[
          { kode: "pusat", label: "Kantor Pusat", jumlah: k.kantorPusat, kelasIsi: "bg-seri-6", kelasGaris: "stroke-seri-6" },
          {
            kode: "upt",
            label: "UPT Daerah",
            jumlah: k.uptDaerah,
            kelasIsi: "bg-seri-7",
            kelasGaris: "stroke-seri-7",
            keterangan: "satuan kerja berawalan \"Balai\"",
          },
          {
            kode: "tanpa",
            label: "Belum diketahui",
            jumlah: k.instansiTidakDiketahui,
            kelasIsi: "bg-seri-3",
            kelasGaris: "stroke-seri-3",
            keterangan: "satuan kerja penampung",
          },
        ]}
        // Aturannya DISEBUT di layar: pengelompokan ini turunan dari nama
        // satuan kerja, bukan kolom resmi - pembacanya berhak tahu.
        catatan={`Dari nama satuan kerja ("Balai" = UPT), sudah diadu ke eselon unit di SIAP. ${CATATAN_TERKINI}`}
      />
    </KartuPie>
  );
}

export function KartuPieGolongan({ komposisi: k, tundaMs }: { komposisi: KomposisiPegawai; tundaMs: number }) {
  const potongan: PotonganSeri[] = potonganGolonganPie(k).map((p) => ({
    ...p,
    kelasIsi: WARNA_GOLONGAN[p.kode]?.isi ?? "bg-line",
    kelasGaris: WARNA_GOLONGAN[p.kode]?.garis ?? "stroke-line",
  }));

  return (
    <KartuPie judul="Golongan" nuansa={3} ikon={IKON.golongan} tundaMs={tundaMs}>
      <DonatInteraktif
        total={k.total}
        labelTengah="pegawai aktif"
        tengah="terbesar"
        potongan={potongan}
        catatan={
          "Menurut format golongan." +
          (k.bedaIdentitasDenganGolongan > 0
            ? ` Pada ${angka(k.bedaIdentitasDenganGolongan)} pegawai berbeda dengan identitas Web Gaji di kartu Pegawai Aktif.`
            : "") +
          ` ${CATATAN_TERKINI}`
        }
      />
    </KartuPie>
  );
}

export function KartuPieJenisKelamin({ komposisi: k, tundaMs }: { komposisi: KomposisiPegawai; tundaMs: number }) {
  return (
    <KartuPie judul="Jenis Kelamin" nuansa={4} ikon={IKON.kelamin} tundaMs={tundaMs}>
      <DonatInteraktif
        total={k.total}
        labelTengah="pegawai aktif"
        tengah="terbesar"
        potongan={[
          { kode: "l", label: "Laki-laki", jumlah: k.lelaki, kelasIsi: "bg-seri-2", kelasGaris: "stroke-seri-2" },
          { kode: "p", label: "Perempuan", jumlah: k.perempuan, kelasIsi: "bg-seri-5", kelasGaris: "stroke-seri-5" },
          {
            kode: "x",
            label: "Tidak tercatat",
            jumlah: k.jenisKelaminTidakTercatat,
            kelasIsi: "bg-seri-3",
            kelasGaris: "stroke-seri-3",
          },
        ]}
        catatan={`Penentu PTKP wanita kawin (PMK 168/2023), bukan statistik kepegawaian. ${CATATAN_TERKINI}`}
      />
    </KartuPie>
  );
}

// ============================================================================
// KARTU DATA YANG MENGHALANGI PEMBAYARAN
//
// Kartunya sendiri, bukan strip di kaki kartu lain: temuan yang paling mahal
// kalau terlewat tidak boleh ditaruh di tempat yang gampang terlewat
// (Selective Attention).
//
// Bentuknya satu baris per kategori dengan batang HORIZONTAL: panjang batang
// membuat perbandingan antarbutir terbaca tanpa menghitung angka. HTML biasa,
// dirender server, tanpa SVG dan tanpa JS.
//
// Urut dari yang paling banyak menghalangi pembayaran; yang bernilai nol
// DIBUANG supaya butir yang bukan nol menonjol (Von Restorff). Tidak ada
// total: satu pegawai bisa masuk lebih dari satu butir, jadi penjumlahannya
// menghitung orang yang sama berulang kali.
//
// Tiap butir menyebut AKIBATNYA dan selalu terlihat (bukan hanya saat hover -
// hover tidak ada di layar sentuh). "4 pegawai belum punya kelas jabatan"
// tanpa akibat terbaca seperti kerapian data; dengan akibatnya, ia terbaca
// seperti empat orang yang tunjangan kinerjanya tidak bisa dihitung.
// ============================================================================

interface Kekurangan {
  kode: string;
  jumlah: number;
  ringkas: string;
  akibat: string;
  tautan: string;
  labelTautan: string;
}

/** Lebar minimum batang (persen) supaya "ada" tetap berbeda dari "nol". */
const LEBAR_MIN = 2;

/**
 * Buang butir bernilai nol, lalu urutkan menurun. Sort stabil: jumlah yang
 * sama tetap mengikuti urutan deklarasi, jadi tampilannya tidak berubah-ubah.
 */
export function urutkanKekurangan<T extends { jumlah: number }>(daftar: T[]): T[] {
  return daftar.filter((x) => x.jumlah > 0).sort((a, b) => b.jumlah - a.jumlah);
}

/**
 * Lebar batang dalam persen terhadap butir terbanyak (`maks`).
 *
 * Skalanya dari nol. Tanpa lantai, nilai kecil (1 atau 2 di samping 120)
 * lebarnya di bawah 1px dan batangnya hilang, padahal "ada" harus tampak
 * beda dari "nol". Angka aslinya tetap tercetak di samping batang.
 */
export function lebarBatangPersen(jumlah: number, maks: number): number {
  return maks <= 0 ? 0 : Math.max((jumlah / maks) * 100, LEBAR_MIN);
}

export function KartuKelengkapanData({
  komposisi,
  tanpaRekening,
  readOnly,
  kelas,
  tundaMs,
}: {
  komposisi: KomposisiPegawai;
  /** Pegawai aktif yang belum punya satu pun baris RekeningPegawai. */
  tanpaRekening: number;
  readOnly: boolean;
  kelas?: string;
  tundaMs: number;
}) {
  const k = komposisi;

  const kekurangan: Kekurangan[] = urutkanKekurangan<Kekurangan>([
    {
      kode: "identitas",
      jumlah: k.tanpaIdentitasWebGaji,
      ringkas: "Tanpa identitas Web Gaji",
      akibat: "keluar dari berkas ADK begitu jenis pegawai disaring",
      tautan: "/ppabp/basis-data-gaji",
      labelTautan: "Basis data gaji",
    },
    {
      kode: "rekening",
      jumlah: tanpaRekening,
      ringkas: "Tanpa rekening",
      akibat: "nominalnya terhitung tapi tidak ada tujuan transfernya",
      tautan: "/ppabp/rekening",
      labelTautan: "Rekening",
    },
    {
      kode: "kelas-jabatan",
      jumlah: k.tanpaKelasJabatan,
      ringkas: "Tanpa kelas jabatan",
      akibat: "tarif Tunjangan Kinerja tidak bisa ditentukan",
      tautan: "/pegawai",
      labelTautan: "Data pegawai",
    },
    {
      kode: "golongan",
      jumlah: k.golonganTidakTerbaca,
      ringkas: "Golongan tidak terbaca",
      akibat: "tarif uang makan & lembur tidak bisa ditentukan",
      tautan: "/pegawai",
      labelTautan: "Data pegawai",
    },
    {
      kode: "ptkp",
      jumlah: k.ptkpTidakBisaDitentukan,
      ringkas: "Status kawin tidak sah",
      akibat: "PTKP tidak bisa ditentukan",
      tautan: "/pegawai",
      labelTautan: "Data pegawai",
    },
  ]);
  const maks = kekurangan[0]?.jumlah ?? 0;

  return (
    <KartuGrafik
      judul="Data yang Menghalangi Pembayaran"
      subjudul="Kekurangan data pokok pegawai aktif, bukan temuan periode ini"
      meta="Keadaan terkini"
      kelas={kelas}
      tundaMs={tundaMs}
    >
      {kekurangan.length === 0 ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-green">
          <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Data pokok seluruh pegawai aktif di cakupan ini lengkap.
        </p>
      ) : (
        <>
          <ul
            aria-label="Data yang menghalangi pembayaran, diurutkan dari yang terbanyak"
            className="divide-y divide-line-2"
          >
            {kekurangan.map((x) => (
              // Urutan DOM = urutan baca di layar sempit: label + angka, batang,
              // keterangan, tautan. Dari sm elemen yang sama ditempatkan ke tiga
              // kolom [label+keterangan | batang | angka+tautan] tanpa duplikasi.
              <li
                key={x.kode}
                className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-1.5 py-2.5 sm:grid-cols-[13rem_1fr_auto]"
              >
                <p className="text-xs font-semibold text-ink sm:col-start-1 sm:row-start-1">{x.ringkas}</p>
                <p className="justify-self-end font-mono text-sm font-bold text-ink sm:col-start-3 sm:row-start-1">
                  {angka(x.jumlah)}
                </p>
                <div
                  aria-hidden="true"
                  className="col-span-2 h-2 self-center rounded-full bg-line-2 sm:col-span-1 sm:col-start-2 sm:row-span-2 sm:row-start-1"
                >
                  <div
                    className="h-2 rounded-full bg-gold-deep"
                    style={{ width: `${lebarBatangPersen(x.jumlah, maks)}%` }}
                  />
                </div>
                <p className="col-span-2 text-[11px] leading-relaxed text-muted sm:col-span-1 sm:col-start-1 sm:row-start-2">
                  {x.akibat}
                </p>
                {!readOnly && (
                  <Link
                    href={x.tautan}
                    className="col-span-2 text-[11px] font-semibold text-teal-deep underline sm:col-span-1 sm:col-start-3 sm:row-start-2 sm:justify-self-end"
                  >
                    {x.labelTautan} &rarr;
                  </Link>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-muted">
            Panjang batang dibanding butir terbanyak; satu pegawai bisa masuk lebih dari satu butir.
          </p>
        </>
      )}
    </KartuGrafik>
  );
}
