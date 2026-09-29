import { hitungTotalGajiInduk } from "../../business-logic/gajiInduk";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

/**
 * Komponen gaji induk satu periode - bentuknya SENGAJA persis subset kolom
 * `GajiInduk`, supaya baris Prisma bisa diteruskan apa adanya tanpa pemetaan
 * di tengah jalan. Pemetaan di tengah jalan itu yang biasanya menghasilkan
 * satu komponen hilang tanpa jejak.
 */
export interface KomponenGajiInduk {
  gajiPokok: number;
  tunjanganIstri: number;
  tunjanganAnak: number;
  tunjanganUmum: number;
  tunjanganStruktural: number;
  tunjanganFungsional: number;
  tunjanganBeras: number;
  tunjanganPph: number;
  pembulatan: number;
  tunjanganLain: number;
  potonganIuranPegawai: number;
  potonganPph: number;
  potonganBpjs: number;
  potonganLain: number;
  totalPenghasilan: number;
  totalPotongan: number;
  gajiBersih: number;
  honorarium: number;
}

/** Satu baris "label ...... Rp nilai". */
function Baris({
  label,
  nilai,
  catatan,
  tebal,
  garisAtas,
  redup,
}: {
  label: string;
  nilai: number;
  /** Keterangan kecil di bawah label - dasar hukum atau asal angkanya. */
  catatan?: string;
  tebal?: boolean;
  garisAtas?: boolean;
  /** Komponen bernilai nol - ditampilkan tapi diredupkan. */
  redup?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1.5 ${
        garisAtas ? "mt-1 border-t border-line pt-2" : ""
      }`}
    >
      <div className="min-w-0">
        <span className={`text-xs ${tebal ? "font-bold text-ink" : redup ? "text-muted" : "text-ink-2"}`}>
          {label}
        </span>
        {catatan && <span className="block text-[11px] leading-snug text-muted">{catatan}</span>}
      </div>
      <span
        className={`shrink-0 font-mono text-xs tabular-nums ${
          tebal ? "font-bold text-ink" : redup ? "text-muted" : "text-ink-2"
        }`}
      >
        {nilai === 0 ? "-" : rupiah(nilai)}
      </span>
    </div>
  );
}

/** Kepala satu kelompok, lengkap dengan sistem asal datanya. */
function Kelompok({
  judul,
  sumber,
  children,
}: {
  judul: string;
  sumber: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <p className="text-xs font-bold text-ink">{judul}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted">Sumber: {sumber}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Rincian pendapatan satu periode - "uang yang saya terima ini datang dari mana".
 *
 * KENAPA ADA, padahal slip gaji memuat angka yang sama. Slip itu DOKUMEN:
 * bentuknya mengikuti slip resmi Web Gaji, dicetak, ditandatangani PPABP.
 * Yang di sini PENJELASAN, dan disusun menurut SISTEM ASAL - karena
 * pertanyaan pegawai bukan "berapa totalnya" (itu sudah ada di stat tile di
 * atasnya) melainkan "tunjangan apa saja yang saya dapat, dan siapa yang
 * menentukan angkanya".
 *
 * PENGELOMPOKAN PER SUMBER ITU BUKAN SOAL GAYA - itu penentu ke mana pegawai
 * harus mengadu. Kalau angkanya salah, yang diperbaiki ada di sistem yang
 * BERBEDA: gaji pokok & tunjangan melekat diperbaiki di GPP/Web Gaji lewat
 * PPABP, Tukin lewat presensi & predikat kinerja, Uang Makan lewat presensi.
 * Tanpa keterangan sumber, banding mendarat di pintu yang salah dan
 * dikembalikan - dan yang menanggung waktunya pegawai.
 *
 * NOL ANGKA DIHITUNG ULANG DI SINI. Total penghasilan, total potongan, dan
 * gaji bersih diambil APA ADANYA dari baris yang tersimpan (gaji bersih
 * sendiri memang disalin apa adanya dari kolom `bersih` file GPP - lihat
 * komentar di model GajiInduk). Satu-satunya penjumlahan yang terjadi di sini
 * dipanggil dari `hitungTotalGajiInduk()`, fungsi yang SAMA dipakai importer
 * GPP, dan hasilnya cuma dipakai untuk MEMERIKSA - tidak pernah ditampilkan
 * sebagai pengganti. Kalau tampilan punya mesin hitung sendiri, cepat atau
 * lambat ia akan bercerita beda dari yang dibayar.
 */
export function RincianPendapatan({
  gaji,
  tukinBersih,
  uangMakan,
  uangLembur,
  total,
}: {
  /** null = gaji induk periode ini belum diunggah PPABP. */
  gaji: KomponenGajiInduk | null;
  tukinBersih: number;
  uangMakan: number;
  /** null = nominal lembur sedang disembunyikan (lihat tampilUangLembur.ts). */
  uangLembur: number | null;
  /** Total dari `hitungTotalPenghasilanSlip()` - dihitung di halaman, bukan di sini. */
  total: number;
}) {
  // Periksa ulang komponen lawan total yang tersimpan. Importer sudah
  // menghitung `selisihAritmatika` saat unggah, tapi angka itu tidak disimpan
  // ke database - jadi satu-satunya cara pegawai melihatnya adalah dihitung
  // ulang di sini, dengan fungsi yang sama.
  const periksa = gaji ? hitungTotalGajiInduk(gaji) : null;
  const selisihPenghasilan = periksa ? periksa.totalPenghasilan - gaji!.totalPenghasilan : 0;
  const selisihPotongan = periksa ? periksa.totalPotongan - gaji!.totalPotongan : 0;
  // (penghasilan - potongan) - bersih. Harusnya nol; kalau tidak, ada kolom
  // file GPP yang belum dipetakan importer.
  const selisihBersih = gaji ? gaji.totalPenghasilan - gaji.totalPotongan - gaji.gajiBersih : 0;

  // Toleransi Rp 1, bukan nol persis - nilai GPP disimpan sebagai Float dan
  // pembandingan persis akan menyalakan peringatan karena pembulatan biner
  // semata, bukan karena datanya bermasalah.
  const adaSelisih =
    Math.abs(selisihPenghasilan) > 1 || Math.abs(selisihPotongan) > 1 || Math.abs(selisihBersih) > 1;

  return (
    <section className="card p-4">
      <h2 className="text-[14.5px] font-extrabold tracking-tight text-ink">Rincian pendapatan</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Tiap komponen dikelompokkan menurut sistem yang menentukan angkanya - itu yang menentukan ke mana
        koreksinya diajukan kalau ada yang tidak sesuai.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {/* ================================================================
            KELOMPOK 1 - gaji & tunjangan melekat, dari file GPP.
            Urutan & label MENGIKUTI slip gaji, termasuk penggabungan
            "Tunjangan Umum/Jabatan", supaya pegawai yang menyandingkan
            halaman ini dengan slipnya tidak menemukan dua daftar berbeda.
            ================================================================ */}
        {gaji ? (
          <Kelompok
            judul="Gaji pokok & tunjangan melekat"
            sumber="file gaji induk GPP (Web Gaji Kemenkeu), diunggah PPABP"
          >
            <Baris label="Gaji pokok" nilai={gaji.gajiPokok} redup={gaji.gajiPokok === 0} />
            <Baris
              label="Tunjangan istri/suami"
              nilai={gaji.tunjanganIstri}
              redup={gaji.tunjanganIstri === 0}
            />
            <Baris label="Tunjangan anak" nilai={gaji.tunjanganAnak} redup={gaji.tunjanganAnak === 0} />
            <Baris
              label="Tunjangan umum/jabatan"
              nilai={gaji.tunjanganUmum + gaji.tunjanganStruktural}
              catatan="Di file GPP tersimpan dua kolom terpisah (umum PNS & struktural)"
              redup={gaji.tunjanganUmum + gaji.tunjanganStruktural === 0}
            />
            <Baris
              label="Tunjangan fungsional"
              nilai={gaji.tunjanganFungsional}
              redup={gaji.tunjanganFungsional === 0}
            />
            <Baris label="Tunjangan beras" nilai={gaji.tunjanganBeras} redup={gaji.tunjanganBeras === 0} />
            <Baris
              label="Tunjangan PPh"
              nilai={gaji.tunjanganPph}
              catatan="Tunjangan pajak yang ditanggung pemerintah - bukan potongan"
              redup={gaji.tunjanganPph === 0}
            />
            <Baris label="Pembulatan" nilai={gaji.pembulatan} redup={gaji.pembulatan === 0} />
            {/* Cuma muncul kalau satker ini memang mengisinya - sama seperti
                di slip, supaya tidak ada nilai file GPP yang hilang tanpa
                jejak, tanpa menambah baris kosong bagi yang tidak punya. */}
            {gaji.tunjanganLain > 0 && <Baris label="Tunjangan lain-lain" nilai={gaji.tunjanganLain} />}
            <Baris label="Jumlah penghasilan" nilai={gaji.totalPenghasilan} tebal garisAtas />

            <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-muted">Potongan</p>
            <Baris
              label="Iuran wajib pegawai"
              nilai={gaji.potonganIuranPegawai}
              catatan="8% dari gaji pokok + tunjangan istri + tunjangan anak"
              redup={gaji.potonganIuranPegawai === 0}
            />
            <Baris label="PPh Pasal 21" nilai={gaji.potonganPph} redup={gaji.potonganPph === 0} />
            <Baris label="BPJS" nilai={gaji.potonganBpjs} redup={gaji.potonganBpjs === 0} />
            {gaji.potonganLain > 0 && <Baris label="Potongan lain-lain" nilai={gaji.potonganLain} />}
            <Baris label="Jumlah potongan" nilai={gaji.totalPotongan} tebal garisAtas />

            <Baris
              label="Gaji bersih"
              nilai={gaji.gajiBersih}
              catatan="Diambil apa adanya dari kolom bersih file GPP"
              tebal
              garisAtas
            />
          </Kelompok>
        ) : (
          <Kelompok
            judul="Gaji pokok & tunjangan melekat"
            sumber="file gaji induk GPP (Web Gaji Kemenkeu), diunggah PPABP"
          >
            <p className="py-2 text-xs leading-relaxed text-muted">
              Belum ada data untuk periode ini karena file gaji induknya belum diunggah PPABP. Yang tampil di
              bawah baru komponen yang dihitung Gajihub sendiri.
            </p>
          </Kelompok>
        )}

        {/* ================================================================
            KELOMPOK 2 - yang dihitung Gajihub, beserta dasar hukumnya.
            ================================================================ */}
        <div className="space-y-3">
          <Kelompok
            judul="Dihitung Gajihub"
            sumber="presensi (e-Presensi), predikat kinerja (e-Kinerja BKN), data kepegawaian (SIAP)"
          >
            <Baris
              label="Tunjangan Kinerja"
              nilai={tukinBersih}
              catatan="70% predikat kinerja + 30% kehadiran, dikurangi potongan - Pasal 5 Permenaker 15/2024"
              redup={tukinBersih === 0}
            />
            <Baris
              label="Uang Makan"
              nilai={uangMakan}
              catatan="Tarif per golongan x hari yang berhak - SBM 2026 item 22.1"
              redup={uangMakan === 0}
            />
            {uangLembur !== null && (
              <Baris
                label="Uang Lembur"
                nilai={uangLembur}
                catatan="Jam lembur x tarif per golongan - SBM 2026 item 23"
                redup={uangLembur === 0}
              />
            )}
            {uangLembur === null && (
              <p className="py-1.5 text-[11px] leading-snug text-muted">
                Uang Lembur belum ditampilkan selama tata cara pembayarannya belum turun.
              </p>
            )}
          </Kelompok>

          {gaji && gaji.honorarium > 0 && (
            <Kelompok judul="Honorarium" sumber="diisi manual PPABP - tidak ada di file GPP">
              <Baris label="Honorarium" nilai={gaji.honorarium} />
            </Kelompok>
          )}

          <div className="rounded-xl border-l-2 border-l-navy bg-surface-2 p-3">
            <Baris label="Total diterima periode ini" nilai={total} tebal />
            <p className="text-[11px] leading-snug text-muted">
              Gaji bersih + Tunjangan Kinerja + Uang Makan
              {uangLembur !== null ? " + Uang Lembur" : ""}
              {gaji && gaji.honorarium > 0 ? " + honorarium" : ""}. Angka yang sama dipakai slip gaji.
            </p>
          </div>
        </div>
      </div>

      {/* Selisih aritmatika - DITAMPILKAN, tidak disembunyikan. Artinya ada
          kolom file GPP yang belum dipetakan importer, dan pegawailah yang
          paling dirugikan kalau itu diam-diam dibiarkan. */}
      {adaSelisih && (
        <div className="mt-3 border-l-2 border-l-gold bg-surface-2 p-3">
          <p className="text-xs font-bold text-ink">Komponen tidak berjumlah pas dengan totalnya</p>
          <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
            Jumlah komponen di atas tidak sama dengan total yang tersimpan - kemungkinan ada kolom di file GPP
            yang belum dipetakan sistem ini. Angka yang tampil tetap angka yang tersimpan, bukan hasil hitungan
            ulang. Laporkan ke PPABP supaya file unggahannya dicek.
          </p>
          <dl className="mt-1.5 space-y-0.5 text-[11px] text-muted">
            {Math.abs(selisihPenghasilan) > 1 && (
              <div>Selisih di penghasilan: {rupiah(selisihPenghasilan)}</div>
            )}
            {Math.abs(selisihPotongan) > 1 && <div>Selisih di potongan: {rupiah(selisihPotongan)}</div>}
            {Math.abs(selisihBersih) > 1 && (
              <div>Penghasilan &minus; potongan tidak sama dengan gaji bersih: {rupiah(selisihBersih)}</div>
            )}
          </dl>
        </div>
      )}
    </section>
  );
}
