import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { SESSION_COOKIE_NAME } from "../../../../auth/session";
import { OPSI_COOKIE_SESI, buatTokenUntukUser } from "../../../../auth/sesiCookie";
import { LANDING_ROLE } from "../../../../auth/roleAktif";
import { LABEL_ROLE } from "../../../../auth/roleLabel";
import {
  ambilInfoPengguna,
  asalPublik,
  cariNikDariInfo,
  cariNipDariInfo,
  konfigurasiSso,
  ringkasFieldInfo,
  tukarKodeKeToken,
} from "../../../../auth/sso";
import { kunciSidikNik, sidikNik } from "../../../../auth/sidikNik";
import { COOKIE_STATE_SSO } from "../route";

export const dynamic = "force-dynamic";

/**
 * Langkah 3-6 SSO - menerima authorization code dari Naco, menukarnya jadi
 * token, mengambil identitas, lalu menerbitkan sesi Gajihub.
 *
 * YANG TIDAK DILAKUKAN DI SINI, dan itu disengaja:
 *
 * - **TIDAK membuat akun baru.** Kalau NIP dari Naco tidak punya baris `User`
 *   di Gajihub, login DITOLAK. Membuat akun otomatis berarti siapa pun yang
 *   punya akun Kemnaker langsung masuk ke sistem penggajian - pemberian peran
 *   harus tetap tindakan sadar Admin.
 * - **TIDAK menyimpan access/refresh token.** Gajihub tidak memanggil API
 *   Naco lain setelah ini; token cuma dipakai sekali untuk membuktikan
 *   identitas, lalu dibuang. Menyimpannya menambah rahasia yang harus dijaga
 *   tanpa ada yang memakainya.
 * - **TIDAK mengubah lapisan otorisasi.** Setelah identitas terbukti, alurnya
 *   sama persis dengan login NIP: `User` dibaca dari database, sesi
 *   diterbitkan lewat `buatTokenUntukUser`, peran & scope satuan kerja
 *   ditentukan `src/auth/permissions.ts` seperti sebelumnya.
 */

function keLogin(req: NextRequest, alasan: string, detail?: string) {
  const url = new URL("/login", asalPublik(req.headers, req.url));
  url.searchParams.set("sso", alasan);
  if (detail) url.searchParams.set("pesan", detail.slice(0, 300));
  const res = NextResponse.redirect(url);
  res.cookies.delete(COOKIE_STATE_SSO);
  return res;
}

export async function GET(req: NextRequest) {
  const cfg = konfigurasiSso();
  if (!cfg) return keLogin(req, "belum-dikonfigurasi");

  const kode = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const galatNaco = req.nextUrl.searchParams.get("error");

  // Naco menolak / pengguna membatalkan.
  if (galatNaco) {
    return keLogin(req, "ditolak", req.nextUrl.searchParams.get("error_description") ?? galatNaco);
  }
  if (!kode) return keLogin(req, "gagal", "Naco tidak mengirimkan authorization code.");

  // Verifikasi state SEBELUM kode dipakai - ini yang menahan CSRF login.
  const stateCookie = req.cookies.get(COOKIE_STATE_SSO)?.value;
  if (!stateCookie || !state || stateCookie !== state) {
    return keLogin(req, "gagal", "Penanda keamanan (state) tidak cocok. Ulangi dari halaman login, jangan dari tautan lama.");
  }

  try {
    const token = await tukarKodeKeToken(cfg, kode);
    const info = await ambilInfoPengguna(cfg, token.accessToken);

    // JALUR 1 - NIP langsung. Selalu dicoba duluan: kalau Naco suatu saat
    // mengirimkan NIP, itu padanan langsung dan tidak perlu perantara apa pun.
    let nip = cariNipDariInfo(info, cfg.fieldNip);
    let lewatSidikNik = false;

    // JALUR 2 - padanan NIK. Ini yang benar-benar dipakai sekarang: diukur dua
    // kali pada 2026-08-31 (akun publik DAN akun pegawai), balasan /users/me
    // berisi `data.username` = NIK 16 digit dan TIDAK PERNAH memuat NIP.
    //
    // Yang dicocokkan SIDIK-nya (HMAC), bukan NIK-nya - database Gajihub tidak
    // pernah menyimpan NIK. Lihat src/auth/sidikNik.ts.
    if (!nip) {
      const nik = cariNikDariInfo(info, cfg.fieldNik);
      if (nik) {
        try {
          const sidik = sidikNik(nik, kunciSidikNik());
          if (sidik) {
            // `sidik_nik` UNIK di database, jadi findUnique tidak akan pernah
            // mengembalikan dua orang - dan NIK ganda memang sengaja tidak
            // pernah diberi sidik oleh importer.
            const pegawai = await prisma.pegawai.findUnique({ where: { sidikNik: sidik } });
            if (pegawai) {
              nip = pegawai.nip;
              lewatSidikNik = true;
            }
          }
        } catch (e) {
          // SIDIK_NIK_SECRET belum diisi. Bukan alasan merobohkan halaman -
          // login NIP tetap jalan - tapi harus terbaca, karena kalau tidak,
          // gejalanya cuma "semua pegawai ditolak" tanpa sebab.
          console.error(`[sso] jalur NIK tidak aktif: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    // NIP tidak ketemu. JANGAN menebak - salah orang berarti salah data gaji.
    //
    // Sebab yang jauh lebih sering di produksi BUKAN salah konfigurasi:
    // Akun Kemnaker (SIAP ID) terbuka untuk masyarakat umum, dan akun publik
    // memang tidak memuat NIP sama sekali. Terbukti dari balasan nyata sebuah
    // akun publik - field-nya cuma id, username, name, roles[], status, email
    // (lihat CLAUDE.md, bagian SSO Kemnaker).
    //
    // DAFTAR NAMA FIELD TIDAK DITAMPILKAN KE PENGUNJUNG. Halaman login
    // terbuka dari internet, dan itu diagnosis pengembang, bukan keterangan
    // yang berguna bagi orang yang salah akun. Ditulis ke log server supaya
    // tetap terbaca saat menyetel NACO_FIELD_NIP (`pm2 logs gajihub`), dan
    // hanya ikut ke layar kalau NACO_DEBUG="true" dinyalakan sengaja.
    if (!nip) {
      const ringkas = ringkasFieldInfo(info).slice(0, 40);
      const daftar = ringkas.map((f) => f.jalur).join(", ");

      // Bentuk tiap field, TANPA nilainya - plus SATU baris vonis, supaya yang
      // membaca log tidak perlu memindai tabel untuk menyimpulkan sendiri.
      // Tiga sebab ini punya tindak lanjut yang BERBEDA, dan itu sebabnya
      // dibedakan:
      const berdigit18 = ringkas.filter((f) => f.jumlahDigit === 18);
      const angka18 = berdigit18.filter((f) => f.tipe === "number");
      const adaNik = cariNikDariInfo(info, cfg.fieldNik) !== null;
      const jumlahBersidik = await prisma.pegawai.count({ where: { sidikNik: { not: null } } });

      const vonis =
        angka18.length > 0
          ? `NIP DIKIRIM SEBAGAI ANGKA di ${angka18.map((f) => f.jalur).join(", ")} - ` +
            `nilainya SUDAH RUSAK sebelum sampai ke sini (18 digit melebihi presisi ` +
            `bilangan JSON, tiga digit terakhir jadi nol) dan SENGAJA ditolak. ` +
            `Minta Naco mengirim field itu sebagai STRING.`
          : berdigit18.length > 0
            ? `Ada field berisi 18 digit (${berdigit18.map((f) => f.jalur).join(", ")}) tapi ` +
              `berformat lain. Periksa pemisahnya - normalkanNip() cuma membersihkan ` +
              `spasi, titik, dan strip.`
            : !adaNik
              ? `Balasan tidak memuat NIP (18 digit) MAUPUN NIK (16 digit). Tidak ada ` +
                `yang bisa dipakai mengenali pegawai - periksa NACO_FIELD_NIK ` +
                `(sekarang "${cfg.fieldNik}") terhadap daftar field di bawah.`
              : jumlahBersidik === 0
                ? `NIK ditemukan, TAPI belum ada satu pun pegawai yang punya sidik NIK ` +
                  `di database. Isi SIDIK_NIK_SECRET di .env lalu jalankan ` +
                  `\`npm run sync:pegawai\` - tanpa itu tidak ada yang bisa dicocokkan.`
                : `NIK ditemukan dan ${jumlahBersidik} pegawai sudah bersidik, tapi TIDAK ADA ` +
                  `yang cocok. Tiga sebab yang mungkin: (a) orangnya memang bukan pegawai ` +
                  `Kemnaker, (b) NIK-nya di SIAP kosong/ganda sehingga sengaja tidak ` +
                  `diberi sidik, atau (c) SIDIK_NIK_SECRET berubah sejak sync terakhir - ` +
                  `kalau (c), SELURUH sidik jadi basi dan sync harus diulang.`;

      console.warn(
        `[sso] /users/me tanpa NIP yang bisa dipakai. VONIS: ${vonis}\n    Bentuk field:` +
          ringkas.map((f) => `\n      ${f.jalur}: ${f.tipe}, panjang ${f.panjang}, digit ${f.jumlahDigit}`).join("")
      );
      const rinci =
        process.env.NACO_DEBUG?.trim() === "true"
          ? `Field yang dikirim: ${daftar || "(kosong)"}`
          : undefined;
      return keLogin(req, "bukan-pegawai", rinci);
    }

    const user = await prisma.user.findUnique({ where: { nip } });
    if (!user) {
      return keLogin(req, "tidak-terdaftar", `NIP ${nip} belum punya akun di Gajihub. Minta Admin membuatkannya.`);
    }
    if (!user.aktif) {
      return keLogin(req, "nonaktif", `Akun NIP ${nip} berstatus nonaktif.`);
    }

    const pegawai = await prisma.pegawai.findUnique({ where: { nip } });
    const sesi = await buatTokenUntukUser(user, pegawai?.jabatan ?? LABEL_ROLE[user.role]);

    // Jalan mana yang dipakai mengenali orang ini DICATAT. Selama NIP tidak
    // pernah dikirim Naco, praktis semua login SSO lewat padanan NIK - dan
    // kalau suatu saat Naco mulai mengirim NIP, pergeserannya kelihatan di sini
    // tanpa perlu menebak. NIK-nya sendiri tidak ikut dicatat.
    console.info(
      `[sso] login berhasil NIP ${nip} lewat ${lewatSidikNik ? "padanan sidik NIK" : "NIP langsung dari Naco"}`
    );

    // Sama seperti login NIP: selalu mulai dari role UTAMA akun, bukan role
    // tambahan yang terakhir dipakai.
    const res = NextResponse.redirect(new URL(LANDING_ROLE[user.role], asalPublik(req.headers, req.url)));
    res.cookies.set(SESSION_COOKIE_NAME, sesi, OPSI_COOKIE_SESI);
    res.cookies.delete(COOKIE_STATE_SSO);
    return res;
  } catch (e) {
    // Pesan galat Naco ikut ditampilkan - waktu memasang SSO, sebabnya
    // hampir selalu redirect_uri yang tidak sama persis dengan yang
    // didaftarkan, dan pesan generik menyembunyikan itu.
    return keLogin(req, "gagal", e instanceof Error ? e.message : "Kesalahan tidak dikenal.");
  }
}
