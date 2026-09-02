import type React from "react";
import { KembalikanRekapForm } from "./KembalikanRekapForm";
import type { KeadaanPengiriman, ProgresUnit } from "../../../business-logic/pengirimanUnit";
import { cacahProgres } from "../../../business-logic/pengirimanUnit";
import { irisanDonat } from "../../irisanDonat";

const LABEL: Record<ProgresUnit["keadaan"], string> = {
  TERKIRIM: "Terkirim",
  DIKEMBALIKAN: "Dikembalikan",
  BELUM_KIRIM: "Belum kirim",
};

const WARNA: Record<ProgresUnit["keadaan"], string> = {
  TERKIRIM: "chip-ok",
  DIKEMBALIKAN: "chip-wait",
  BELUM_KIRIM: "chip-draft",
};

/**
 * Warna irisan donat - senada dengan chip di tabel sebelahnya.
 *
 * Dua penanda untuk keadaan yang sama harus sewarna: kalau grafik memakai
 * palet sendiri, orang membaca "hijau" di grafik dan mencari "hijau" di tabel
 * yang ternyata bukan status yang sama.
 */
const WARNA_DONAT: Record<KeadaanPengiriman, string> = {
  TERKIRIM: "var(--color-green)",
  DIKEMBALIKAN: "var(--color-gold)",
  BELUM_KIRIM: "var(--color-line)",
};

/** Urutan irisan searah jarum jam - yang beres dulu, yang belum di akhir. */
const URUTAN_DONAT: readonly KeadaanPengiriman[] = ["TERKIRIM", "DIKEMBALIKAN", "BELUM_KIRIM"];

const JARI_JARI = 42;
const KELILING = 2 * Math.PI * JARI_JARI;

function tanggalTeks(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(d);
}

/**
 * Papan progres pengiriman rekap seluruh unit pada satu periode.
 *
 * MENJAWAB PERTANYAAN YANG SELAMA INI DIJAWAB LEWAT TELEPON: "unit mana yang
 * belum mengirim?". Sebelum ini PPABP hanya bisa melihat baris kalkulasi yang
 * sudah masuk - dan baris yang TIDAK ADA tidak kelihatan di mana pun, jadi
 * unit yang belum bekerja sama sekali justru yang paling tidak terlihat.
 *
 * Karena itu daftar unitnya datang dari daftar satuan kerja (`semuaUnit`),
 * bukan disimpulkan dari baris pengiriman yang ada - lihat `rangkumProgres`.
 *
 * DUA KARTU BERDAMPINGAN, bukan satu tabel panjang. Papan ini menjawab dua
 * pertanyaan yang berbeda ukurannya: "sudah berapa jauh?" (satu pandangan,
 * cukup grafik) dan "unit mana yang perlu ditagih?" (butuh nama). Digabung
 * jadi satu tabel, pertanyaan pertama menuntut menggulung layar - padahal itu
 * pertanyaan yang paling sering ditanyakan dan paling cepat dijawab.
 *
 * `bolehKembalikan` dipisah dari data: Kasubag TU melihat papan yang sama
 * untuk tahu posisi unitnya, tapi tanpa tombol pengembalian.
 */
export function PapanProgres({
  progres,
  periodeBulan,
  periodeTahun,
  bolehKembalikan,
  satkerSorot,
  batasTampil,
}: {
  progres: readonly ProgresUnit[];
  periodeBulan: number;
  periodeTahun: number;
  bolehKembalikan: boolean;
  /** Unit milik pembaca - diberi latar supaya gampang ditemukan di daftar panjang. */
  satkerSorot?: string;
  /**
   * Berapa baris yang langsung tampil. Sisanya disembunyikan di balik
   * "Lihat semua" - dengan ±20 satuan kerja, papan penuh mendorong seluruh
   * isi dashboard turun jauh ke bawah lipatan.
   */
  batasTampil?: number;
}) {
  const cacah = cacahProgres(progres);
  const irisan = irisanDonat(
    URUTAN_DONAT.map((k) => ({ kunci: k, nilai: cacah[k] })),
    KELILING
  );

  // URUTAN DIATUR ULANG SEBELUM DIPOTONG, dan ini yang menentukan gunanya.
  //
  // `rangkumProgres` mengurutkan menurut nama unit. Kalau tiga teratas
  // diambil apa adanya dari situ, yang tampil cuma unit berhuruf awal A-B -
  // dan baris yang justru butuh dilihat bisa jatuh ke balik "Lihat semua".
  //
  // PRIORITASNYA BEDA PER PERAN, dan ini bukan kerapian:
  //
  //   PPABP (bolehKembalikan) - baris TERKIRIM naik ke atas, karena cuma
  //   baris itulah yang punya tombol "Kembalikan ke unit". Pernah terjadi:
  //   papan dipotong 5 baris dengan urutan pemantauan di bawah, dan tombol
  //   satu-satunya untuk membuka kiriman terkunci hilang sama sekali dari
  //   layar.
  //
  //   KASUBAG TU (read-only) - urutan pemantauan: yang DIKEMBALIKAN dulu
  //   (butuh tindakan unit), lalu yang belum kirim, baru yang sudah beres.
  //
  // Unit pembaca sendiri selalu naik ke paling atas, apa pun perannya - dia
  // membuka halaman ini untuk melihat unitnya, bukan unit orang lain.
  const PRIORITAS: Record<ProgresUnit["keadaan"], number> = bolehKembalikan
    ? { TERKIRIM: 0, BELUM_KIRIM: 1, DIKEMBALIKAN: 2 }
    : { DIKEMBALIKAN: 0, BELUM_KIRIM: 1, TERKIRIM: 2 };
  const terurut = [...progres].sort((a, b) => {
    if (a.satuanKerja === satkerSorot) return -1;
    if (b.satuanKerja === satkerSorot) return 1;
    const beda = PRIORITAS[a.keadaan] - PRIORITAS[b.keadaan];
    return beda !== 0 ? beda : a.satuanKerja.localeCompare(b.satuanKerja, "id-ID");
  });

  const batas = batasTampil ?? 3;
  const utama = terurut.slice(0, batas);
  const sisa = terurut.slice(batas);

  return (
    // Grafik di KANAN dan lebarnya tetap; daftarnya yang memuai. Kebalikannya
    // - grafik ikut melebar - membuat lingkaran sebesar telapak tangan di
    // layar lebar tanpa menambah satu pun informasi.
    //
    // DAFTAR PANJANG MENGUSIR GRAFIKNYA. Begitu "Lihat semua" dibuka, kolom
    // kanan yang tingginya cuma sekitar 260px berdampingan dengan daftar 84
    // baris - sisanya ruang kosong sepanjang layar, dan ringkasan yang
    // gunanya "sekali lihat" malah jadi bagian paling sepi di halaman.
    // Grafiknya disembunyikan dan daftarnya melebar penuh; begitu ditutup,
    // keduanya kembali seperti semula.
    //
    // SELURUHNYA CSS - `:has(details[open])` membaca keadaan <details> di
    // dalam kartu kiri, jadi tidak ada state, tidak ada JavaScript, dan papan
    // ini tetap Server Component.
    <div className="group/papan mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:has-[details[open]]:grid-cols-1">
      <section className="card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold text-ink">Progres pengiriman unit</h2>
          <span className="text-xs text-muted">
            {progres.length} satuan kerja, periode {periodeBulan}/{periodeTahun}
          </span>
        </div>

        {progres.length === 0 ? (
          <p className="mt-2 text-xs text-muted">Belum ada satuan kerja yang terdaftar.</p>
        ) : (
          // SENGAJA TANPA `overflow-x-auto`. Pembungkus yang bisa digeser
          // menyembunyikan masalahnya, bukan menyelesaikannya: papan ini
          // dibaca sekilas untuk tahu unit mana yang belum kirim, dan kolom
          // yang harus dicari dengan menggeser ke samping tidak terbaca
          // sekilas. Lebarnya dijaga di colgroup + padding, dan nama unit
          // yang panjang membungkus ke bawah.
          <div className="mt-3">
            <table className="w-full table-fixed text-sm">
              <LebarKolom bolehKembalikan={bolehKembalikan} />
              <thead>
                <tr className="border-b border-line bg-surface-2 text-xs font-bold uppercase tracking-wide text-muted">
                  <th className="col-nama px-2 py-2">Satuan Kerja</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Dikirim</th>
                  {bolehKembalikan && <th className="px-2 py-2">Tindakan</th>}
                </tr>
              </thead>
              <tbody>
                {utama.map((u) => (
                  <BarisUnit
                    key={u.satuanKerja}
                    unit={u}
                    disorot={u.satuanKerja === satkerSorot}
                    periodeBulan={periodeBulan}
                    periodeTahun={periodeTahun}
                    bolehKembalikan={bolehKembalikan}
                  />
                ))}
              </tbody>
            </table>

            {/* <details>, BUKAN tombol ber-state: papan ini Server Component,
                dan membuka daftar sisanya tidak perlu JavaScript sama sekali.

                `flex-col-reverse` MENARUH SUMMARY DI BAWAH ISINYA. Tanpa itu
                summary berada di antara baris ke-3 dan ke-4 - dan begitu
                daftarnya dibuka, tombolnya terbaca menyelip di tengah deretan
                nama satuan kerja yang seharusnya menyambung. Sekarang
                tombolnya selalu di kaki daftar, apa pun keadaannya.

                Labelnya bertukar lewat `group-open:`, bukan state React -
                masih nol JavaScript. */}
            {sisa.length > 0 && (
              <details className="group mt-1 flex flex-col-reverse">
                <summary className="cursor-pointer border-t border-line-2 px-2 py-2 text-xs font-semibold text-biru hover:underline">
                  <span className="group-open:hidden">
                    Lihat semua {progres.length} unit
                    <span className="font-normal text-muted"> ({sisa.length} lainnya)</span>
                  </span>
                  <span className="hidden group-open:inline">Tampilkan {batas} teratas saja</span>
                </summary>
                <table className="w-full table-fixed text-sm">
                  <LebarKolom bolehKembalikan={bolehKembalikan} />
                  <tbody>
                    {sisa.map((u) => (
                      <BarisUnit
                        key={u.satuanKerja}
                        unit={u}
                        disorot={u.satuanKerja === satkerSorot}
                        periodeBulan={periodeBulan}
                        periodeTahun={periodeTahun}
                        bolehKembalikan={bolehKembalikan}
                      />
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </section>

      <DonatProgres irisan={irisan} total={progres.length} terkirim={cacah.TERKIRIM} />
    </div>
  );
}

/**
 * Grafik lingkaran keadaan pengiriman - SVG murni, nol JavaScript.
 *
 * Angka di tengahnya sengaja "x/y", bukan persen: yang menagih unit bekerja
 * dengan jumlah unit, bukan dengan proporsi. "17/84" bisa langsung dipakai di
 * kalimat berikutnya; "20%" harus dihitung balik dulu.
 */
function DonatProgres({
  irisan,
  total,
  terkirim,
}: {
  irisan: ReturnType<typeof irisanDonat>;
  total: number;
  terkirim: number;
}) {
  return (
    <section className="card flex flex-col items-center p-4 group-has-[details[open]]/papan:hidden">
      <h2 className="self-start text-sm font-bold text-ink">Ringkasan</h2>

      <div className="relative mt-3">
        <svg viewBox="0 0 100 100" className="h-36 w-36 -rotate-90" role="img" aria-hidden>
          {/* Cincin latar - yang tergambar kalau semua nilainya nol. Tanpa
              ini, periode kosong menampilkan ruang putih yang terbaca seperti
              gagal memuat. */}
          <circle cx="50" cy="50" r={JARI_JARI} fill="none" stroke="var(--color-line-2)" strokeWidth="14" />
          {irisan.map((i) =>
            i.panjangBusur > 0 ? (
              <circle
                key={i.kunci}
                cx="50"
                cy="50"
                r={JARI_JARI}
                fill="none"
                stroke={WARNA_DONAT[i.kunci as KeadaanPengiriman]}
                strokeWidth="14"
                strokeDashoffset={i.geser}
                // Tergambar SEARAH JARUM JAM, bukan tiga irisan mekar
                // berbarengan: tundaannya sebanding dengan titik mulai tiap
                // irisan, jadi yang di belakang baru bergerak setelah yang di
                // depannya sampai. Keadaan akhirnya ada di kelasnya, jadi
                // tanpa animasi (prefers-reduced-motion) cincinnya tetap utuh.
                className="gj-donat"
                style={
                  {
                    "--busur-donat": `${i.panjangBusur}`,
                    "--keliling-donat": `${KELILING}`,
                    animationDelay: `${120 + Math.round(i.mulaiPecahan * 620)}ms`,
                  } as React.CSSProperties
                }
              />
            ) : null
          )}
        </svg>

        {/* Teks di luar <svg> yang berputar -90deg - kalau ditaruh di dalam,
            angkanya ikut miring. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold leading-none text-ink">
            {terkirim}
            <span className="text-muted">/{total}</span>
          </span>
          <span className="mt-1 text-[11px] text-muted">unit terkirim</span>
        </div>
      </div>

      <ul className="mt-4 w-full space-y-1.5 text-xs">
        {irisan.map((i) => (
          <li key={i.kunci} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5 text-ink-2">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: WARNA_DONAT[i.kunci as KeadaanPengiriman] }}
              />
              <span className="truncate">{LABEL[i.kunci as KeadaanPengiriman]}</span>
            </span>
            <span className="shrink-0 font-mono font-semibold text-ink">
              {i.nilai} <span className="font-normal text-muted">({i.persen}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Satu baris unit. Dipisah karena dipakai DUA KALI - daftar utama dan daftar
 * di balik "Lihat semua". Menuliskannya dua kali berarti dua tempat yang
 * harus diubah bersamaan setiap kali kolomnya bergeser, dan yang terlupa akan
 * menampilkan data yang berbeda dari kembarannya.
 */
function BarisUnit({
  unit,
  disorot,
  periodeBulan,
  periodeTahun,
  bolehKembalikan,
}: {
  unit: ProgresUnit;
  disorot: boolean;
  periodeBulan: number;
  periodeTahun: number;
  bolehKembalikan: boolean;
}) {
  return (
    <tr className={`border-b border-line-2 align-top ${disorot ? "bg-surface-2" : ""}`}>
      <td className="col-nama px-2 py-2 font-medium leading-snug text-ink break-words">{unit.satuanKerja}</td>
      <td className="px-2 py-2">
        <span className={`chip ${WARNA[unit.keadaan]}`}>{LABEL[unit.keadaan]}</span>
        {unit.alasanKembali && (
          <span className="mt-1 block text-[11px] text-muted">{unit.alasanKembali}</span>
        )}
      </td>
      <td className="px-2 py-2 font-mono text-xs text-muted">
        {unit.dikirimPada ? tanggalTeks(unit.dikirimPada) : "-"}
      </td>
      {bolehKembalikan && (
        <td className="px-2 py-2">
          {/* Tombol HANYA untuk yang berstatus Terkirim. Yang belum kirim
              tidak ada yang bisa dikembalikan, yang sudah dikembalikan sudah
              terbuka.

              Keadaannya dikirim sebagai PROP, bukan dipakai di sini untuk
              memilih merender komponennya atau tidak: aksi kembalikan
              memanggil revalidatePath, jadi baris ini berubah jadi
              "Dikembalikan" begitu berhasil - dan komponen yang dilepas di
              situ membawa serta popup hasilnya. */}
          <KembalikanRekapForm
            satuanKerja={unit.satuanKerja}
            periodeBulan={periodeBulan}
            periodeTahun={periodeTahun}
            bisaDikembalikan={unit.keadaan === "TERKIRIM"}
          />
        </td>
      )}
    </tr>
  );
}

/**
 * Lebar kolom, dipakai OLEH KEDUA TABEL - yang tampil dan yang di balik
 * "Lihat semua".
 *
 * Wajib ada karena keduanya tabel terpisah: tanpa lebar yang ditetapkan,
 * masing-masing menghitung sendiri dari isinya, dan kolomnya melompat begitu
 * daftar sisanya dibuka. `<details>` tidak bisa membungkus `<tr>`, jadi dua
 * tabel memang tidak terhindarkan.
 */
function LebarKolom({ bolehKembalikan }: { bolehKembalikan: boolean }) {
  return (
    <colgroup>
      <col className={bolehKembalikan ? "w-[36%]" : "w-[48%]"} />
      <col className={bolehKembalikan ? "w-[20%]" : "w-[28%]"} />
      <col className={bolehKembalikan ? "w-[18%]" : "w-[24%]"} />
      {bolehKembalikan && <col className="w-[26%]" />}
    </colgroup>
  );
}
