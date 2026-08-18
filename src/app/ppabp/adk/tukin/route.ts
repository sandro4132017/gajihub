import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import {
  KOLOM_ADK_TUKIN,
  KOLOM_TOTAL_ADK_TUKIN,
  susunBarisAdkTukin,
  susunBarisTotalAdk,
} from "../../../../business-logic/adk";
import { TUKIN_POKOK_PER_KELAS_JABATAN } from "../../../../business-logic/tarifTukinPokok";
import { kelasJabatanEfektif } from "../../../../business-logic/kelasJabatanEfektif";
import { responseAdk } from "../responseAdk";

/**
 * Export ADK Tunjangan Kinerja - baris TukinCalculation yang SUDAH APPROVED
 * untuk periode tertentu, siap diunggah manual ke Web Gaji (belum ada API
 * resmi, lihat CLAUDE.md).
 *
 * DUA FORMAT lewat query `?format=`:
 *   - `xlsx` (default) - Excel sungguhan, sheet "daftar bayar" seperti file
 *     contoh. Dulu route ini mengeluarkan CSV, bukan Excel.
 *   - `txt` - teks tab-separated, sama seperti hasil "save as text" dari file
 *     contoh, lengkap dengan baris TOTAL di akhir.
 * Barisnya disusun SEKALI di src/business-logic/adk.ts, jadi kedua format
 * mustahil berbeda isi.
 *
 * PEMISAHAN PER BANK lewat query `?bank=<kode bank SPAN>`: SAKTI SPP hanya
 * bisa memproses SPP per bank, jadi satu file berisi campuran bank tidak
 * terpakai. Tanpa parameter `bank`, semua bank ikut dalam satu file (masih
 * berguna buat pengecekan/rekonsiliasi internal).
 *
 * Tetap Route Handler (bukan Server Action) supaya bisa jadi `<a href>` biasa
 * yang langsung mengunduh tanpa JavaScript.
 */
export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canGenerateAdk(authUser)) return new Response("Tidak berwenang.", { status: 403 });

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  const rows = await prisma.tukinCalculation.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, status: "APPROVED" },
    include: { pegawai: true },
    orderBy: { pegawai: { nama: "asc" } },
  });

  // Kode satker resmi diambil dari gaji induk periode yang sama - itu
  // satu-satunya sumbernya di sistem ini (hasil upload ADK gaji GPP, lihat
  // GajiInduk.kodeSatker). Kalau periode itu belum diupload, kolomnya
  // dikosongkan, TIDAK ditebak.
  const gajiInduk = await prisma.gajiInduk.findMany({
    where: { periodeBulan: bulan, periodeTahun: tahun, pegawaiId: { in: rows.map((r) => r.pegawaiId) } },
    select: { pegawaiId: true, kodeSatker: true },
  });
  const petaKodeSatker = new Map(gajiInduk.map((g) => [g.pegawaiId, g.kodeSatker]));

  // --- Nama & kode satker versi WEB GAJI KEMENKEU ---
  // Nama di berkas pembayaran HARUS pakai penulisan yang dikenali Web Gaji,
  // bukan `Pegawai.nama` yang merupakan cermin SIAP - terukur berbeda pada
  // 77% pegawai, umumnya karena gelar. Lihat model IdentitasWebGaji.
  //
  // Pegawai yang belum tercakup berkas Web Gaji JATUH KE nama SIAP: berkas
  // pembayaran tidak boleh punya baris tanpa nama, dan mengosongkannya bukan
  // pilihan yang lebih aman. Jumlahnya ditampilkan di /ppabp/adk dan
  // /ppabp/basis-data-gaji supaya bisa diperiksa sebelum berkas dikirim.
  const identitas = await prisma.identitasWebGaji.findMany({
    where: { pegawaiId: { in: rows.map((r) => r.pegawaiId) } },
    select: { pegawaiId: true, nama: true, kodeSatker: true },
  });
  const petaIdentitas = new Map(identitas.map((i) => [i.pegawaiId, i]));

  // Rekening penerima TUKIN - jenis "TUKIN", BUKAN dari gaji induk. Tukin &
  // gaji memakai bank berbeda dan tidak ada satupun rekening yang sama.
  const rekening = await prisma.rekeningPegawai.findMany({
    where: { jenisPembayaran: "TUKIN", pegawaiId: { in: rows.map((r) => r.pegawaiId) } },
  });
  const petaRekening = new Map(rekening.map((r) => [r.pegawaiId, r]));

  // Kelas jabatan EFEKTIF - pegawai yang sedang menjalani penurunan jabatan
  // (PP 94/2021) dibayar dengan tarif kelas yang turun, dan Nilai Bruto di
  // file ADK harus memakai tarif yang sama dengan yang dipakai menghitung.
  // Kalau di sini tetap kelas SIAP, brutonya lebih besar dari yang seharusnya
  // dan potongannya jadi kelihatan menggelembung.
  const skHukdis = await prisma.skHukumanDisiplin.findMany({
    where: {
      pegawaiId: { in: rows.map((r) => r.pegawaiId) },
      status: "DISETUJUI",
      kelasJabatanSelamaHukuman: { not: null },
    },
  });
  const skPerPegawai = new Map<string, typeof skHukdis>();
  for (const sk of skHukdis) skPerPegawai.set(sk.pegawaiId, [...(skPerPegawai.get(sk.pegawaiId) ?? []), sk]);

  // SAKTI SPP memproses per bank, jadi file bisa dipisah lewat ?bank=<kode>.
  // Tanpa parameter itu, semua bank ikut dalam satu file.
  const bankDiminta = req.nextUrl.searchParams.get("bank");
  const rowsTerpakai = bankDiminta
    ? rows.filter((r) => petaRekening.get(r.pegawaiId)?.kodeBankSpan === bankDiminta)
    : rows;

  const baris = susunBarisAdkTukin(
    rowsTerpakai.map((r) => {
      const rek = petaRekening.get(r.pegawaiId);
      const efektif = kelasJabatanEfektif(
        r.pegawai.kelasJabatan,
        skPerPegawai.get(r.pegawaiId) ?? [],
        bulan,
        tahun
      );
      return {
        nip: r.pegawai.nip,
        nama: petaIdentitas.get(r.pegawaiId)?.nama ?? r.pegawai.nama,
        kelasJabatan: efektif.kelas,
        // Tarif PENUH kelas jabatannya, bukan `tukinPokok` yang tersimpan -
        // kolom itu sudah nilai SETELAH potongan. Lihat nilaiUangAdkTukin().
        tarifPenuhKelasJabatan:
          efektif.kelas === null ? null : (TUKIN_POKOK_PER_KELAS_JABATAN[efektif.kelas] ?? null),
        tukinBersih: r.tukinBersih,
        // Gaji induk periode ini didahulukan (paling dekat ke pembayaran yang
        // sedang diproses); kalau periodenya belum diunggah, dipakai kode
        // satker dari basis data gaji yang tidak terikat periode.
        kodeSatker: petaKodeSatker.get(r.pegawaiId) ?? petaIdentitas.get(r.pegawaiId)?.kodeSatker ?? null,
        kodeBankSpan: rek?.kodeBankSpan ?? null,
        namaBank: rek?.namaBank ?? null,
        nomorRekening: rek?.nomorRekening ?? null,
        namaRekening: rek?.namaRekening ?? null,
      };
    }),
    bulan,
    tahun
  );
  const total = susunBarisTotalAdk(baris, KOLOM_TOTAL_ADK_TUKIN, KOLOM_ADK_TUKIN.length);

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
      entitasId: `tukin-${bulan}-${tahun}`,
      aksi: "EXPORT",
      aktor: akun.nip,
      satuanKerja: null,
      dataSesudah: {
        jenis: "Tukin",
        periode: `${bulan}/${tahun}`,
        format: req.nextUrl.searchParams.get("format") ?? "xlsx",
      },
    },
  });

  return responseAdk({
    format: req.nextUrl.searchParams.get("format"),
    header: KOLOM_ADK_TUKIN,
    baris,
    total,
    namaSheet: "daftar bayar",
    namaFile: `adk-tukin-${String(bulan).padStart(2, "0")}-${tahun}${
      bankDiminta ? `-bank-${bankDiminta}` : ""
    }`,
  });
}
