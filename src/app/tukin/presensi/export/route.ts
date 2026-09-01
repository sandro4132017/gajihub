import { NextRequest } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionAccount } from "../../../../auth/getSessionAccount";
import { canExportRekapUnit } from "../../../../auth/permissions";
import { susunRekapPresensiExcel } from "../../../../business-logic/rekapUnitExcel";
import { responseRekapExcel } from "../../../responseRekapExcel";
import { NAMA_BULAN } from "../../../bulan";

/**
 * Unduh rekap presensi satu unit untuk satu periode, sebagai Excel.
 *
 * Isinya PERSIS kolom yang sudah tampil di `/tukin/presensi` - tidak ada
 * kolom tambahan. Gunanya buat Kasubag TU: mengarsip, dan mengadu ulang dengan
 * rincian manual petugas atau web e-Presensi tanpa menyalin satu per satu.
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

  // KASUBAG_TU DIPAKSA ke unitnya sendiri - `?satker=` dari luar diabaikan,
  // bukan sekadar tidak ditampilkan. Ini titik yang paling menentukan di
  // seluruh route: tanpa baris ini, siapa pun yang tahu nama unit lain bisa
  // mengunduh rekap unit itu hanya dengan mengubah URL, tanpa menyentuh UI.
  // Pola yang sama dipakai halaman /tukin/presensi dan approval massal.
  const satkerWajib = authUser.role === "KASUBAG_TU" ? authUser.satuanKerja : null;
  const satkerEfektif = satkerWajib ?? (req.nextUrl.searchParams.get("satker")?.trim() || null);
  if (!satkerEfektif) {
    return new Response("Pilih satuan kerja dulu sebelum mengunduh.", { status: 400 });
  }
  if (!canExportRekapUnit(authUser, satkerEfektif)) {
    return new Response("Tidak berwenang mengunduh rekap unit ini.", { status: 403 });
  }

  // Pencarian yang sedang aktif IKUT TERBAWA. Tombolnya berdiri persis di atas
  // tabel, jadi yang diunduh harus sama dengan yang terlihat - kalau orang
  // sedang menyaring "Budi" lalu mendapat berkas berisi 80 orang, dia tidak
  // akan menyadarinya sampai berkas itu sudah dikirim ke orang lain. Prinsip
  // yang sama dipakai paginasi halaman ini.
  const q = req.nextUrl.searchParams.get("q")?.trim();

  const rows = await prisma.rekapPresensiPeriode.findMany({
    where: {
      periodeBulan: bulan,
      periodeTahun: tahun,
      pegawai: {
        satuanKerja: satkerEfektif,
        ...(q ? { OR: [{ nama: { contains: q, mode: "insensitive" as const } }, { nip: { contains: q } }] } : {}),
      },
    },
    include: { pegawai: { select: { nip: true, nama: true, jabatan: true, golongan: true } } },
    orderBy: { pegawai: { nama: "asc" } },
  });

  const rekap = susunRekapPresensiExcel(
    rows.map((r) => ({
      nip: r.pegawai.nip,
      nama: r.pegawai.nama,
      jabatan: r.pegawai.jabatan,
      golongan: r.pegawai.golongan,
      jumlahHariKerja: r.jumlahHariKerja,
      jumlahHariHadir: r.jumlahHariHadir,
      jumlahHariWfo: r.jumlahHariWfo,
      jumlahHariWfhWfa: r.jumlahHariWfhWfa,
      jumlahHariDiklat: r.jumlahHariDiklat,
      jumlahHariDinasLuar: r.jumlahHariDinasLuar,
      jumlahHariTugasBelajar: r.jumlahHariTugasBelajar,
      jumlahHariAlpha: r.jumlahHariAlpha,
      jumlahTidakPresensi: r.jumlahTidakPresensi,
      totalMenitTerlambat: r.totalMenitTerlambat,
      totalMenitPulangCepat: r.totalMenitPulangCepat,
      totalMenitMeninggalkanKantor: r.totalMenitMeninggalkanKantor,
      jumlahTidakIkutUpacara: r.jumlahTidakIkutUpacara,
      jenisCutiAktif: r.jenisCutiAktif,
      bulanCutiKeberapa: r.bulanCutiKeberapa,
      jumlahHariCuti: r.jumlahHariCuti,
      totalJamLembur: r.totalJamLembur,
      totalJamLemburHariLibur: r.totalJamLemburHariLibur,
      jumlahHariMakanLembur: r.jumlahHariMakanLembur,
      jumlahHariMakanLemburHariLibur: r.jumlahHariMakanLemburHariLibur,
    }))
  );

  return responseRekapExcel({
    rekap,
    namaSheet: "Rekap Presensi",
    namaFile: `rekap-presensi-${namaBerkas(satkerEfektif)}-${NAMA_BULAN[bulan - 1]}-${tahun}`,
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
