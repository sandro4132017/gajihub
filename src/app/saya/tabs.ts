/**
 * Tab halaman "Data Saya".
 *
 * Urutannya MENGIKUTI ALUR PERTANYAAN PEGAWAI, bukan urutan tabel di database:
 * "siapa saya" -> "kehadiran saya bagaimana" -> "kinerja saya apa" -> dua itu
 * jadi berapa rupiah -> mana berkasnya -> kalau saya tidak setuju, ke mana.
 * Kehadiran & Kinerja sengaja ada TEPAT SEBELUM Pendapatan karena keduanya
 * persis yang membentuk angka Tukin (30% + 70%, Pasal 5).
 *
 * Tab dipilih lewat query string `?tab=`, BUKAN state React. Alasannya sama
 * dengan filter di seluruh aplikasi ini: halamannya tetap berfungsi tanpa
 * JavaScript, tiap tab punya URL sendiri yang bisa di-bookmark dan dikirim ke
 * orang lain ("buka tab Kehadiran" jadi bisa berupa tautan), dan tombol
 * back browser berperilaku seperti yang orang harapkan.
 */
export const TAB_SAYA = [
  { key: "profil", label: "Profil" },
  { key: "kehadiran", label: "Kehadiran" },
  { key: "kinerja", label: "Kinerja" },
  { key: "pendapatan", label: "Pendapatan" },
  { key: "dokumen", label: "Dokumen" },
  { key: "banding", label: "Banding" },
] as const;

export type TabSaya = (typeof TAB_SAYA)[number]["key"];

export const TAB_SAYA_DEFAULT: TabSaya = "profil";

/**
 * Nilai `?tab=` apa pun yang tidak dikenal jatuh ke tab pertama.
 *
 * WAJIB begini, bukan dilempar sebagai galat: query string datang dari URL,
 * jadi isinya bisa apa saja - tautan lama yang tab-nya sudah dihapus, salah
 * ketik, atau orang yang iseng. Halaman yang merender kosong karena `?tab=xyz`
 * terbaca sebagai "data saya hilang", dan itu kepanikan yang tidak perlu di
 * halaman yang isinya soal gaji.
 */
export function resolveTabSaya(nilai: string | undefined): TabSaya {
  const cocok = TAB_SAYA.find((t) => t.key === nilai);
  return cocok ? cocok.key : TAB_SAYA_DEFAULT;
}
