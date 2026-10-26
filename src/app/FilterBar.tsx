import { NAMA_BULAN, daftarTahunPeriode } from "./bulan";
import { SearchableSelect } from "./SearchableSelect";

/**
 * Form filter periode + satuan kerja - dipakai sama persis di ketiga
 * dashboard (Tukin, Uang Makan, Uang Lembur). Tetap <form method="get">
 * biasa supaya filter jalan lewat URL query string - konsisten dengan
 * pendekatan Server Component di halaman-halaman dashboard.
 *
 * Dropdown-nya pakai SearchableSelect (bisa dicari realtime; daftar satuan
 * kerja ada 82 baris, scroll manual tidak praktis). Komponen itu sendiri
 * yang client-side, plus fallback <select> native di dalam <noscript> -
 * jadi janji "filter jalan tanpa JavaScript" tetap dipegang.
 */
export function FilterBar({
  satuanKerjaList,
  bulan,
  tahun,
  satker,
  ringkas = false,
  pil = false,
  satkerTerkunci = false,
  tanpaKartu = false,
  wajibPeriode = false,
  wajibSatker = false,
}: {
  satuanKerjaList: string[];
  bulan?: string;
  tahun?: string;
  satker?: string;
  /**
   * Satu baris rapat tanpa kartu & tanpa label - buat halaman yang filternya
   * bukan pekerjaan utamanya, mis. dashboard unit yang isinya sudah padat.
   * Bentuk panjangnya tetap dipakai di halaman yang memang berpusat pada
   * pencarian, karena di sana label "Bulan"/"Tahun"/"Satuan kerja" membantu.
   */
  ringkas?: boolean;
  /**
   * Bentuk dashboard: kendali sebaris di layar >= xl, dropdown satuan kerja
   * menyerap sisa lebar, tombol Terapkan membulat. TANPA wadah pembungkus
   * (keputusan user 2026-10-22). Hanya berlaku bersama `ringkas`.
   *
   * SearchableSelect TIDAK diubah bentuknya - komponen itu dipakai seluruh
   * form di aplikasi, termasuk yang tidak ada hubungannya dengan dashboard.
   */
  pil?: boolean;
  /**
   * Satuan kerja ditentukan sistem, bukan dipilih pemakainya (lihat
   * satkerTerkunciUntukAkun). Dropdown-nya diganti input tersembunyi supaya
   * nilainya TETAP ikut terkirim waktu form disubmit - kalau cuma dihilangkan,
   * ?satker= hilang dari URL dan halaman yang mensyaratkannya balik ke
   * keadaan "belum memilih unit".
   */
  satkerTerkunci?: boolean;
  /**
   * Lepas pembungkus `card` supaya filternya bisa disatukan ke dalam kartu
   * milik pemanggil. Isinya TIDAK berubah - label & tombolnya tetap seperti
   * bentuk panjang; yang dilepas cuma latar, border, dan jaraknya.
   *
   * Dipakai di Kalkulasi Unit, tempat filter dan ringkasan kesiapan jadi satu
   * kartu: keduanya menjawab pertanyaan yang sama ("periode ini, unit ini,
   * datanya bagaimana"), dan dua kartu bertumpuk membuatnya terbaca seperti
   * dua urusan terpisah.
   */
  tanpaKartu?: boolean;
  /**
   * Buang pilihan "Semua bulan" & "Semua tahun".
   *
   * Untuk halaman yang SELALU jatuh ke satu periode lewat `resolvePeriode`.
   * Di situ opsi "Semua bulan" bukan pilihan yang lebih longgar melainkan
   * pilihan yang BOHONG: orang memilihnya, menekan Terapkan, lalu melihat satu
   * bulan tertentu tanpa penjelasan apa pun.
   */
  wajibPeriode?: boolean;
  /**
   * Buang pilihan "Semua satuan kerja".
   *
   * DIPISAH dari `wajibPeriode` karena keduanya tidak selalu sejalan: Dashboard
   * Tukin selalu berperiode tunggal TAPI memang boleh menampilkan seluruh
   * satuan kerja - itu justru gunanya ringkasan per unit di halaman itu.
   *
   * Placeholder "Pilih satuan kerja" tetap ada SELAMA belum ada yang dipilih -
   * tanpa itu layar "belum memilih unit" kehilangan satu-satunya cara keluar
   * dari keadaannya. Begitu unitnya terpilih, placeholder-nya hilang dan
   * pilihan kosong tidak bisa dikembalikan.
   */
  wajibSatker?: boolean;
}) {
  const adaFilterAktif = Boolean(bulan || tahun || satker);

  // Tahun yang sedang dipakai TAPI di luar daftar (mis. link lama ?tahun=2025)
  // tetap dimunculkan sebagai opsi. Kalau tidak, field-nya tampil kosong
  // padahal filternya aktif - orang akan mengira filternya tidak jalan.
  const tahunOpsi = daftarTahunPeriode();
  if (tahun && /^\d{4}$/.test(tahun) && !tahunOpsi.includes(Number(tahun))) {
    tahunOpsi.push(Number(tahun));
    tahunOpsi.sort((a, b) => a - b);
  }

  const bulanOpsi = NAMA_BULAN.map((nama, index) => ({ value: String(index + 1), label: nama }));

  if (ringkas) {
    return (
      // [&_input]:mt-0 mencabut `mt-1` yang menempel di .field-input. Margin itu
      // ada untuk memberi jarak dari label di atasnya; di sini labelnya memang
      // tidak ada, dan sisa 4px-nya membuat field jadi turun sendiri terhadap
      // tombol Terapkan di sebelahnya.
      // Varian pil SEBARIS di layar >= xl (permintaan user 2026-10-22: filter
      // & tombol aksi "jadi 1 jajar, jangan 2 baris"). `flex-1 min-w-0`
      // membuat wadahnya mengisi sisa baris, dan dropdown satuan kerja yang
      // menyerap lebarnya - bukan dropdown bulan/tahun yang isinya pendek.
      //
      // Di bawah xl isinya SECARA FISIK tidak muat sebaris (~870px kontrol
      // lawan ~700px ruang), jadi tetap boleh turun baris.
      //
      // TANPA WADAH (permintaan user 2026-10-22: "hilangkan card-nya,
      // langsung filter aja"). Kendali berdiri langsung di latar halaman;
      // tiap kotak isian sudah punya garis sendiri.
      <form
        method="get"
        className={`flex flex-wrap items-center gap-2 [&_input]:mt-0 ${
          // Tinggi TETAP h-10 (40px) - sama dengan tombol aksi di sebelahnya
          // (DashboardLintasUnit). Dari padding saja, isian jadi 38px dan
          // tombol 36-42px: deret sebaris yang tingginya tidak rata.
          pil ? "min-w-0 flex-1 xl:flex-nowrap [&_.field-input]:h-10" : ""
        }`}
      >
        <SearchableSelect
          name="bulan"
          className="w-36 shrink-0"
          options={bulanOpsi}
          defaultValue={bulan ?? ""}
          emptyLabel="Semua bulan"
        />

        <SearchableSelect
          name="tahun"
          // w-32, bukan w-28: "Semua tahun" + panah dropdown terpotong jadi
          // "Semua tahu" di lebar 112px.
          className="w-32 shrink-0"
          options={tahunOpsi.map((t) => ({ value: String(t), label: String(t) }))}
          defaultValue={tahun ?? ""}
          emptyLabel="Semua tahun"
        />

        {satkerTerkunci ? (
          <input type="hidden" name="satker" value={satker ?? ""} />
        ) : (
          <SearchableSelect
            name="satker"
            className={pil ? "min-w-[180px] flex-1" : "min-w-[220px]"}
            options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
            defaultValue={satker ?? ""}
            emptyLabel="Semua satuan kerja"
          />
        )}

        <button type="submit" className={`btn btn-primary ${pil ? "h-10 shrink-0 whitespace-nowrap rounded-full px-4 py-0" : ""}`}>
          Terapkan
        </button>
      </form>
    );
  }

  return (
    <form
      method="get"
      className={
        tanpaKartu
          ? "flex flex-wrap items-end gap-3"
          : "card mt-4 flex flex-wrap items-end gap-3 p-4"
      }
    >
      <div>
        <label className="field-label">Bulan</label>
        <SearchableSelect
          name="bulan"
          className="w-40"
          options={bulanOpsi}
          defaultValue={bulan ?? ""}
          emptyLabel={wajibPeriode ? undefined : "Semua bulan"}
        />
      </div>

      <div>
        <label className="field-label">Tahun</label>
        <SearchableSelect
          name="tahun"
          className="w-32"
          options={tahunOpsi.map((t) => ({ value: String(t), label: String(t) }))}
          defaultValue={tahun ?? ""}
          emptyLabel={wajibPeriode ? undefined : "Semua tahun"}
        />
      </div>

      {satkerTerkunci ? (
        <input type="hidden" name="satker" value={satker ?? ""} />
      ) : (
        <div>
          <label className="field-label">Satuan kerja</label>
          <SearchableSelect
            name="satker"
            className="min-w-[260px]"
            options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
            defaultValue={satker ?? ""}
            emptyLabel={wajibSatker ? (satker ? undefined : "Pilih satuan kerja") : "Semua satuan kerja"}
          />
        </div>
      )}

      <button type="submit" className="btn btn-primary">
        Terapkan filter
      </button>

      {adaFilterAktif && !wajibSatker && (
        <a href="?" className="text-sm font-medium text-muted underline">
          Reset filter
        </a>
      )}
    </form>
  );
}
