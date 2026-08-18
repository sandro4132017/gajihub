import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import { responseAdkHarian } from "../responseAdk";
import { dataUangMakanHarian } from "../dataUangMakanHarian";

/**
 * Export ADK Uang Makan - dua format (.xlsx & .txt).
 *
 * FORMATNYA DIGANTI TOTAL (2026-08-10) setelah user mengirim template asli
 * `Template-ADK-UM.xlsm` + `Template-ADK-UM-TXT.txt`. Versi sebelumnya
 * mengeluarkan tabel rekap berisi rupiah (Hari Kerja | Hari Dibayar | Tarif |
 * Total) dengan baris TOTAL di akhir - bentuk yang dikarang sendiri waktu
 * contoh filenya belum ada, dan tidak akan diterima Web Gaji.
 *
 * Bentuk yang benar: SATU BARIS PER PEGAWAI PER HARI, isinya cuma
 * `NIP <tab> YYYY-MM-DD`. Tanpa rupiah, tanpa tarif, tanpa total, tanpa
 * header. Web Gaji yang menghitung nominalnya dari grade pegawai - file ini
 * cuma menyetorkan FAKTA hari mana saja pegawai berhak.
 *
 * SUMBER HARINYA = `PresensiHarian`, bukan `UangMakan.jumlahHariDibayar`.
 * Angka bulanan tidak bisa dipecah balik jadi tanggal-tanggal tanpa mengarang
 * data. Keduanya tetap dicocokkan lewat `selisih` di `dataUangMakanHarian()`,
 * dan selisihnya ditampilkan di halaman /ppabp/adk sebelum berkasnya diunduh.
 *
 * DIVERIFIKASI ke file asli Juni 2026 (137 pegawai, 2.097 baris): aturan
 * "WFO/WFH/WFA di hari kerja" mereproduksi **130 dari 137 pegawai sama
 * persis**, selisihnya 13 tanggal - semuanya kasus Dinas Luar & Cuti yang
 * memang beda perlakuan (lihat catatan di halaman /ppabp/adk).
 */
export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };
  if (!canGenerateAdk(authUser)) return new Response("Tidak berwenang.", { status: 403 });

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });

  // Barisnya disusun di modul bersama - halaman /ppabp/adk memakai fungsi yang
  // SAMA untuk pratinjaunya, jadi yang dilihat di layar dan yang diunduh tidak
  // bisa berbeda.
  const { pegawai } = await dataUangMakanHarian(bulan, tahun);

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
      entitasId: `uang-makan-${bulan}-${tahun}`,
      aksi: "EXPORT",
      aktor: akun.nip,
      satuanKerja: null,
      dataSesudah: {
        jenis: "Uang Makan",
        periode: `${bulan}/${tahun}`,
        format: req.nextUrl.searchParams.get("format") ?? "xlsx",
      },
    },
  });

  return responseAdkHarian({
    format: req.nextUrl.searchParams.get("format"),
    pegawai,
    periodeBulan: bulan,
    periodeTahun: tahun,
    denganJam: false,
    namaFile: `adk-uang-makan-${String(bulan).padStart(2, "0")}-${tahun}`,
  });
}
