import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import type { PegawaiAdkHarian } from "../../../../business-logic/adkHarian";
import { responseAdkHarian } from "../responseAdk";
import { ALASAN_UANG_LEMBUR_DISEMBUNYIKAN, TAMPILKAN_ADK_LEMBUR } from "../../../tampilUangLembur";
import { bacaJenisPegawai, labelJenisPegawai, wherePegawaiJenis } from "../jenisPegawaiAdk";
import { slugSatker } from "../slugSatker";

/**
 * Export ADK Uang Lembur - dua format (.xlsx & .txt).
 *
 * FORMATNYA DIGANTI TOTAL (2026-08-10) setelah user mengirim template asli
 * `Template-ADK-Lembur.xlsm` + `Template-ADK-Lembur-txt.txt`.
 *
 * Catatan lama di file ini ("format asli per-HARI dengan kolom JHARI1..JHARI31,
 * sementara skema cuma simpan total sebulan, jadi tidak dibuat") sekarang
 * SUDAH TIDAK BERLAKU pada dua hal:
 *   1. Formatnya BUKAN JHARI1..31. Yang disetor bentuk panjang:
 *      `NIP <tab> YYYY-MM-DD <tab> jumlah jam`, satu baris per hari lembur.
 *      Kolom JHARI1..31 itu tampilan grid di sheet entri operator, bukan
 *      muatan filenya.
 *   2. Rincian per hari sekarang ADA - `PresensiHarian.jamLembur` (migrasi
 *      20260810000000). Angkanya sudah lama dihitung per hari oleh
 *      rekapDariLaporanPdf(), cuma dulu dibuang setelah dijumlahkan.
 *
 * PERINGATAN ISI (bukan soal format) - baca sebelum memakai file ini:
 * Gajihub menghitung lembur HANYA dari baris berstatus "Lembur" di e-Presensi.
 * Di lapangan, lembur HARI KERJA hampir tidak pernah ditandai begitu - pegawai
 * tercatat WFO lalu pulang malam. Sepanjang Juni 2026 se-kementerian cuma ada
 * 21 baris berstatus Lembur di hari kerja (12 di antaranya di tanggal merah),
 * sementara file ADK asli SATU unit saja memuat 109 baris lembur hari kerja.
 * Jadi file yang dihasilkan di sini akan JAUH lebih sedikit dari yang
 * sebenarnya diajukan. Sumber sahnya adalah surat perintah lembur, yang tidak
 * ada di database manapun - lihat catatan di halaman /ppabp/adk.
 */
export async function GET(req: NextRequest) {
  // Gerbang PALING LUAR - sebelum sesi pun dibaca.
  //
  // Kartu unduhnya sudah dilepas dari /ppabp/adk, tapi melepas tombol tidak
  // menutup URL: siapa pun yang pernah mengunduh file ini punya tautannya di
  // riwayat browser, dan tautan itu tetap bekerja. Bedanya dengan permukaan
  // lain bukan soal kerapian - di sini yang lolos bukan angka yang salah
  // dikutip, melainkan angka yang belum disetujui MASUK ke Web Gaji.
  //
  // 409 Conflict, bukan 403: yang menolak bukan wewenang orangnya, melainkan
  // keadaan datanya. PPABP yang sama akan berhasil begitu saklarnya dibuka.
  if (!TAMPILKAN_ADK_LEMBUR) {
    return new Response(ALASAN_UANG_LEMBUR_DISEMBUNYIKAN, { status: 409 });
  }

  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canGenerateAdk(authUser)) return new Response("Tidak berwenang.", { status: 403 });

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  // Penyaringan PNS/P3K, sama seperti dua ADK lainnya. Gerbang isinya di
  // sini masih `status: "APPROVED"` - route ini memang belum ikut pindah ke
  // gerbang pengiriman unit, karena ADK Uang Lembur sedang tidak berfungsi
  // (lihat TAMPILKAN_ADK_LEMBUR di atas).
  const jenisPegawai = bacaJenisPegawai(req.nextUrl.searchParams.get("jenis"));
  const satkerDiminta = req.nextUrl.searchParams.get("satker");
  const rows = await prisma.uangLembur.findMany({
    where: {
      periodeBulan: bulan,
      periodeTahun: tahun,
      status: "APPROVED",
      pegawai: {
        ...wherePegawaiJenis(jenisPegawai),
        ...(satkerDiminta ? { satuanKerja: satkerDiminta } : {}),
      },
    },
    include: { pegawai: { select: { id: true, nip: true, nama: true } } },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
  const akhir = new Date(Date.UTC(tahun, bulan, 1));
  const harian = await prisma.presensiHarian.findMany({
    where: {
      pegawaiId: { in: rows.map((r) => r.pegawai.id) },
      tanggal: { gte: awal, lt: akhir },
      jamLembur: { gt: 0 },
    },
    select: { pegawaiId: true, tanggal: true, jamLembur: true },
    orderBy: { tanggal: "asc" },
  });

  const perPegawai = new Map<string, { tanggalIso: string; jam: number }[]>();
  for (const h of harian) {
    const arr = perPegawai.get(h.pegawaiId) ?? [];
    arr.push({ tanggalIso: h.tanggal.toISOString().slice(0, 10), jam: h.jamLembur });
    perPegawai.set(h.pegawaiId, arr);
  }

  const pegawai: PegawaiAdkHarian[] = rows.map((r) => ({
    nip: r.pegawai.nip,
    nama: r.pegawai.nama,
    hari: perPegawai.get(r.pegawai.id) ?? [],
  }));

  // Berkas ADK adalah PERINTAH BAYAR yang keluar dari sistem ini menuju Web
  // Gaji/SAKTI. Sampai sebelum ini pengunduhannya TIDAK tercatat sama sekali -
  // jadi pertanyaan "siapa yang menarik berkas pembayaran periode ini, kapan"
  // tidak punya jawaban. Dicatat SETELAH otorisasi lolos & sebelum berkasnya
  // dikirim.
  //
  // satuanKerja NULL: berkas ini memuat SEMUA unit yang barisnya sudah
  // disetujui, jadi memang bukan aktivitas satu unit.
  await prisma.auditTrail.create({
    data: {
      entitas: "export_adk",
      entitasId: `uang-lembur-${bulan}-${tahun}`,
      aksi: "EXPORT",
      aktor: akun.nip,
      satuanKerja: null,
      dataSesudah: {
        jenis: "Uang Lembur",
        periode: `${bulan}/${tahun}`,
        format: req.nextUrl.searchParams.get("format") ?? "xlsx",
        jenisPegawai: labelJenisPegawai(jenisPegawai),
        satuanKerja: satkerDiminta ?? "semua unit",
        jumlahPegawai: pegawai.length,
      },
    },
  });

  return responseAdkHarian({
    format: req.nextUrl.searchParams.get("format"),
    pegawai,
    periodeBulan: bulan,
    periodeTahun: tahun,
    denganJam: true,
    namaFile: `adk-uang-lembur-${String(bulan).padStart(2, "0")}-${tahun}${slugSatker(satkerDiminta)}${
      jenisPegawai ? `-${jenisPegawai.toLowerCase()}` : ""
    }`,
  });
}
