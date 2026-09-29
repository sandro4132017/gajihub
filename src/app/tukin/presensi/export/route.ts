import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canExportRekapUnit } from "../../../../auth/permissions";
import {
  FORMAT_TANGGAL_PENUH,
  FORMAT_TANGGAL_RINGKAS,
  HEADER_EXPORT_PRESENSI_HARIAN,
  susunExportPresensiHarian,
} from "../../../../business-logic/exportPresensiHarian";
import { NAMA_BULAN } from "../../../bulan";

/**
 * Unduh presensi satu unit untuk satu periode, sebagai Excel.
 *
 * BENTUKNYA DIGANTI 2026-09-29 mengikuti template baru dari user
 * (`Template_export_presensi_kasubagTU.xlsx`): dari satu baris per PEGAWAI
 * berisi total sebulan, menjadi **satu baris per pegawai per HARI**.
 *
 * Sembilan kolom, nama & urutannya dikunci template - termasuk "Full tanggal"
 * yang berhuruf besar & berspasi sementara sisanya snake_case. Itu bukan untuk
 * dirapikan: berkasnya dibaca ulang oleh lembar kerja milik Kasubag TU, dan
 * mengganti nama kolom mematahkan rumus di lembar itu tanpa pesan galat.
 *
 * `susunRekapPresensiExcel()` di `rekapUnitExcel.ts` TIDAK DIPAKAI LAGI oleh
 * route ini. Fungsinya sengaja dibiarkan ada dulu - menghapusnya keputusan
 * user, bukan saya. `susunRekapTukinExcel()` di berkas yang sama tetap dipakai
 * `/kasubag/kalkulasi/export` dan tidak tersentuh.
 *
 * PAKAI exceljs, BUKAN `responseRekapExcel()`. Template ini butuh format angka
 * per kolom (`yyyy-mm-dd` dan `[$-13809]dddd, dd mmmm yyyy`), dan pustaka
 * `xlsx` MEMBUANG gaya sel saat menulis - sudah diuji dan dicatat di
 * `berkasAdkLembur.ts`. Tanpa format itu, kolom tanggal keluar sebagai angka
 * seri Excel (mis. 45357) dan berkasnya tidak terbaca orang.
 *
 * DIBANGUN DARI NOL, tidak mengisi berkas templatenya. Folder `Excel/`
 * ter-gitignore jadi templatenya tidak ada di VPS, dan berkas itu memuat nama
 * pegawai asli di baris contohnya - menyalinnya ke folder yang ikut ter-push
 * berarti menerbitkan data pribadi. Yang dibutuhkan dari template cuma teks
 * header dan dua format tanggal, dan keduanya sudah diukur langsung.
 *
 * BUKAN berkas ADK. Yang disetor ke Web Gaji tetap lewat /ppabp/adk/* dengan
 * izin `canGenerateAdk` (PPABP/ADMIN) - lihat catatan di `canExportRekapUnit`.
 *
 * Route Handler, bukan Server Action, supaya bisa jadi `<a href>` biasa yang
 * langsung mengunduh tanpa JavaScript - pola sama dengan route ADK.
 */
export async function GET(req: NextRequest) {
  const akun = await getSessionAccount();
  if (!akun) return new Response("Belum login.", { status: 401 });
  const authUser = { nip: akun.nip, role: akun.role, satuanKerja: akun.satuanKerja, aktif: true };

  const bulan = Number(req.nextUrl.searchParams.get("bulan"));
  const tahun = Number(req.nextUrl.searchParams.get("tahun"));
  if (!bulan || !tahun) return new Response("Parameter bulan dan tahun wajib diisi.", { status: 400 });
  if (bulan < 1 || bulan > 12) return new Response("Bulan harus 1-12.", { status: 400 });

  // KASUBAG_TU DIPAKSA ke unitnya sendiri - `?satker=` dari luar diabaikan,
  // bukan sekadar tidak ditampilkan. Ini titik yang paling menentukan di
  // seluruh route: tanpa baris ini, siapa pun yang tahu nama unit lain bisa
  // mengunduh presensi unit itu hanya dengan mengubah URL, tanpa menyentuh UI.
  // Pola yang sama dipakai halaman /tukin/presensi dan approval massal.
  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  const satkerEfektif = satkerWajib ?? (req.nextUrl.searchParams.get("satker")?.trim() || null);
  if (!satkerEfektif) {
    return new Response("Pilih satuan kerja dulu sebelum mengunduh.", { status: 400 });
  }
  if (!canExportRekapUnit(authUser, satkerEfektif)) {
    return new Response("Tidak berwenang mengunduh presensi unit ini.", { status: 403 });
  }

  // Pencarian yang sedang aktif IKUT TERBAWA. Tombolnya berdiri persis di atas
  // tabel, jadi yang diunduh harus sama dengan yang terlihat - kalau orang
  // sedang menyaring satu nama lalu mendapat berkas berisi 80 orang, dia tidak
  // akan menyadarinya sampai berkas itu sudah dikirim ke orang lain.
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const awal = new Date(Date.UTC(tahun, bulan - 1, 1));
  const akhir = new Date(Date.UTC(tahun, bulan, 1));

  const rows = await prisma.presensiHarian.findMany({
    where: {
      tanggal: { gte: awal, lt: akhir },
      pegawai: {
        satuanKerja: satkerEfektif,
        ...(q
          ? { OR: [{ nama: { contains: q, mode: "insensitive" as const } }, { nip: { contains: q } }] }
          : {}),
      },
    },
    include: { pegawai: { select: { nama: true } } },
    // Nama dulu lalu tanggal: berkas ini dibaca per orang, bukan per hari.
    // Urutannya ditentukan DI SINI, bukan di modul penyusunnya - yang tahu
    // urutan yang berguna adalah query-nya.
    orderBy: [{ pegawai: { nama: "asc" } }, { tanggal: "asc" }],
  });

  const baris = susunExportPresensiHarian(
    rows.map((r) => ({
      nama: r.pegawai.nama,
      statusKehadiran: r.statusKehadiran,
      namaSistemKerja: r.namaSistemKerja,
      tanggal: r.tanggal,
      jamMasuk: r.jamMasuk,
      jamKeluar: r.jamKeluar,
      menitTerlambat: r.menitTerlambat,
      menitPulangCepat: r.menitPulangCepat,
      tidakIkutUpacara: r.tidakIkutUpacara,
    }))
  );

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow([...HEADER_EXPORT_PRESENSI_HARIAN]);

  for (const b of baris) {
    ws.addRow([
      b.namaPegawai,
      b.namaSistemKerja,
      b.tanggal,
      // NILAI YANG SAMA, kolom yang beda - dan itu bukan duplikasi yang perlu
      // dirapikan. Kolom C dipakai menyortir & menyaring, kolom D dibaca
      // manusia ("Jumat, 06 Maret 2024"). Formatnya dipasang di bawah.
      b.tanggal,
      b.jamMasuk,
      b.jamKeluar,
      // DIHITUNG dari jam masuk & keluar (dikurangi istirahat), bukan diambil
      // dari e-Presensi - lihat `menitKerjaHarian()`. null dibiarkan null
      // supaya selnya KOSONG, bukan 0: nol berarti "masuk dan pulang di jam
      // yang sama", sementara kosong berarti salah satu ketukannya tidak ada.
      b.menitKerja,
      b.jumlahPotongan,
      b.keterangan,
    ]);
  }

  // Format tanggal dipasang PER KOLOM, sesudah semua baris ditulis - kalau
  // dipasang per sel di dalam loop, biayanya sejumlah baris dan berkas belasan
  // ribu baris terasa lambat tanpa sebab yang kelihatan.
  ws.getColumn(3).numFmt = FORMAT_TANGGAL_RINGKAS;
  ws.getColumn(4).numFmt = FORMAT_TANGGAL_PENUH;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="presensi-${namaBerkas(satkerEfektif)}-${
        NAMA_BULAN[bulan - 1]
      }-${tahun}.xlsx"`,
      // Memuat nama pegawai satu unit beserta hari alpha-nya - jangan sampai
      // tersimpan di cache proxy bersama.
      "Cache-Control": "private, no-store",
    },
  });
}

/** Nama unit jadi potongan nama berkas yang aman di semua sistem berkas. */
function namaBerkas(teks: string): string {
  return teks
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
