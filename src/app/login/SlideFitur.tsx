import type { CSSProperties } from "react";

const DURASI_SLIDE_DETIK = 5;

type Slide = {
  judul: string;
  teks: string;
  gambar: string | null;
};

// Data slide
const SLIDE: Slide[] = [
  {
    judul: "Tarik Data Presensi Otomatis",
    teks: "Kehadiran pegawai langsung ditarik dari e-presensi",
    gambar: "/ilustrasi/ilustrasi1.png", 
  },
  {
    judul: "Tiga Komponen, Satu Proses",
    teks: "Hitung Tunjangan Kinerja, Uang Makan, dan Uang Lembur sekaligus.",
    gambar: "/ilustrasi/ilustrasi2.png", 
  },
  {
    judul: "Dari Perhitungan hingga Siap Bayar",
    teks: "Persetujuan berjenjang hingga ADK siap digunakan di Web Gaji.",
    gambar: "/ilustrasi/ilustrasi3.png", 
  },
];

type Latar = {
  kiri: string;
  atas: string;
  ukuran: string;
  warna: string;
  buram: number;
  detik: number;
  jeda: number;
};

const LATAR: Latar[] = [
  { kiri: "-14%", atas: "-8%", ukuran: "340px", warna: "#3F72AF", buram: 0.5, detik: 26, jeda: 0 },
  { kiri: "62%", atas: "58%", ukuran: "400px", warna: "#FFFFFF", buram: 0.07, detik: 32, jeda: -9 },
  { kiri: "70%", atas: "-12%", ukuran: "240px", warna: "#3F72AF", buram: 0.34, detik: 22, jeda: -15 },
];

type Hiasan = {
  bentuk: "bulat" | "kotak" | "pil" | "cincin";
  kiri: string;
  atas: string;
  lebar: string;
  tinggi?: string;
  warna: string;
  buram: number;
  jarak: string;
  detik: number;
  jeda: number;
  depan?: boolean;
};

const HIASAN: Hiasan[] = [
  { bentuk: "bulat", kiri: "8%", atas: "14%", lebar: "22px", warna: "#3F72AF", buram: 0.95, jarak: "14px", detik: 6.4, jeda: 0 },
  { bentuk: "kotak", kiri: "85%", atas: "18%", lebar: "18px", warna: "#DBE2EF", buram: 0.5, jarak: "10px", detik: 7.8, jeda: -2.1 },
  { bentuk: "pil", kiri: "4%", atas: "68%", lebar: "36px", tinggi: "12px", warna: "#FFFFFF", buram: 0.5, jarak: "12px", detik: 6.9, jeda: -3.4 },
  { bentuk: "cincin", kiri: "89%", atas: "62%", lebar: "26px", warna: "#FFFFFF", buram: 0.4, jarak: "16px", detik: 8.4, jeda: -1.2 },
  { bentuk: "bulat", kiri: "20%", atas: "88%", lebar: "9px", warna: "#FFFFFF", buram: 0.6, jarak: "11px", detik: 7.2, jeda: -0.8 },
  { bentuk: "bulat", kiri: "76%", atas: "7%", lebar: "11px", warna: "#C8871F", buram: 0.85, jarak: "9px", detik: 5.8, jeda: -4.2, depan: true },
];

const SIKLUS_DETIK = SLIDE.length * DURASI_SLIDE_DETIK;

function jeda(indeks: number): CSSProperties {
  const mundur = (SLIDE.length - indeks) % SLIDE.length;
  return { animationDelay: `-${mundur * DURASI_SLIDE_DETIK}s` };
}

function Bentuk({ h }: { h: Hiasan }) {
  const cincin = h.bentuk === "cincin";

  const gaya: CSSProperties & Record<string, string | number> = {
    left: h.kiri,
    top: h.atas,
    width: h.lebar,
    height: h.tinggi ?? h.lebar,
    opacity: h.buram,
    animationDuration: `${h.detik}s`,
    animationDelay: `${h.jeda}s`,
    "--gj-jarak": h.jarak,
  };
  
  if (cincin) gaya.color = h.warna;
  else gaya.background = h.warna;

  const rupa = h.bentuk === "kotak" ? "gj-hias-kotak" : cincin ? "gj-hias-cincin" : "gj-hias-bulat";
  return <span className={`gj-hias ${rupa}`} style={gaya} />;
}

export function SlideFitur() {
  const gaya = { "--gj-siklus": `${SIKLUS_DETIK}s` } as CSSProperties;

  return (
    <div
      style={gaya}
      className="relative hidden w-full h-full select-none overflow-hidden bg-navy lg:flex lg:flex-col lg:items-center lg:justify-center"
    >
      {/*
        Animasi mengapung untuk ilustrasi slide.

        Ditulis di sini, bukan di globals.css - tapi itu berarti aturan
        `prefers-reduced-motion` di globals.css TIDAK menjangkaunya, dan
        selama beberapa waktu animasi ini memang tetap berjalan untuk orang
        yang sudah mematikan animasi di sistemnya. Guard-nya sekarang ikut
        ditulis di sini juga.

        Gerakan ini murni hiasan: mematikannya tidak menghilangkan keterangan
        apa pun, jadi dihentikan TOTAL - sama perlakuannya dengan .gj-latar
        dan .gj-hias di globals.css.
      */}
      <style>{`
        @keyframes float-image {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }
        .animate-float {
          animation: float-image 4s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-float { animation: none; }
        }
      `}</style>

      {/* Latar Belakang Gelembung / Asap */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        {LATAR.map((l, i) => (
          <span
            key={i}
            className="gj-latar"
            style={
              {
                left: l.kiri,
                top: l.atas,
                width: l.ukuran,
                height: l.ukuran,
                background: l.warna,
                opacity: l.buram,
                animationDuration: `${l.detik}s`,
                animationDelay: `${l.jeda}s`,
              } as CSSProperties
            }
          />
        ))}
        {HIASAN.filter((h) => !h.depan).map((h, i) => (
          <Bentuk key={i} h={h} />
        ))}
      </div>

      <div className="relative z-10 flex w-full max-w-[560px] flex-col items-center gap-[clamp(1.5rem,4vh,3rem)] px-8 py-10">
        
        {/* Panggung Ilustrasi Utama */}
        <div className="relative w-full aspect-[5/4] max-w-[480px]" aria-hidden="true">
          {SLIDE.map((slide, i) => (
            <div key={i} className="gj-slide absolute inset-0 flex items-center justify-center" style={jeda(i)}>
              {slide.gambar ? (
                /* 
                  CLASS 'animate-float' DITAMBAHKAN DI SINI 
                */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img 
                  src={slide.gambar} 
                  alt="" 
                  className="w-full h-full object-contain drop-shadow-2xl animate-float" 
                />
              ) : (
                /* Class animate-float juga diterapkan ke placeholder kalau kosong */
                <div className="flex w-full h-[80%] items-center justify-center rounded-2xl border-2 border-dashed border-white/20 text-sm font-medium text-white/40 animate-float">
                  Ilustrasi 3 Menyusul
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Teks Deskripsi Slide */}
        <div className="relative min-h-[8rem] w-full mt-2">
          {SLIDE.map((slide, i) => (
            <div
              key={slide.judul}
              className="gj-slide flex flex-col items-center gap-3 text-center"
              style={jeda(i)}
            >
              <h2 className="text-balance text-[1.4rem] sm:text-[1.6rem] font-semibold leading-tight tracking-tight text-white">
                {slide.judul}
              </h2>
              <p className="max-w-[24rem] text-[0.9rem] sm:text-[1rem] leading-relaxed text-[#C9D6E8]">
                {slide.teks}
              </p>
            </div>
          ))}
        </div>

        {/* Titik Paginasi Bawah */}
        <div className="flex items-center gap-2 mt-2" aria-hidden="true">
          {SLIDE.map((slide, i) => (
            <span key={slide.judul} className="gj-titik" style={jeda(i)} />
          ))}
        </div>
      </div>

      {/* Ornamen depan (kalo ada) */}
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
        {HIASAN.filter((h) => h.depan).map((h, i) => (
          <Bentuk key={i} h={h} />
        ))}
      </div>
    </div>
  );
}