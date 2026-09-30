import { NextRequest } from "next/server";
import { prisma } from "../../../lib/prisma";
import { ambilAbsenHariIni } from "../../../adapters/absenHariIni";
import {
  pesanCheckin,
  pesanCheckout,
  susunDaftarPengingat,
} from "../../../business-logic/pengingatAbsen";
import { NAMA_BULAN } from "../../bulan";
import { NAMA_HARI } from "../../presensiTampilan";

export const dynamic = "force-dynamic";

/**
 * Bahan pengingat presensi satu unit, untuk dibaca bot WhatsApp di luar Gajihub.
 *
 * SATU-SATUNYA route di aplikasi ini yang diautentikasi MESIN, bukan sesi
 * pengguna - jadi baca dulu empat hal di bawah sebelum menirunya.
 *
 * 1. RAHASIANYA WAJIB, tidak ada nilai cadangan. Kalau `PENGINGAT_ABSEN_SECRET`
 *    kosong, route ini membalas 503 dan TIDAK bekerja. Sengaja tidak diberi
 *    default - pelajaran dari `getSecretKey()` di session.ts yang dulu
 *    diam-diam memakai cadangan yang ada di repo PUBLIK.
 *
 * 2. `src/middleware.ts` (`RUTE_MESIN`) HARUS mengizinkan jalur ini tanpa sesi,
 *    kalau tidak permintaan bot dialihkan ke /login dan yang diterima botnya
 *    halaman HTML berstatus 200 - gagal yang paling sulit ditelusuri.
 *
 * 3. BALASANNYA MEMUAT NAMA PEGAWAI. Itu keputusan user 2026-09-29, diambil
 *    sesudah pertimbangannya disampaikan. Konsekuensinya nyata dan perlu
 *    diingat siapa pun yang menyentuh route ini: rahasia di header adalah
 *    SATU-SATUNYA yang memisahkan daftar nama itu dari siapa pun yang tahu
 *    alamatnya. Jangan tambahkan jalur alternatif, dan jangan longgarkan
 *    perbandingannya.
 *
 * 4. READ-ONLY sepenuhnya: nol tulisan ke database mana pun, nol migrasi.
 *
 * Contoh:
 *   GET /api/pengingat-absen?satker=Biro%20Keuangan%20dan%20Barang%20Milik%20Negara
 *   Header: x-gajihub-secret: <isi PENGINGAT_ABSEN_SECRET>
 */
export async function GET(req: NextRequest) {
  const rahasia = process.env.PENGINGAT_ABSEN_SECRET?.trim();
  if (!rahasia) {
    return Response.json(
      { error: "PENGINGAT_ABSEN_SECRET belum diisi di .env - route ini sengaja mati tanpa itu." },
      { status: 503 }
    );
  }
  if (req.headers.get("x-gajihub-secret") !== rahasia) {
    return Response.json({ error: "Tidak berwenang." }, { status: 401 });
  }

  const satker = req.nextUrl.searchParams.get("satker")?.trim();
  if (!satker) {
    return Response.json({ error: "Parameter satker wajib diisi." }, { status: 400 });
  }

  // BATAS TAP MASUK DARI JADWAL, bukan dari template pesan.
  //
  // Diubah ke "08:20" (dari "08:30") atas permintaan user karena denda keterlambatan 
  // (potongan 0,01% per menit) mulai dihitung tepat setelah 08:30. Pengingat 
  // diatur lebih awal agar pegawai memiliki waktu untuk tap sebelum denda berlaku.
  const batasJam = req.nextUrl.searchParams.get("batas")?.trim() || "08:20";

  // NAMA SATKER DICOCOKKAN PERSIS, bukan `contains`. Pencocokan longgar akan
  // menggabungkan dua unit yang namanya beririsan, dan daftar nama unit lain
  // ikut terkirim ke grup yang salah.
  const roster = await prisma.pegawai.findMany({
    where: { satuanKerja: satker, statusPegawai: "AKTIF" },
    select: { nip: true, nama: true },
    orderBy: { nama: "asc" },
  });
  if (roster.length === 0) {
    return Response.json(
      {
        error: `Tidak ada pegawai AKTIF dengan satuan kerja "${satker}". Nama unit harus PERSIS seperti di data pegawai.`,
      },
      { status: 404 }
    );
  }

  const absen = await ambilAbsenHariIni(roster.map((p) => p.nip));

  // Tanggal & hari dari SERVER e-PRESENSI, bukan dari Node - keduanya bisa beda
  // zona waktu, dan pengingat yang menyebut tanggal kemarin akan melaporkan
  // seluruh unit belum absen dengan tampak yakin.
  const [th, bl, hr] = absen.tanggalServer.split("-").map(Number);
  const tanggal = new Date(Date.UTC(th, bl - 1, hr));
  const indeksHari = tanggal.getUTCDay();
  const tanggalTeks = `${NAMA_HARI[indeksHari]}, ${hr} ${NAMA_BULAN[bl - 1]} ${th}`;

  // `semua=1` mematikan saringan waktu - dipakai kalau memang ingin melihat
  // semua yang belum tap pulang, termasuk yang belum boleh pulang. Bawaannya
  // DISARING, supaya pesan tidak menamai orang yang belum melakukan apa pun
  // yang salah.
  const tampilkanSemua = req.nextUrl.searchParams.get("semua") === "1";

  // TANGGAL MERAH DIAMBIL DARI TABEL, tidak bisa diturunkan dari jadwal.
  // Sabtu & Minggu sudah tertangani sendiri oleh jamPulangWajib yang null,
  // tapi Idul Fitri dan cuti bersama berpindah tiap tahun. Tanpa pemeriksaan
  // ini, pesan checkin pada tanggal merah menyebut nama SELURUH unit - di
  // e-Presensi hari itu memang tidak ada seorang pun yang tap.
  //
  // `tanggal` sudah tengah malam UTC, konvensi yang sama dengan kolomnya.
  const libur = await prisma.hariLiburNasional.findUnique({
    where: { tanggal },
    select: { keterangan: true, cutiBersama: true },
  });

  const daftar = susunDaftarPengingat({
    roster,
    perNip: absen.perNip,
    indeksHari,
    sekarangMenit: tampilkanSemua ? undefined : absen.jamServerMenit,
    hariLibur: libur !== null,
  });

  return Response.json(
    {
      satuanKerja: satker,
      tanggal: absen.tanggalServer,
      tanggalTeks,
      batasJam,
      ringkasan: {
        totalAktif: daftar.totalAktif,
        sudahCheckin: daftar.sudahCheckin,
        berketerangan: daftar.berketerangan,
        belumCheckin: daftar.belumCheckin.length,
        belumCheckout: daftar.belumCheckout.length,
      },
      // Diisi hanya kalau tanggalnya merah. Botnya tidak perlu memeriksanya -
      // kedua pesan sudah null pada hari libur - tapi ini yang menjelaskan
      // KENAPA null, dan itu yang dicari orang saat mengira botnya mati.
      hariLibur: libur ? { keterangan: libur.keterangan, cutiBersama: libur.cutiBersama } : null,
      catatan: {
        // NIP tanpa padanan di SIAP tidak punya jembatan ke e-Presensi, jadi
        // ketukannya tidak akan pernah terbaca - orangnya akan selalu masuk
        // daftar "belum checkin". Dilaporkan, tidak disembunyikan.
        nipTanpaPadananSiap: absen.nipTanpaPadananSiap.length,
      },
      // null = tidak ada yang perlu diingatkan. Botnya WAJIB memeriksa null dan
      // tidak mengirim apa pun - pesan berisi daftar kosong mengajari orang
      // mengabaikan pengingat ini.
      pesanCheckin: pesanCheckin({ tanggalTeks, batasJam, d: daftar }),
      pesanCheckout: pesanCheckout({ tanggalTeks, d: daftar }),
    },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
