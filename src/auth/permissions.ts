// ============================================================================
// AUTHORIZATION LAYER - pure function per kombinasi role x aksi.
// Lihat CLAUDE.md bagian "Simulasi role matrix lengkap" untuk definisi
// lengkap 6 role dan cakupan aksesnya - file ini implementasi dari tabel
// itu (role & aksi detail: dashboard unit/lintas unit, SK KGB, SK Hukuman
// Disiplin, Anggaran Realisasi, Bukti Potong Pajak, usulan perubahan role).
//
// PENTING: file ini BELUM disambungkan ke dashboard/endpoint manapun untuk
// fitur-fitur BARU di atas (itu langkah 4, UI bertahap per role - belum
// dikerjakan). Guard yang SUDAH tersambung ke UI cuma yang dari fitur user
// & role versi awal (approval Tukin/Uang Makan/Uang Lembur, dashboard
// approver, self-service /saya, Banding jenjang 1/pengajuan). Semua fungsi
// di sini pure - tidak ada I/O, cuma logika keputusan izin/tolak
// berdasarkan data yang dikasih si pemanggil.
//
// KONVENSI: setiap fungsi return boolean murni (true = boleh). Nama fungsi
// pakai prefix "can". Kalau kombinasi role x aksi TIDAK disebut eksplisit
// di role matrix, defaultnya DITOLAK (bukan diizinkan).
//
// TODO(confirm) BESAR - ADMIN "privilege semua role": role matrix simulasi
// ini eksplisit minta ADMIN bisa melakukan APAPUN yang bisa dilakukan role
// lain (lihat enum Role di schema.prisma untuk alasan & catatan "BUKAN
// desain final production"). Supaya gampang di-grep & dicabut kalau role
// ini dipecah lagi nanti, bypass ADMIN SELALU eksplisit lewat helper
// `cekRoleAtauAdmin`/`cekScopeSatkerAtauAdmin`/`cekPpabpAtauAdmin` di bawah
// - JANGAN taruh `user.role === "ADMIN"` tersebar ad-hoc di fungsi lain.
// ============================================================================

import type { Role } from "@prisma/client";

/** Subset field User yang dibutuhkan buat cek izin - bukan full Prisma User. */
export interface AuthUser {
  nip: string;
  role: Role;
  satuanKerja: string | null;
  aktif: boolean;

  /**
   * Satuan kerja LAIN yang boleh dilihat user ini, dari tabel
   * AksesSatkerTambahan (hibah akses lintas unit, keputusan user 2026-09-02).
   *
   * OPSIONAL DENGAN SENGAJA. Ratusan pemanggil `AuthUser` yang sudah ada
   * tidak mengisinya, dan `undefined` berarti "tidak ada hibah" - persis
   * perilaku sebelum fitur ini ada. Jadi lupa mengisinya menyebabkan akses
   * KURANG, tidak pernah akses LEBIH.
   *
   * HANYA BERPENGARUH PADA FUNGSI BACA - lihat `canLihatSatker`. Wewenang
   * menghitung, mengirim, mengembalikan, dan meng-export tetap ditentukan
   * `role` + `satuanKerja` saja, dan sengaja TIDAK membaca daftar ini.
   */
  satuanKerjaTambahan?: readonly string[];
}

export interface TargetPegawai {
  nip: string;
  satuanKerja: string;
}

export interface TargetBanding {
  pengajuNip: string;
  satuanKerjaPegawai: string;
}

function cekRole(user: AuthUser, role: Role): boolean {
  return user.aktif && user.role === role;
}

/** ADMIN "privilege semua role" - lihat TODO(confirm) besar di atas. */
function cekRoleAtauAdmin(user: AuthUser, role: Role): boolean {
  return user.aktif && (user.role === role || user.role === "ADMIN");
}

/**
 * Apakah user boleh MELIHAT data satuan kerja ini.
 *
 * Ini satu-satunya tempat hibah `AksesSatkerTambahan` dibaca. Dipisah dari
 * `cekScopeSatkerAtauAdmin` dengan sengaja: yang itu menjawab "boleh
 * bertindak atas unit ini", yang ini menjawab "boleh melihat unit ini".
 * Menyatukannya akan membuat hibah baca diam-diam ikut memberi wewenang
 * menghitung dan mengirim.
 */
export function canLihatSatker(user: AuthUser, targetSatuanKerja: string): boolean {
  if (!user.aktif) return false;
  // Role yang cakupannya memang lintas unit tidak perlu hibah.
  if (user.role === "ADMIN" || user.role === "PPABP" || user.role === "PIMPINAN") return true;
  if (user.satuanKerja === targetSatuanKerja) return true;
  return (user.satuanKerjaTambahan ?? []).includes(targetSatuanKerja);
}

/**
 * Seluruh satuan kerja yang terlihat oleh user, untuk mengisi dropdown filter.
 *
 * `null` berarti LINTAS SEMUA - pemanggilnya tidak boleh memfilter apa pun.
 * Sengaja `null`, bukan array kosong: array kosong dan "semua" adalah dua
 * keadaan yang berlawanan, dan menyamakannya pernah menghasilkan halaman
 * kosong untuk PPABP.
 */
export function satkerTerlihatOleh(user: AuthUser): string[] | null {
  if (!user.aktif) return [];
  if (user.role === "ADMIN" || user.role === "PPABP" || user.role === "PIMPINAN") return null;
  const daftar = new Set<string>();
  if (user.satuanKerja) daftar.add(user.satuanKerja);
  for (const s of user.satuanKerjaTambahan ?? []) daftar.add(s);
  return [...daftar];
}

/**
 * Memberi & mencabut hibah akses lintas unit - ADMIN SAJA.
 *
 * TIDAK diberikan ke PPABP meski jangkauannya lintas unit: memperluas akses
 * orang lain ke data gaji adalah wewenang yang berbeda jenis dari mengolah
 * data gaji itu sendiri, dan yang memegangnya sebaiknya bukan yang sama.
 */
export function canKelolaAksesSatkerTambahan(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

/** Sama seperti cekRoleAtauAdmin, tapi untuk aksi yang di-scope ke satuan kerja tertentu. */
function cekScopeSatkerAtauAdmin(user: AuthUser, role: Role, targetSatuanKerja: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return user.role === role && user.satuanKerja === targetSatuanKerja;
}

/**
 * PPABP berwenang LINTAS SEMUA satuan kerja (pilot: tim PPABP pusat).
 *
 * `targetSatuanKerja` sengaja tetap ada di signature-nya walau tidak dipakai:
 * pemanggilnya sudah terlanjur banyak, dan begitu keputusan "PPABP per satker"
 * diambil (lihat TODO(confirm) di bawah) tinggal fungsi INI yang diubah.
 *
 * DULU fungsi ini men-scope PPABP ke `User.satuanKerja` kalau kolom itu
 * terisi, dengan niat "tidak perlu migrasi kalau nanti di-scale per satker".
 * Itu DICABUT karena bentrok dengan fitur multi-role: satu akun cuma punya
 * SATU `satuanKerja`, dan kolom itu WAJIB diisi kalau akunnya punya role
 * KASUBAG_TU (lihat ubahAssignmentRoleAction). Akibatnya akun yang memegang
 * KASUBAG_TU + PPABP sekaligus - persis akun ADMIN demo - diam-diam
 * kehilangan jangkauan lintas unit begitu dia ganti ke role PPABP, PADAHAL
 * halaman-halamannya tetap MENAMPILKAN semua unit (dashboardScope dan
 * /pegawai cuma memaksa scope buat KASUBAG_TU). Jadi datanya kelihatan tapi
 * aksinya ditolak - gagal diam-diam, bentuk kegagalan yang paling
 * membingungkan.
 *
 * TODO(confirm): kalau "PPABP per satker" benar-benar diputuskan (masih
 * terbuka, lihat CLAUDE.md), scoping-nya TIDAK BOLEH numpang `satuanKerja`
 * lagi - kolom itu punya KASUBAG_TU. Butuh kolom sendiri (mis.
 * `satuanKerjaPpabp`) atau tabel penugasan terpisah, plus migrasi.
 */
function cekPpabp(user: AuthUser, _targetSatuanKerja?: string): boolean {
  return cekRole(user, "PPABP");
}

function cekPpabpAtauAdmin(user: AuthUser, targetSatuanKerja?: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return cekPpabp(user, targetSatuanKerja);
}

// ---------------------------------------------------------------------------
// PEGAWAI - self-service, data sendiri saja. SEMUA role (KASUBAG_TU, OSDMA,
// PPABP, PIMPINAN, ADMIN) OTOMATIS punya privilege ini juga untuk data
// MEREKA SENDIRI (role matrix: "PEGAWAI - semua role di bawah otomatis
// punya privilege ini juga") - makanya fungsi-fungsi di bawah SENGAJA
// TIDAK mengecek role tertentu, cuma mengecek kecocokan NIP + akun aktif.
// ---------------------------------------------------------------------------

/**
 * Lihat presensi/predikat kinerja/pendapatan (periode berjalan & sebelumnya)/
 * histori pembayaran SENDIRI - berlaku semua role. Role matrix: "TIDAK
 * BOLEH lihat data pegawai lain" (itu diatur canViewPegawai, bukan di sini).
 */
export function canViewDataSendiri(user: AuthUser, targetNip: string): boolean {
  return user.aktif && user.nip === targetNip;
}

/**
 * Ajukan banding atas data sendiri. Schema Banding mencatat: "pengaju
 * HARUS pegawai yang sama dengan targetnya - banding diri sendiri, bukan
 * diwakilkan" (lihat komentar model Banding).
 */
export function canAjukanBanding(user: AuthUser, targetPegawaiNip: string): boolean {
  return user.aktif && user.nip === targetPegawaiNip;
}

/** Upload bukti dukung HANYA buat banding yang diajukan sendiri. */
export function canUploadBuktiDukung(user: AuthUser, banding: TargetBanding): boolean {
  return user.aktif && user.nip === banding.pengajuNip;
}

/** Lihat status banding sendiri (diajukan -> verifikasi Kasubag TU -> approval final OSDMA). */
export function canLihatStatusBandingSendiri(user: AuthUser, banding: TargetBanding): boolean {
  return user.aktif && user.nip === banding.pengajuNip;
}

/** Cetak/download slip gaji sendiri - format PLACEHOLDER, lihat TODO(confirm) di CLAUDE.md. */
export function canCetakSlipGajiSendiri(user: AuthUser, targetNip: string): boolean {
  return user.aktif && user.nip === targetNip;
}

/**
 * Download (BUKAN upload - lihat canUploadBuktiPotongPajak di bawah) bukti
 * potong pajak sendiri. Role matrix PEGAWAI: "pegawai cuma bisa lihat/
 * download, bukan upload sendiri".
 */
export function canDownloadBuktiPotongPajakSendiri(user: AuthUser, targetNip: string): boolean {
  return user.aktif && user.nip === targetNip;
}

// ---------------------------------------------------------------------------
// KASUBAG_TU - verifikator tingkat satker, scoping lewat User.satuanKerja
// ---------------------------------------------------------------------------

/** Lihat rekap SELURUH pegawai di satuan kerjanya sendiri saja. */
export function canViewRekapUnitKerja(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Unduh rekap presensi / Tunjangan Kinerja unit sebagai berkas Excel.
 *
 * KOMPOSISI dari izin yang sudah ada, BUKAN aturan baru: siapa pun yang boleh
 * MELIHAT rekap unit di layar boleh mengunduh isi yang sama. Berkasnya tidak
 * memuat satu pun kolom yang tidak sudah tampil di halamannya, jadi kalau ini
 * dibuat sebagai aturan tersendiri, cepat atau lambat ia akan bergeser dari
 * `canViewRekapUnitKerja` dan menghasilkan berkas berisi lebih banyak daripada
 * yang boleh dilihat orangnya.
 *
 * PPABP ikut karena jangkauannya memang lintas unit (pola sama dengan
 * `canAjukanKalkulasiTukinMassalUnit`).
 *
 * INI BUKAN `canGenerateAdk`. ADK adalah berkas PEMBAYARAN yang disetor ke Web
 * Gaji dan tetap terbatas untuk PPABP/ADMIN; yang ini rekap untuk dibaca dan
 * diarsipkan. Menyatukan keduanya berarti memberi Kasubag TU kemampuan
 * menerbitkan berkas pembayaran.
 */
export function canExportRekapUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  if (canViewRekapUnitKerja(user, targetSatuanKerja)) return true;
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Verifikasi (jenjang 1) banding yang masuk dari pegawai di unitnya sendiri. */
export function canVerifikasiBandingJenjang1(user: AuthUser, banding: TargetBanding): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return user.role === "KASUBAG_TU" && user.satuanKerja === banding.satuanKerjaPegawai;
}

/**
 * Mengirim rekap unit ke PPABP - HANYA unit kerjanya sendiri.
 *
 * MENGGANTIKAN `canApproveJenjang1`. Approval per-kalkulasi dihapus atas
 * keputusan user 2026-09-02: yang sesungguhnya dinilai Kasubag TU bukan
 * ratusan baris satu per satu, melainkan satu pernyataan - "rekap unit saya
 * periode ini sudah saya periksa dan sudah benar".
 *
 * SENGAJA TIDAK membaca `satuanKerjaTambahan`. Hibah akses lintas unit
 * hanya memberi hak BACA; orang dari unit lain tidak boleh mengirimkan
 * rekap atas nama unit yang bukan tanggung jawabnya.
 */
export function canKirimRekapUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}


/** Monitor status rekonsiliasi (ReconciliationStatus) unitnya sendiri. */
export function canMonitorRekonsiliasiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Tarik data presensi dari database, ATAU upload manual sebagai fallback
 * kalau adapter API e-Presensi belum konek (role matrix: "atau upload
 * manual kalau adapter API belum konek") - satu izin yang sama buat kedua
 * cara, bedanya cuma di service layer/UI nanti.
 */
export function canTarikAtauUploadPresensiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Tombol "tarik ulang data" presensi - dipisah dari canTarikAtauUploadPresensiUnit
 * biar eksplisit sesuai daftar fitur, TAPI izinnya sama (satu unit yang
 * sama). Role matrix: koreksi sebenarnya terjadi di e-Presensi (eksternal),
 * tombol ini CUMA nge-refresh, BUKAN auto-sync - lihat CLAUDE.md.
 */
export function canTarikUlangPresensiUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Upload predikat kinerja (bobot 70% Tukin) + koreksi langsung di Gajihub kalau ada yang salah. */
export function canUploadKoreksiPredikatKinerjaUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Upload file "Rekap Penilaian" dari e-Kinerja BKN buat SATU satuan kerja.
 *
 * Sengaja KOMPOSISI dari dua izin yang sudah ada, bukan aturan baru:
 * - KASUBAG_TU: cuma unitnya sendiri (canUploadKoreksiPredikatKinerjaUnit)
 * - PPABP/ADMIN: lintas unit, sejalan dengan perannya sebagai fallback
 *   kalau unit tidak bisa (bandingkan canTarikAtauUploadPresensiFallback
 *   yang polanya sama untuk presensi)
 *
 * Dicek PER SATUAN KERJA, bukan sekali per file: satu file rekap bisa saja
 * memuat pegawai lintas unit, dan Kasubag TU tidak boleh ikut menulis
 * predikat pegawai unit lain cuma karena namanya kebetulan ada di file yang
 * dia upload. Satuan kerja yang dipakai WAJIB dari `Pegawai.satuanKerja`
 * hasil lookup NIP - JANGAN dari baris unit di kepala file (isinya nama
 * sub-unit penilaian, lihat catatan di rekapPredikatKinerja.ts).
 */
export function canUploadRekapPredikatKinerja(user: AuthUser, targetSatuanKerja: string): boolean {
  return (
    canUploadKoreksiPredikatKinerjaUnit(user, targetSatuanKerja) ||
    cekPpabpAtauAdmin(user, targetSatuanKerja)
  );
}

/**
 * Upload rekap PRESENSI (komponen 30% Tukin) untuk SATU satuan kerja.
 * Pola & alasannya identik dengan canUploadRekapPredikatKinerja di atas:
 * KASUBAG_TU unitnya sendiri (canTarikAtauUploadPresensiUnit), PPABP/ADMIN
 * lintas unit (perannya sebagai fallback - lihat
 * canTarikAtauUploadPresensiFallback). Dicek PER BARIS, bukan per file.
 */
export function canUploadRekapPresensi(user: AuthUser, targetSatuanKerja: string): boolean {
  return (
    canTarikAtauUploadPresensiUnit(user, targetSatuanKerja) ||
    cekPpabpAtauAdmin(user, targetSatuanKerja)
  );
}

/**
 * Menandai sebuah TANGGAL sebagai kendala e-Presensi (Pasal 10 ayat (2)
 * Permenaker 15/2024), yang membatalkan potongan Pasal 13 ayat (2) untuk
 * semua pegawai terdampak di tanggal itu.
 *
 * SENGAJA PPABP + ADMIN saja, TIDAK termasuk KASUBAG_TU - beda dari
 * canUploadRekapPresensi di atas yang memang di-scope unit.
 *
 * Alasannya bukan soal jenjang, tapi soal cakupan akibatnya: satu penanda
 * bisa berlaku SE-KEMENTERIAN dan menghapus potongan ribuan orang sekaligus
 * (kejadian 15-16 Juli 2026: 960 pegawai, Rp 18.178.588). Kewenangan
 * membatalkan potongan lintas unit tidak berada di unit manapun - itu ada di
 * pihak yang memang berwenang lintas satker, dan pasalnya sendiri
 * menempatkan pengesahan presensi manual pada "pimpinan Unit Kerja", bukan
 * pada pelaksana administrasinya.
 *
 * TODO(confirm): kalau nanti Kasubag TU perlu menandai kendala yang cuma
 * menimpa unitnya sendiri (mis. jaringan satu balai putus), fungsi ini yang
 * dilonggarkan - dengan syarat penandanya WAJIB ber-satuanKerja, tidak boleh
 * se-kementerian.
 */
export function canKelolaKendalaEpresensi(user: AuthUser): boolean {
  return cekPpabpAtauAdmin(user);
}

/**
 * Kelola kalender hari libur nasional & cuti bersama.
 *
 * SENGAJA cakupan yang SAMA dengan canKelolaKendalaEpresensi (PPABP + ADMIN),
 * dan alasannya sama: satu tanggal libur berlaku SE-KEMENTERIAN dan mengubah
 * tiga hal sekaligus untuk semua orang - pengali lembur 2x, batas hari uang
 * makan, dan pembebasan potongan Pasal 13. Itu bukan keputusan tingkat unit.
 *
 * Bedanya dengan penanda kendala: tanggal merah datang dari SKB 3 Menteri,
 * jadi ini pekerjaan MENYALIN keputusan yang sudah ada - bukan menilai. Yang
 * dijaga bukan penilaiannya, melainkan supaya tidak ada unit yang diam-diam
 * memakai kalender berbeda dari unit lain.
 */
export function canKelolaHariLibur(user: AuthUser): boolean {
  return cekPpabpAtauAdmin(user);
}

/**
 * Buka HALAMAN upload rekap predikat kinerja / presensi. Cek "boleh menulis
 * data pegawai unit MANA" dilakukan terpisah per baris lewat
 * canUploadRekapPredikatKinerja / canUploadRekapPresensi - pola yang sama
 * dengan canKelolaDataPegawai vs canEditDataPegawai.
 */
export function canBukaHalamanPredikatKinerja(user: AuthUser): boolean {
  if (!user.aktif) return false;
  return user.role === "ADMIN" || user.role === "PPABP" || user.role === "KASUBAG_TU";
}

/**
 * Tombol "ajukan semua pegawai unit" - kalkulasi Tukin 30/70 massal + preview
 * nominal sebelum diajukan.
 *
 * DUA ROLE, dua cakupan berbeda:
 *   - KASUBAG_TU : unitnya sendiri saja.
 *   - PPABP      : TIDAK BOLEH.
 *
 * PPABP DICABUT 2026-09-06, membatalkan penambahannya pada 2026-08-06.
 *
 * SEBABNYA BUKAN PERUBAHAN KEBIJAKAN, MELAINKAN KOREKSI FAKTA. Penambahan
 * 2026-08-06 berangkat dari anggapan bahwa alurnya PPABP -> Kasubag TU.
 * Yang sebenarnya berlaku kebalikannya: **Kasubag TU menyusun dan mengirim,
 * PPABP menerima dan memeriksa**. Jadi izin itu bukan menutup celah, melainkan
 * menaruh langkah pertama di tangan pihak yang justru langkah terakhir.
 *
 * Karena itu jangan diperlakukan sebagai preferensi yang bisa ditawar ulang:
 * mengembalikan izin ini berarti PPABP memeriksa pekerjaannya sendiri, dan
 * tidak ada lagi pihak kedua di seluruh alur. Sejalan dengan Pasal 20 ayat
 * (5)-(6) yang memisahkan unit penyusun dari unit keuangan sebagai pembayar.
 *
 * YANG DIKORBANKAN, dan ini memang harga yang dipilih: alasan penambahan
 * 2026-08-06 tetap berlaku - PPABP boleh mengunggah KEDUA komponen pembentuk
 * Tukin (presensi 30% lewat canTarikAtauUploadPresensiFallback, predikat 70%
 * lewat canUploadRekapPredikatKinerja) tapi sekarang tidak bisa menjalankan
 * kalkulasi yang memakainya. Jadi kalau sebuah unit tidak menjalankannya
 * sendiri, datanya berhenti di situ dan hanya ADMIN yang bisa melanjutkan.
 * Itu keadaan yang HARUS terlihat, bukan ditambal diam-diam dengan
 * mengembalikan izin ini - yang kurang adalah unitnya bekerja, dan papan
 * progres pengiriman memang dibuat untuk memperlihatkannya.
 */
export function canAjukanKalkulasiTukinMassalUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Boleh melihat baris kalkulasi yang UNITNYA BELUM mengirim rekap periode itu.
 *
 * KASUBAG_TU jelas boleh - dia justru harus memeriksanya sebelum mengirim,
 * dan sebelum dikirim itulah satu-satunya saat angkanya masih bisa diperbaiki.
 *
 * PPABP TIDAK. Yang menjadi bahan kerjanya adalah rekap yang sudah dikirim
 * dan terkunci; angka yang belum dikirim masih boleh berubah kapan saja oleh
 * unitnya, jadi memperlihatkannya cuma mengundang pemeriksaan atas sesuatu
 * yang belum final - dan lebih buruk lagi, mengundang tindak lanjut atasnya.
 * Yang belum mengirim tetap terlihat di papan progres pengiriman, sebagai
 * unit yang ditunggu, bukan sebagai angka yang siap diperiksa.
 */
export function canLihatKalkulasiSebelumDikirim(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Telaah dan ajukan Uang Makan pegawai unitnya. */
export function canTelaahAjukanUangMakanUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Telaah, periksa kebenaran, koreksi, dan ajukan Uang Lembur pegawai unitnya. */
export function canTelaahKoreksiAjukanUangLemburUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Dashboard unit sendiri: total pegawai, total nominal, status siklus, jumlah tertolak/belum diajukan. */
export function canViewDashboardUnit(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/** Ajukan SK KGB pegawai unitnya (approval final OSDMA - lihat canApproveSkKgb). */
export function canAjukanSkKgb(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

/**
 * Input SK Hukuman Disiplin pegawai unitnya (approval OSDMA - lihat
 * canApproveSkHukumanDisiplin). TODO(confirm) BESAR: alur approval OSDMA
 * untuk SK ini ASUMSI dari spesifikasi simulasi, BELUM konfirmasi resmi -
 * lihat komentar panjang di model SkHukumanDisiplin (schema.prisma).
 */
export function canInputSkHukumanDisiplin(user: AuthUser, targetSatuanKerja: string): boolean {
  return cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja);
}

// ---------------------------------------------------------------------------
// OSDMA - data steward, approval final Banding & SK KGB/Hukuman Disiplin,
// update SK pegawai
// ---------------------------------------------------------------------------

/** Review & approve perubahan data master pegawai (SK, mutasi, kenaikan pangkat) yang disengketakan. */
export function canReviewPerubahanDataMaster(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Update SK pegawai yang baru dilantik struktural/fungsional, atau naik pangkat. */
export function canUpdateSkPegawaiStrukturalFungsional(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Approval final (jenjang 2) Banding - lihat alur 2 jenjang di model Banding. */
export function canApproveBandingFinal(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Approval SK KGB (jenjang tunggal). */
export function canApproveSkKgb(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/**
 * Approval SK Hukuman Disiplin (jenjang tunggal) - lihat TODO(confirm)
 * besar di canInputSkHukumanDisiplin/model SkHukumanDisiplin soal alur ini.
 */
export function canApproveSkHukumanDisiplin(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

/** Monitor kepatuhan penggunaan data & lihat log akses (pola pemakaian, BUKAN data personal satu-satu). */
export function canMonitorKepatuhanData(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "OSDMA");
}

// ---------------------------------------------------------------------------
// PPABP (Tim PPABP Rokeu) - validasi lintas unit, export ADK, anggaran
// realisasi, usulan role, dashboard lintas unit
// ---------------------------------------------------------------------------

/** Tarik/upload manual data presensi - fallback kalau Kasubag TU/unit tidak bisa (lintas unit). */
export function canTarikAtauUploadPresensiFallback(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/** Telaah dan validasi pengajuan Tukin/Uang Makan/Uang Lembur dari SEMUA unit kerja. */
export function canTelaahValidasiPengajuanLintasUnit(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/**
 * Mengembalikan rekap yang sudah dikirim ke unit asalnya, supaya bisa
 * diperbaiki dan dikirim ulang.
 *
 * MENGGANTIKAN `canApproveJenjangFinal`. Setelah approval berjenjang dihapus,
 * PPABP tidak lagi "menyetujui" apa pun - kiriman unit langsung terkunci dan
 * siap di-export. Yang tersisa di tangan PPABP justru kebalikannya: satu-
 * satunya jalan membuka kunci kalau ada yang salah.
 *
 * INI BUKAN KELONGGARAN, INI SYARAT. Tanpa tombol ini, satu salah kirim
 * mengunci periode itu sampai ada yang menyunting database langsung -
 * tepat hal yang keberadaan sistem ini dimaksudkan untuk menghentikan.
 * Alasannya wajib diisi (lihat PengirimanUnit.alasanKembali): unit tidak
 * punya cara lain mengetahui apa yang harus diperbaiki.
 */
export function canKembalikanRekapUnit(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/**
 * Melihat papan progres pengiriman seluruh unit (siapa sudah kirim, siapa
 * belum). PPABP & PIMPINAN lintas unit; Kasubag TU melihatnya juga supaya
 * tahu posisi unitnya sendiri terhadap yang lain.
 *
 * Read-only murni - tidak ada aksi yang bergantung pada fungsi ini.
 */
export function canLihatProgresPengiriman(user: AuthUser): boolean {
  return (
    user.aktif &&
    (user.role === "PPABP" ||
      user.role === "PIMPINAN" ||
      user.role === "KASUBAG_TU" ||
      user.role === "ADMIN")
  );
}

/**
 * Mencatat, mengubah, dan menghapus SK Grade (dasar kolom "Nomor SK" &
 * "Kode Grade" di ADK).
 *
 * DUA ROLE dengan cakupan berbeda - pola yang sama persis dengan
 * `canAjukanKalkulasiTukinMassalUnit`:
 *   - KASUBAG_TU : unitnya sendiri saja.
 *   - PPABP      : lintas satuan kerja.
 *
 * PPABP ikut karena dialah yang menekan tombol export dan dialah yang pertama
 * melihat kolom SK-nya kosong. Menyuruhnya menunggu unit mengisi, padahal
 * berkas SK-nya ada di mejanya sendiri, cuma menunda export tanpa menambah
 * satu pun pemeriksaan.
 */
export function canKelolaSkGrade(user: AuthUser, targetSatuanKerja: string): boolean {
  if (cekScopeSatkerAtauAdmin(user, "KASUBAG_TU", targetSatuanKerja)) return true;
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Handle kasus SELISIH (hasil rekonsiliasi data sumber tidak cocok). */
export function canHandleSelisih(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Export ADK (Tunjangan Kinerja, Uang Makan, Uang Lembur - 3 jenis terpisah) untuk diunggah ke Web Gaji. */
export function canGenerateAdk(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/** Upload data Anggaran dan Realisasi Belanja Pegawai. */
export function canUploadAnggaranRealisasi(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/**
 * Upload riwayat GAJI INDUK (file ADK dari GPP/Web Gaji) dan mengedit
 * honorarium per pegawai - bahan slip gaji pegawai.
 *
 * PPABP saja (+ ADMIN lewat bypass), BUKAN Kasubag TU: yang memegang file
 * ADK gaji dari Kemenkeu dan yang menandatangani slip "Perincian Pembayaran
 * Gaji" memang PPABP (lihat blok tanda tangan di slip contoh Setjen). Ini
 * BEDA dari BuktiPotongPajak yang di role matrix boleh diunggah Kasubag TU
 * ATAU PPABP.
 *
 * TODO(confirm): kalau nanti PPABP di-scale jadi per satker (lihat "PPABP per
 * satker" di CLAUDE.md), fungsi ini perlu ikut menerima targetSatuanKerja
 * supaya PPABP satker A tidak bisa menimpa data gaji satker B.
 */
export function canKelolaGajiInduk(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/** Monitoring status belanja pegawai lintas unit, DAN ubah status pengajuan/approval/validasi. */
export function canMonitorUbahStatusLintasUnit(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/** Lihat status rekonsiliasi LINTAS satker (dalam kewenangannya). */
export function canViewRekonsiliasiLintasSatker(user: AuthUser, targetSatuanKerja?: string): boolean {
  return cekPpabpAtauAdmin(user, targetSatuanKerja);
}

/**
 * MELIHAT dan MENGUSULKAN perubahan role user - eksekusi final ada di
 * ADMIN (lihat canEksekusiPerubahanRole), supaya tidak ada dua pihak yang
 * sama-sama bisa eksekusi langsung.
 */
export function canUsulkanPerubahanRole(user: AuthUser): boolean {
  return cekRoleAtauAdmin(user, "PPABP");
}

/**
 * Dashboard lintas unit: total pegawai, total nominal belanja pegawai
 * periode berjalan (filter periode), status siklus pembayaran, jumlah
 * tertolak/belum diajukan, total Anggaran vs Realisasi. PPABP & ADMIN bisa
 * approve/ubah data dari dashboard ini (lihat fungsi lain di atas);
 * PIMPINAN dapat dashboard yang SAMA tapi read-only (role matrix) - itu
 * dibedakan di level UI (PIMPINAN tidak dikasih tombol aksi), BUKAN di
 * fungsi ini, karena fungsi ini cuma soal "boleh LIHAT dashboardnya".
 */
export function canViewDashboardLintasUnit(user: AuthUser): boolean {
  return user.aktif && (user.role === "PPABP" || user.role === "PIMPINAN" || user.role === "ADMIN");
}

// ---------------------------------------------------------------------------
// PIMPINAN - dashboard lintas unit SAMA seperti PPABP, read-only. Lihat
// canViewDashboardLintasUnit di atas (izin lihat dashboard-nya sama-sama
// dipakai PPABP/PIMPINAN/ADMIN) - TIDAK ADA fungsi canApprove/canUbah...
// yang mengizinkan PIMPINAN secara SENGAJA (role matrix: "read-only, tanpa
// kemampuan approval/ubah data").
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ADMIN - kewenangan teknis (config, monitoring, eksekusi role) + privilege
// SEMUA role lain (lihat TODO(confirm) besar di kepala file & enum Role).
// ---------------------------------------------------------------------------

export function canKelolaAssignmentRole(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

/**
 * Eksekusi FINAL perubahan role (dari usulan PPABP - lihat
 * canUsulkanPerubahanRole) - SENGAJA cuma ADMIN, TANPA bypass PPABP,
 * supaya cuma satu pihak yang bisa eksekusi langsung (role matrix poin 4 & 6).
 */
export function canEksekusiPerubahanRole(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

export function canMonitorKesehatanSistem(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

export function canKonfigurasiAdapter(user: AuthUser): boolean {
  return cekRole(user, "ADMIN");
}

/**
 * TODO(confirm): guard ADMIN_SISTEM lama (blokir data payroll) SENGAJA
 * dinonaktifkan buat role ADMIN yang baru, karena role matrix simulasi ini
 * eksplisit minta ADMIN "privilege SEMUA role". Ini BUKAN keputusan final -
 * lihat TODO(confirm) besar di enum Role (schema.prisma) soal kewajiban
 * memecah role ini lagi sebelum production.
 */
export function canViewDataPayroll(user: AuthUser): boolean {
  return user.aktif;
}

/**
 * Guard gabungan buat 3 dashboard approver (Tukin/Uang Makan/Uang Lembur):
 * PEGAWAI diarahkan ke dashboard self-service sendiri (/saya) - dashboard
 * approver nampilin SEMUA pegawai per satker, yang melanggar "TIDAK BOLEH
 * lihat pegawai lain" di role matrix kalau PEGAWAI dibiarkan masuk.
 */
export function canViewApproverDashboard(user: AuthUser): boolean {
  return canViewDataPayroll(user) && user.role !== "PEGAWAI";
}

// ---------------------------------------------------------------------------
// LINTAS ROLE
// ---------------------------------------------------------------------------

/**
 * Lihat data (identitas + payroll) satu pegawai tertentu. Gabungan aturan
 * dari semua role - lihat komentar per baris.
 */
export function canViewPegawai(user: AuthUser, target: TargetPegawai): boolean {
  if (!user.aktif) return false;

  switch (user.role) {
    case "PEGAWAI":
      return user.nip === target.nip; // data sendiri saja
    case "KASUBAG_TU":
      return user.satuanKerja === target.satuanKerja; // unit kerjanya saja
    case "PPABP":
      return cekPpabp(user, target.satuanKerja); // lintas satker (pilot: pusat)
    case "OSDMA":
      return true; // data steward, perlu visibilitas luas buat review data master
    case "PIMPINAN":
      return true; // dashboard ringkasan tingkat kementerian
    case "ADMIN":
      return true; // TODO(confirm): privilege penuh - lihat catatan di canViewDataPayroll
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// DATA POKOK PEGAWAI (halaman /pegawai) - ADMIN, PPABP, KASUBAG_TU
//
// Diminta eksplisit oleh user: ketiga role ini butuh bisa memperbaiki data
// pokok pegawai (termasuk MENGISI/MENGUBAH satuan kerja), karena satuan kerja
// adalah kunci scoping di hampir semua fitur - pegawai dengan satuan kerja
// salah/kosong otomatis "hilang" dari dashboard unit manapun.
//
// BEDA dengan canUpdateSkPegawaiStrukturalFungsional (OSDMA, /osdma/update-sk):
// yang itu KHUSUS perubahan karena SK (jabatan/golongan/kelas jabatan/TMT) dan
// lintas satker tanpa batas. Yang ini perbaikan data pokok termasuk satuan
// kerja, dengan KASUBAG_TU di-scope ke unitnya sendiri. Keduanya sama-sama
// menulis AuditTrail, jadi jejaknya tetap ada dari jalur manapun.
//
// TIDAK termasuk presensi/predikat kinerja - itu tetap dilarang lewat semua
// jalur, lihat canEditPresensiKinerjaLangsung di bawah.
// ---------------------------------------------------------------------------

/**
 * Buka halaman daftar/pencarian data pegawai buat diedit. Cek "boleh edit
 * pegawai yang MANA" dilakukan terpisah per baris lewat canEditDataPegawai.
 */
export function canKelolaDataPegawai(user: AuthUser): boolean {
  if (!user.aktif) return false;
  return user.role === "ADMIN" || user.role === "PPABP" || user.role === "KASUBAG_TU";
}

/**
 * Edit data pokok SATU pegawai. KASUBAG_TU cuma unitnya sendiri (konsisten
 * dengan canViewRekapUnitKerja dkk), PPABP lintas satker (pilot: tim pusat),
 * ADMIN bypass.
 */
export function canEditDataPegawai(user: AuthUser, targetSatuanKerja: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "PPABP") return cekPpabp(user, targetSatuanKerja);
  return user.role === "KASUBAG_TU" && user.satuanKerja === targetSatuanKerja;
}

/**
 * Memindahkan pegawai ke satuan kerja LAIN (mutasi). Sengaja dipisah dari
 * canEditDataPegawai: buat KASUBAG_TU ini operasi satu arah yang tidak bisa
 * dibatalkan sendiri - begitu pegawainya dipindah keluar unit, dia langsung
 * di luar jangkauan Kasubag TU itu (tidak bisa dikembalikan tanpa bantuan
 * PPABP/Admin). Makanya mutasi keluar unit SENGAJA cuma PPABP & ADMIN.
 */
export function canPindahSatuanKerjaPegawai(user: AuthUser, satuanKerjaAsal: string): boolean {
  if (!user.aktif) return false;
  if (user.role === "ADMIN") return true;
  return user.role === "PPABP" && cekPpabp(user, satuanKerjaAsal);
}

/**
 * TIDAK ADA role yang boleh edit data presensi/kinerja secara LANGSUNG -
 * jalur koreksi yang SAH cuma: (1) Banding (ajukan -> diverifikasi
 * berjenjang), atau (2) KASUBAG_TU pakai
 * canTarikAtauUploadPresensiUnit/canUploadKoreksiPredikatKinerjaUnit (masih
 * di-scope unitnya, bukan "edit bebas"). Fungsi ini SENGAJA selalu false
 * dan TIDAK ikut kena bypass ADMIN - didokumentasikan eksplisit di sini
 * supaya tidak ada yang "lupa" nambahin fitur edit langsung tanpa jejak.
 */
export function canEditPresensiKinerjaLangsung(_user: AuthUser): boolean {
  return false;
}
