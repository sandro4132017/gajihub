/**
 * Geometri irisan donat untuk grafik lingkaran tanpa JavaScript.
 *
 * KENAPA DONAT BER-`stroke-dasharray`, BUKAN `<path>` BUSUR. Busur SVG
 * (`A rx ry ...`) punya cacat terkenal di sudut tepat 360 derajat: titik awal
 * dan titik akhirnya jatuh di koordinat yang sama, dan yang tergambar bukan
 * lingkaran penuh melainkan TIDAK ADA APA-APA. Di papan ini keadaan "satu
 * kategori 100%" bukan kasus langka - di awal periode SEMUA unit berstatus
 * belum kirim, dan di akhir periode idealnya semua terkirim. Grafik yang
 * menghilang justru pada dua keadaan paling sering bukan grafik.
 *
 * PEMBULATAN DIPISAH DARI GEOMETRI. `persen` dibulatkan karena dibaca manusia;
 * `panjangBusur` memakai pecahan penuh. Kalau geometrinya ikut memakai persen
 * bulat, tiga irisan 33% menyisakan celah 1% di cincin - garis putih tipis
 * yang terbaca sebagai kategori keempat yang tidak ada.
 */
export interface BagianDonat {
  kunci: string;
  nilai: number;
}

export interface IrisanDonat {
  kunci: string;
  nilai: number;
  /** Dibulatkan - untuk dibaca, bukan untuk digambar. */
  persen: number;
  /** Isi `stroke-dasharray` bagian terisi. */
  panjangBusur: number;
  /** Isi `stroke-dashoffset`. Negatif = irisan berikutnya digeser maju. */
  geser: number;
  /**
   * Di pecahan keliling ke berapa irisan ini MULAI (0..1).
   *
   * Dipakai menjadwalkan animasi supaya cincinnya tergambar searah jarum jam,
   * bukan tiga irisan mekar berbarengan. Diturunkan di sini, bukan dihitung
   * ulang dari `geser` di komponennya: membalik tanda negatif lalu membaginya
   * dengan keliling adalah aritmetika yang gampang salah dan tidak akan
   * ketahuan - yang terjadi cuma urutan animasi yang aneh.
   */
  mulaiPecahan: number;
}

export function irisanDonat(bagian: readonly BagianDonat[], keliling: number): IrisanDonat[] {
  const total = bagian.reduce((n, b) => n + Math.max(0, b.nilai), 0);
  let kumulatif = 0;

  return bagian.map((b) => {
    const nilai = Math.max(0, b.nilai);
    // Total nol BUKAN kesalahan - itu periode yang belum punya satuan kerja
    // sama sekali. Yang tergambar cincin kosong, bukan NaN yang membuat
    // seluruh SVG-nya lenyap tanpa pesan apa pun.
    const pecahan = total > 0 ? nilai / total : 0;
    const irisan: IrisanDonat = {
      kunci: b.kunci,
      nilai,
      persen: Math.round(pecahan * 100),
      panjangBusur: pecahan * keliling,
      geser: -kumulatif * keliling,
      mulaiPecahan: kumulatif,
    };
    kumulatif += pecahan;
    return irisan;
  });
}
