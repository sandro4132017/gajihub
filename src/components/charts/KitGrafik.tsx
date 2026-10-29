import { pecahanKomposisi, persenKomposisi } from "../../business-logic/komposisiPegawai";

// ============================================================================
// KIT GRAFIK DASHBOARD - chrome kartu dan donat.
//
// SATU SUMBER untuk bentuk kartu & grafik di dashboard. Chrome yang disalin
// per tempat selalu berakhir dengan padding, tebal garis, dan ukuran judul
// yang menyimpang satu sama lain, dan di layar yang gunanya membandingkan
// angka, kartu yang terlihat berbeda menyiratkan isi yang berbeda derajatnya.
//
// DIGAMBAR SENDIRI, TANPA PUSTAKA: proyek ini tidak punya satu pun pustaka
// grafik, dan menambahkannya berarti menambah dependensi ke repo PUBLIK demi
// bentuk yang bisa ditulis sebagai HTML biasa. Konsekuensinya semuanya tetap
// jalan tanpa JavaScript - halaman ini dirender di server.
//
// SVG CUMA UNTUK GAMBAR TANPA TEKS (donat). Teks di dalam viewBox SVG ikut
// diskalakan bersama gambarnya, jadi ukuran hurufnya berubah mengikuti lebar
// kartu - angka yang HARUS terbaca ditulis sebagai teks HTML berukuran nyata.
// ============================================================================

export const angkaId = (n: number) => new Intl.NumberFormat("id-ID").format(n);

/**
 * Persen untuk DIBACA, bukan untuk menggambar.
 *
 * Satu orang dari 5.062 dibulatkan jadi 0%, dan "1 - 0%" di legenda terbaca
 * seperti kontradiksi: ada orangnya tapi tidak ada porsinya. Bagian yang ada
 * isinya tapi terlalu kecil untuk persen bulat ditulis "<1%". Geometri tetap
 * memakai pecahan aslinya - fungsi ini cuma soal teks.
 */
export function persenTeks(bagian: number, total: number): string {
  const persen = persenKomposisi(bagian, total);
  return bagian > 0 && persen === 0 ? "<1%" : `${persen}%`;
}

/**
 * Sela antar potongan donat, dalam pecahan keliling. Yang memisahkan potongan
 * adalah SELA BERWARNA LATAR, bukan garis tepi mengelilingi tiap potongan -
 * garis tepi menambah tinta yang bukan data.
 */
const SELA_DONAT = 0.006;

/** Chrome kartu - satu-satunya tempat bentuk kartu dashboard ditetapkan. */
export function KartuGrafik({
  judul,
  subjudul,
  meta,
  aksi,
  kelas = "",
  tundaMs,
  children,
}: {
  judul: string;
  subjudul?: string;
  meta?: string;
  /** Kendali di kanan atas kartu (pencarian, penyaring). */
  aksi?: React.ReactNode;
  /** Kelas lebar grid dari pemanggil, mis. "lg:col-span-4". */
  kelas?: string;
  tundaMs: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`gj-masuk flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-xs ${kelas}`}
      style={{ animationDelay: `${tundaMs}ms` }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line-2 pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">{judul}</h2>
          {subjudul && <p className="text-xs text-muted">{subjudul}</p>}
        </div>
        {aksi ?? (meta && <span className="shrink-0 text-xs font-semibold text-muted">{meta}</span>)}
      </div>
      <div className="mt-4 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export interface PotonganSeri {
  kode: string;
  label: string;
  jumlah: number;
  /** Kelas isian, mis. "bg-seri-1". Dipilih per ENTITAS, bukan per urutan. */
  kelasIsi: string;
  kelasGaris: string;
  keterangan?: string;
}

export interface BusurDonat {
  potongan: PotonganSeri;
  /** Panjang busur, pecahan keliling (pathLength = 1), SUDAH dipotong sela. */
  panjang: number;
  /** Titik mulai busur, pecahan keliling dari arah jam 12. */
  mulai: number;
}

/**
 * Geometri busur donat - PURE, dipakai donat statis maupun donat interaktif.
 *
 * Satu rumus untuk keduanya DENGAN SENGAJA: dua salinan rumus sudut cepat atau
 * lambat berbeda sedikit, dan donat yang sama di dua kartu jadi berbeda
 * bentuk tanpa ada yang tahu kenapa.
 */
/**
 * Potongan dengan jumlah terbesar - bahan ringkasan di tengah cincin.
 *
 * Kalau seri, yang MENANG yang lebih dulu di daftar: urutan potongan sudah
 * ditetapkan pemanggil (PNS sebelum PPPK, Gol I sebelum Gol IV), jadi hasilnya
 * tetap sama tiap kali halaman dibuka - bukan bergantung pada urutan sort.
 * Null kalau tidak ada potongan yang berisi.
 */
export function potonganTerbesar(potongan: readonly PotonganSeri[]): PotonganSeri | null {
  let juara: PotonganSeri | null = null;
  for (const p of potongan) if (p.jumlah > 0 && (juara === null || p.jumlah > juara.jumlah)) juara = p;
  return juara;
}

export function hitungBusurDonat(potongan: readonly PotonganSeri[], total: number): BusurDonat[] {
  let mulai = 0;
  return potongan
    .filter((p) => p.jumlah > 0)
    .map((p) => {
      const pecahan = pecahanKomposisi(p.jumlah, total);
      // Potongan yang lebih tipis dari selanya akan HILANG kalau selanya
      // dipotong apa adanya; untuk itu selanya yang mengalah, bukan datanya.
      const busur = { potongan: p, panjang: Math.max(pecahan - SELA_DONAT, pecahan * 0.4), mulai };
      mulai += pecahan;
      return busur;
    });
}

/**
 * Donat bagian-dari-keseluruhan.
 *
 * SAH kalau potongannya sedikit (<= 6) dan pertanyaannya memang "berapa
 * bagian dari keseluruhan" - bukan "mana yang lebih besar di antara dua angka
 * yang mirip", yang justru tidak bisa dijawab bentuk lingkaran.
 */
/**
 * Kotak isi tengah cincin, DIBATASI KE LUBANGNYA. Cincin ber-r 38 dan
 * setebal 13 dari viewBox 100, jadi lubangnya bergaris tengah ~63% lebar
 * donat. Kotak `inset-0` membiarkan teks panjang ("Rp 240 jt") melebar
 * menembus cincin; inset 19% menyisakan ~62% - selebar lubangnya.
 */
export const KELAS_LUBANG_DONAT = "inset-[19%]";

/**
 * Ukuran angka di tengah cincin menurut panjangnya. Angka font-mono lebarnya
 * ~0,6em per karakter: "5.062" muat di text-lg, "Rp 240 jt" (9 karakter)
 * baru muat di lubang donat ~130px pada text-sm.
 */
export function kelasAngkaTengah(teks: string): string {
  if (teks.length <= 6) return "text-lg";
  if (teks.length <= 9) return "text-sm";
  return "text-xs";
}

export function Donat({
  potongan,
  total,
  angkaTengah,
  labelTengah,
  lebar = 150,
}: {
  potongan: PotonganSeri[];
  /** Pembagi sudut. Boleh berbeda dari jumlah potongan kalau ada sisa. */
  total: number;
  /** Teks besar di tengah cincin - sudah diformat pemanggil. */
  angkaTengah: string;
  labelTengah: string;
  lebar?: number;
}) {
  return (
    <div className="relative mx-auto aspect-square shrink-0" style={{ width: lebar }}>
      <svg viewBox="0 0 100 100" className="size-full" role="img" aria-label={labelTengah}>
        {/* Lingkaran dasar supaya cincinnya tetap berbentuk saat datanya kosong. */}
        <circle cx="50" cy="50" r="38" fill="none" strokeWidth="13" className="stroke-line-2" />
        {hitungBusurDonat(potongan, total).map(({ potongan: p, panjang, mulai }) => (
          <circle
            key={p.kode}
            cx="50"
            cy="50"
            r="38"
            fill="none"
            strokeWidth="13"
            pathLength="1"
            strokeDasharray={`${panjang} ${1 - panjang}`}
            strokeDashoffset={-mulai}
            className={p.kelasGaris}
            transform="rotate(-90 50 50)"
          >
            <title>{`${p.label}: ${angkaId(p.jumlah)} (${persenTeks(p.jumlah, total)})`}</title>
          </circle>
        ))}
      </svg>
      <div className={`absolute ${KELAS_LUBANG_DONAT} flex flex-col items-center justify-center text-center`}>
        <span className={`whitespace-nowrap font-mono font-black leading-none text-ink ${kelasAngkaTengah(angkaTengah)}`}>
          {angkaTengah}
        </span>
        <span className="mt-1 text-[10px] leading-tight text-muted">{labelTengah}</span>
      </div>
    </div>
  );
}

/**
 * Legenda berangka.
 *
 * WAJIB ADA, dan angkanya ikut. Dua dari tiga warna seri kontrasnya di bawah
 * 3:1 terhadap latar - itu boleh HANYA kalau nilainya terbaca sebagai teks.
 * Jadi legenda ini bukan hiasan, ia yang membuat paletnya sah.
 */
export function Legenda({
  potongan,
  total,
  nilaiTeks,
}: {
  potongan: PotonganSeri[];
  total: number;
  /** Pengganti angka mentah, mis. rupiah. Kembalikan null untuk menyembunyikan. */
  nilaiTeks?: (p: PotonganSeri) => string | null;
}) {
  return (
    <ul className="space-y-2">
      {potongan.map((p) => {
        const teks = nilaiTeks ? nilaiTeks(p) : angkaId(p.jumlah);
        return (
          <li key={p.kode} className="flex items-start justify-between gap-3">
            <span className="flex items-start gap-2">
              <span className={`mt-1 size-2.5 shrink-0 rounded-sm ${p.kelasIsi}`} aria-hidden="true" />
              <span>
                <span className="text-xs font-semibold text-ink">{p.label}</span>
                {p.keterangan && (
                  <span className="block text-[11px] leading-tight text-muted">{p.keterangan}</span>
                )}
              </span>
            </span>
            {teks !== null && (
              <span className="shrink-0 text-right">
                <span className="font-mono text-sm font-bold text-ink">{teks}</span>
                <span className="ml-1.5 font-mono text-[11px] text-muted">{persenTeks(p.jumlah, total)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
