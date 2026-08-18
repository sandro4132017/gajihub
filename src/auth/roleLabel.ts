import type { Role } from "@prisma/client";

/**
 * Label dasar per role - lihat CLAUDE.md bagian "Role matrix" untuk cakupan
 * akses tiap role.
 *
 * Dipakai apa adanya di tempat yang memang belum punya konteks unit, mis.
 * daftar pilihan role di dropdown ("Kasubag TU" sebagai JENIS role, bukan
 * jabatan seseorang). Untuk menyebut role MILIK SESEORANG, pakai
 * `labelRole()` di bawah.
 */
export const LABEL_ROLE: Record<Role, string> = {
  PEGAWAI: "Pegawai",
  KASUBAG_TU: "Kasubag TU",
  OSDMA: "OSDMA",
  PPABP: "PPABP",
  PIMPINAN: "Pimpinan",
  ADMIN: "Admin",
};

/**
 * Label role SESEORANG, lengkap dengan unitnya untuk Kasubag TU.
 *
 * KENAPA PERLU: setiap unit/biro punya Kasubag TU-nya sendiri, jadi
 * "Kasubag TU" saja tidak menunjuk siapa pun secara pasti. Di layar yang
 * memuat beberapa akun sekaligus (Kelola Assignment Role, daftar usulan
 * perubahan role) label yang sama muncul berkali-kali untuk orang berbeda
 * dengan kewenangan berbeda - dan justru unitnyalah yang menentukan siapa
 * boleh menyentuh data siapa.
 *
 * Paling terasa di pesan penolakan approval: "Role Kasubag TU tidak berwenang
 * approve untuk satuan kerja X" tidak menjelaskan apa-apa, sementara "Role
 * Kasubag TU Pusdatik tidak berwenang approve ... satuan kerja Biro Keuangan"
 * langsung menyebutkan sebabnya.
 *
 * Role selain KASUBAG_TU TIDAK diberi unit walau kolomnya kebetulan terisi.
 * `User.satuanKerja` memang milik KASUBAG_TU (lihat komentar model User di
 * schema.prisma); menempelkannya ke PPABP/OSDMA akan menyiratkan pembatasan
 * wilayah yang tidak berlaku - dan itu pernah jadi bug sungguhan (lihat "Bug
 * akun multi-role kehilangan jangkauan PPABP" di CLAUDE.md).
 *
 * Unit yang KOSONG disebut eksplisit, bukan disembunyikan: akun KASUBAG_TU
 * tanpa unit lolos guard role tapi tidak cocok dengan satuan kerja manapun,
 * jadi semua halamannya tampil kosong tanpa penjelasan. Menampilkan "(unit
 * belum diisi)" membuat penyebabnya terbaca di layar mana pun label ini
 * muncul.
 */
export function labelRole(role: Role, satuanKerja?: string | null): string {
  if (role !== "KASUBAG_TU") return LABEL_ROLE[role];
  const unit = satuanKerja?.trim();
  return unit ? `Kasubag TU ${unit}` : "Kasubag TU (unit belum diisi)";
}

/**
 * SENGAJA TIDAK ADA fungsi penyingkat nama unit.
 *
 * Nama satuan kerja memang panjang ("Biro Keuangan dan Barang Milik Negara"),
 * dan menyingkatnya dengan mengambil beberapa kata pertama TERLIHAT rapi tapi
 * menghasilkan label yang salah: "Direktorat Bina Kelembagaan Pelatihan
 * Vokasi" dan "Direktorat Bina Kelembagaan Keselamatan dan Kesehatan Kerja"
 * dua-duanya jadi "Direktorat Bina" - dua unit berbeda dengan label identik,
 * di layar yang gunanya justru membedakan unit.
 *
 * Tabel singkatan manual juga bukan jawaban: daftarnya ikut berubah tiap
 * reorganisasi, dan unit yang belum terdaftar akan tampil beda sendiri.
 *
 * Jadi yang dipakai: nama penuh, dipotong CSS (`truncate`) di tempat sempit,
 * dengan `title` berisi teks lengkapnya.
 */
