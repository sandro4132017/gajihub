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
      <form method="get" className="flex flex-wrap items-center gap-2 [&_input]:mt-0">
        <SearchableSelect
          name="bulan"
          className="w-36"
          options={bulanOpsi}
          defaultValue={bulan ?? ""}
          emptyLabel="Semua bulan"
        />

        <SearchableSelect
          name="tahun"
          className="w-28"
          options={tahunOpsi.map((t) => ({ value: String(t), label: String(t) }))}
          defaultValue={tahun ?? ""}
          emptyLabel="Semua tahun"
        />

        {satkerTerkunci ? (
          <input type="hidden" name="satker" value={satker ?? ""} />
        ) : (
          <SearchableSelect
            name="satker"
            className="min-w-[220px]"
            options={satuanKerjaList.map((s) => ({ value: s, label: s }))}
            defaultValue={satker ?? ""}
            emptyLabel="Semua satuan kerja"
          />
        )}

        <button type="submit" className="btn btn-primary">
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
