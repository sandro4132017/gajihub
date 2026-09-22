import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canGenerateAdk } from "../../../../auth/permissions";
import { responseAdkHarian } from "../responseAdk";
import { berkasAdkLemburXlsx } from "../berkasAdkLembur";
import { dataUangLemburHarian } from "../dataUangLemburHarian";
import { bacaJenisPegawai, labelJenisPegawai } from "../jenisPegawaiAdk";
import { slugSatker } from "../slugSatker";

/**
 * Export ADK Uang Lembur - dua format (.xlsx & .txt).
 *
 * FORMATNYA dari template asli `Excel/Template-ADK-Lembur.xlsm` +
 * `Excel/Template-ADK-Lembur-txt.txt` (dan berkas sungguhan
 * `ADK-Lembur Peg.Rokeu_Juni 2026.xlsm`, 111 entri / 35 pegawai):
 *
 *   NIP <tab> YYYY-MM-DD <tab> jumlah jam
 *
 * satu baris per hari lembur, tanpa header, tanpa baris total, CRLF. Kolom
 * JHARI1..JHARI31 yang sempat disangka formatnya itu GRID ENTRI operator di
 * sheet "depan", bukan muatan berkasnya - sheet "hasil" yang disetor, dan
 * isinya sama persis dengan versi TXT.
 *
 * DUA HAL YANG BERUBAH 2026-09-22, dan keduanya mencabut catatan lama di file
 * ini:
 *
 * 1. GERBANG ISINYA. Dulu `status: "APPROVED"` per baris - gerbang yang sudah
 *    tidak berlaku sejak approval berjenjang dihapus (2026-09-02), sehingga
 *    berkas ini SELALU kosong. Sekarang gerbangnya PENGIRIMAN UNIT, sama
 *    persis dengan ADK Tukin & Uang Makan (lihat ../satkerTerkirim.ts).
 *
 * 2. SUMBER JAMNYA. Catatan lama - "Gajihub menghitung lembur HANYA dari baris
 *    berstatus Lembur di e-Presensi, jadi berkas ini akan JAUH lebih sedikit
 *    dari yang sebenarnya diajukan" - sudah tidak berlaku sejak 2026-09-18.
 *    Lembur hari kerja sekarang diturunkan dari KETUKAN (jam pulang dikurangi
 *    batas kewajiban 7,5 jam), yang memang cara lembur hari kerja tercatat di
 *    lapangan. Sebabnya terukur: Juli 2026 punya 459 baris ber-status Lembur
 *    di e-Presensi dan SEMUANYA di akhir pekan, nol di hari kerja, sementara
 *    berkas ADK asli Juni 2026 justru 109 dari 111 entrinya di hari kerja.
 *
 * YANG TETAP BERLAKU: berkas ini berisi jam TERHITUNG, bukan hak bayar. Yang
 * mengesahkan lembur adalah SURAT PERINTAH LEMBUR - dokumen resmi di luar
 * sistem ini - dan petugas yang mengadu berkas ini kepadanya sebelum
 * dibayarkan. Lihat catatan di halaman /ppabp/adk.
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
  // SAMA untuk ringkasan & panel peringatannya, jadi yang dilihat di layar dan
  // yang diunduh tidak bisa berbeda.
  const jenisPegawai = bacaJenisPegawai(req.nextUrl.searchParams.get("jenis"));
  const satkerDiminta = req.nextUrl.searchParams.get("satker");
  const { pegawai, totalBaris, totalJam } = await dataUangLemburHarian(
    bulan,
    tahun,
    satkerDiminta,
    jenisPegawai
  );

  // Berkas ADK adalah PERINTAH BAYAR yang keluar dari sistem ini menuju Web
  // Gaji/SAKTI. Dicatat SETELAH otorisasi lolos & sebelum berkasnya dikirim.
  //
  // satuanKerja NULL: berkas ini memuat SEMUA unit yang sudah mengirim, jadi
  // memang bukan aktivitas satu unit.
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
        satuanKerja: satkerDiminta ?? "semua unit terkirim",
        jumlahPegawai: pegawai.length,
        // Jumlah baris & jam ikut dicatat: inilah yang benar-benar dibayar Web
        // Gaji, dan tanpa angkanya di jejak audit tidak ada cara memeriksa
        // ulang berapa jam yang pernah disetorkan untuk satu periode.
        jumlahBaris: totalBaris,
        totalJam,
      },
    },
  });

  const namaFile = `adk-uang-lembur-${String(bulan).padStart(2, "0")}-${tahun}${slugSatker(satkerDiminta)}${
    jenisPegawai ? `-${jenisPegawai.toLowerCase()}` : ""
  }`;

  // JALUR .xlsx BEDA DARI DUA ADK LAIN, dan sengaja: berkasnya diisi ke
  // CETAKAN ASLI operator supaya warna, perataan, lebar kolom, dan formulanya
  // sama persis. Lihat alasan lengkapnya di ../berkasAdkLembur.ts - ringkasnya,
  // pustaka yang menyusun workbook dari nol tidak bisa menulis gaya sel sama
  // sekali.
  //
  // .txt TETAP lewat jalur bersama: berkas teks tidak punya gaya, jadi
  // menduplikasi penyusunnya cuma menambah tempat yang bisa berbeda.
  const format = req.nextUrl.searchParams.get("format");
  if (format !== "txt") {
    const buffer = await berkasAdkLemburXlsx(pegawai, bulan, tahun);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${namaFile}.xlsx"`,
      },
    });
  }

  return responseAdkHarian({
    format,
    pegawai,
    periodeBulan: bulan,
    periodeTahun: tahun,
    denganJam: true,
    namaFile,
  });
}
